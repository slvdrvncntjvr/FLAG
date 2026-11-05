import type { Db } from "@/server/db";
import { assertChanged, intakeNow } from "@/server/db/queries/logs";
import { proposalGate } from "@/server/db/queries/proposals";
import { proposalInput } from "@/features/moderation/log-schema";
import { failure, idInput, outcomeForRating, type LogResult } from "@/features/logs/schema";
import { objectMatches, type ProofRecord } from "@/features/logs/proof-storage";

export async function saveProposal(db: Db, actorId: string | null, input: unknown, kind: "initial" | "filer_update" = "filer_update"): Promise<LogResult<{ revisionId: string; logId: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success || (kind === "filer_update" && !parsed.data.effectiveOn) || (kind === "initial" && parsed.data.effectiveOn)) return failure("invalid_input");
  const f = parsed.data, v = f.fields, gate = proposalGate(actorId, kind), revisionId = f.revisionId ?? crypto.randomUUID();
  try {
    const list: D1PreparedStatement[] = [db.$client.prepare(`UPDATE engagement_log AS l SET draft_updated_at=${intakeNow} WHERE l.id=? AND l.current_revision_id IS ? AND ${gate.text}
      AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=l.engagement_id AND e.started_on<=?) AND ?<=date('now','+8 hours')
      AND (? IS NULL OR (?<=date('now','+8 hours') AND ?>COALESCE((SELECT MAX(effective_on) FROM log_revision WHERE log_id=l.id AND kind='filer_update' AND decision='approve'),date(l.published_at,'+8 hours'))))`)
      .bind(f.logId, f.expectedCurrentRevisionId, ...gate.args, v.periodStart, v.periodEnd, f.effectiveOn ?? null, f.effectiveOn ?? null, f.effectiveOn ?? null), assertChanged(db)];
    if (!f.revisionId) list.push(db.$client.prepare(`INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,amount_centavos,submitted_by,effective_on,draft_updated_at,moderation_case_id)
      SELECT ?,l.id,(SELECT COALESCE(MAX(rev_no),0)+1 FROM log_revision WHERE log_id=l.id),?,?,?,?,?,?,?,?,?,${intakeNow},
        (SELECT id FROM moderation_case WHERE log_id=l.id AND kind=? AND status='awaiting_changes')
      FROM engagement_log l WHERE l.id=?
        AND NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.log_id=l.id AND r.kind=? AND r.decision IS NULL AND (r.state='draft' OR r.state='submitted'))
        AND NOT EXISTS(SELECT 1 FROM moderation_case c WHERE c.log_id=l.id AND c.kind=? AND c.status IN ('open','claimed'))`)
      .bind(revisionId, kind, v.rating, outcomeForRating(v.rating), v.facts, v.periodStart, v.periodEnd, v.amountCentavos ?? null, actorId, f.effectiveOn ?? null,
        kind === "initial" ? "log" : "filer_update", f.logId, kind, kind === "initial" ? "log" : "filer_update"), assertChanged(db));
    else list.push(db.$client.prepare(`UPDATE log_revision SET rating=?,outcome=?,facts=?,period_start=?,period_end=?,amount_centavos=?,effective_on=?,draft_updated_at=${intakeNow}
      WHERE id=? AND log_id=? AND submitted_by=? AND kind=? AND state='draft' AND decision IS NULL`)
      .bind(v.rating, outcomeForRating(v.rating), v.facts, v.periodStart, v.periodEnd, v.amountCentavos ?? null, f.effectiveOn ?? null, revisionId, f.logId, actorId, kind), assertChanged(db),
      db.$client.prepare("DELETE FROM log_tag WHERE revision_id=?").bind(revisionId), db.$client.prepare("DELETE FROM revision_proof WHERE revision_id=?").bind(revisionId));
    for (const tag of v.tags) list.push(db.$client.prepare("INSERT INTO log_tag(revision_id,tag) VALUES(?,?)").bind(revisionId, tag));
    for (const proofId of f.proofIds) list.push(db.$client.prepare(`INSERT INTO revision_proof(revision_id,proof_id) SELECT ?,id FROM proof_file WHERE id=? AND log_id=? AND owner_kind='filer'
      AND uploaded_by=? AND status='attached' AND purge_inflight=0`).bind(revisionId, proofId, f.logId, actorId), assertChanged(db));
    await db.$client.batch(list);
    return { ok: true, data: { revisionId, logId: f.logId } };
  } catch { return failure("conflict"); }
}

export async function submitProposal(db: Db, bucket: R2Bucket, actorId: string | null, logId: string, revisionId: string): Promise<LogResult<{ logId: string; ref: string }>> {
  if (!actorId) return failure("unauthenticated");
  if (!idInput.safeParse(logId).success || !idInput.safeParse(revisionId).success) return failure("invalid_input");
  try {
    const r = await db.$client.prepare("SELECT r.kind,r.moderation_case_id,r.effective_on,l.current_revision_id FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=? AND r.log_id=? AND r.submitted_by=? AND r.state='draft' AND r.decision IS NULL")
      .bind(revisionId, logId, actorId).first<{ kind: "initial" | "filer_update"; moderation_case_id: string | null; effective_on: string | null; current_revision_id: string | null }>();
    if (!r || !["initial", "filer_update"].includes(r.kind)) return failure("conflict");
    const gate = proposalGate(actorId, r.kind), caseId = r.moderation_case_id ?? crypto.randomUUID();
    const rows = await db.$client.prepare(`SELECT DISTINCT p.* FROM proof_file p WHERE p.log_id=? AND p.owner_kind='filer' AND p.uploaded_by=?
      AND ((p.revision_id=? AND p.status='uploading') OR (p.status='attached' AND EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=?))) ORDER BY p.id`)
      .bind(logId, actorId, revisionId, revisionId).all<ProofRecord>();
    if (rows.results.length < 1 || rows.results.length > 5) return failure("invalid_input");
    for (const p of rows.results) if (!objectMatches(await bucket.head(p.object_key), p)) return failure("conflict");
    const list = [db.$client.prepare(`UPDATE engagement_log AS l SET draft_updated_at=${intakeNow} WHERE id=? AND l.current_revision_id IS ? AND ${gate.text}
      AND (? IS NULL OR (?<=date('now','+8 hours') AND ?>COALESCE((SELECT MAX(effective_on) FROM log_revision WHERE log_id=l.id AND kind='filer_update' AND decision='approve'),date(l.published_at,'+8 hours'))))`)
      .bind(logId, r.current_revision_id, ...gate.args, r.effective_on, r.effective_on, r.effective_on), assertChanged(db)];
    if (!r.moderation_case_id) list.push(db.$client.prepare("INSERT INTO moderation_case(id,kind,subject_id,log_id,status) VALUES(?,?,?,?,'open')").bind(caseId, r.kind === "initial" ? "log" : "filer_update", r.kind === "initial" ? logId : revisionId, logId));
    else list.push(db.$client.prepare("UPDATE moderation_case SET status='open' WHERE id=? AND status='awaiting_changes' AND log_id=?").bind(caseId, logId), assertChanged(db));
    for (const p of rows.results) {
      list.push(db.$client.prepare(`UPDATE proof_file SET status='attached',revision_id=COALESCE(revision_id,?) WHERE id=? AND log_id=? AND status=? AND object_key=? AND sha256=? AND size_bytes=? AND mime=? AND purge_inflight=0`)
        .bind(revisionId, p.id, logId, p.status, p.object_key, p.sha256, p.size_bytes, p.mime), assertChanged(db));
      list.push(db.$client.prepare("INSERT INTO revision_proof(revision_id,proof_id) VALUES(?,?) ON CONFLICT DO NOTHING").bind(revisionId, p.id));
    }
    list.push(db.$client.prepare(`UPDATE log_revision SET state='submitted',submitted_at=${intakeNow},moderation_case_id=? WHERE id=? AND state='draft' AND decision IS NULL`)
      .bind(caseId, revisionId), assertChanged(db));
    if (r.kind === "initial") list.push(db.$client.prepare(`UPDATE engagement_log SET status='pending',submitted_at=${intakeNow} WHERE id=? AND status='ask_changes' AND first_submitted_at IS NOT NULL`)
      .bind(logId), assertChanged(db));
    list.push(db.$client.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'revision_submitted','log_revision',?,?)")
      .bind(crypto.randomUUID(), actorId, revisionId, caseId), db.$client.prepare("SELECT ref FROM engagement_log WHERE id=?").bind(logId));
    const result = await db.$client.batch(list), row = result.at(-1)!.results[0] as { ref: string };
    return { ok: true, data: { logId, ref: row.ref } };
  } catch { return failure("conflict"); }
}
