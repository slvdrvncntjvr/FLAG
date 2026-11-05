import type { Db } from "@/server/db";
import { assertChanged } from "@/server/db/queries/logs";
import { candidateProofs, candidateRevision, caseLease, caseGate, loadReviewCase, type CaseRow } from "@/server/db/queries/reviews";
import { nowSql, statement } from "@/server/db/queries/moderation";
import { failure, outcomeForRating, type LogResult } from "@/features/logs/schema";
import { objectMatches, type ProofRecord } from "@/features/logs/proof-storage";
import { claimInput, leaseInput } from "./schema";
import { correctionReviewInput, logReviewInput, privateReason } from "./log-schema";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { verifyProofView } from "./proof-view-token";
import { contentDeadlineCtes, contentDeadlineSql } from "@/server/db/queries/content-deadlines";
import type { z } from "zod";

export async function claimLogReview(db: Db, actorId: string | null, input: unknown): Promise<LogResult<{ claimUntil: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = claimInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const gate = caseGate(actorId);
  try {
    const result = await db.$client.batch([
      statement(db, `UPDATE moderation_case AS c SET status='claimed',claimed_by=?,claimed_until=strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes')
        WHERE c.id=? AND (c.status='open' OR (c.status='claimed' AND c.claimed_until<=${nowSql})) AND ${gate.text}`,
      [actorId, parsed.data.caseId, ...gate.args]), assertChanged(db),
      statement(db, "INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'moderation_claimed','moderation_case',?,?)", [crypto.randomUUID(), actorId, parsed.data.caseId, parsed.data.caseId]),
      statement(db, "SELECT claimed_until FROM moderation_case WHERE id=?", [parsed.data.caseId]),
    ]);
    const row = result.at(-1)!.results[0] as { claimed_until: string };
    return { ok: true, data: { claimUntil: row.claimed_until } };
  } catch { return failure("conflict"); }
}
export async function releaseLogReview(db: Db, actorId: string | null, input: unknown): Promise<LogResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = leaseInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const gate = caseLease(actorId, parsed.data.expectedClaimUntil);
  try {
    await db.$client.batch([
      statement(db, `UPDATE moderation_case AS c SET status='open',claimed_by=NULL,claimed_until=NULL WHERE c.id=? AND ${gate.text}`, [parsed.data.caseId, ...gate.args]), assertChanged(db),
      statement(db, "INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'moderation_released','moderation_case',?,?)", [crypto.randomUUID(), actorId, parsed.data.caseId, parsed.data.caseId]),
    ]);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}
type Verdict = z.infer<typeof logReviewInput>["proofVerdicts"][number];
// Internal terminal-case validation only: never return these retained metadata
// to a reader or issue a new inspection receipt after content read expiry.
async function retainedCorrectionEvidence(db: Db, c: CaseRow, revisionId: string): Promise<ProofRecord[]> {
  if (c.kind !== "correction") return [];
  const rows = await db.$client.prepare(`SELECT p.* FROM proof_file p
    JOIN log_revision r ON r.id=? AND r.log_id=p.log_id
    WHERE p.log_id=? AND p.status='attached' AND p.purge_inflight=0 AND p.write_inflight=0
    AND (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=r.id)
      OR (p.revision_id=r.id AND p.owner_kind='filer')
      OR (p.correction_request_id=? AND p.owner_kind='client'
        AND EXISTS(SELECT 1 FROM correction_request cr,json_each(cr.active_proof_ids) selected
          WHERE cr.id=p.correction_request_id AND selected.value=p.id))) ORDER BY p.id`)
    .bind(revisionId, c.log_id, c.correction_request_id).all<ProofRecord>();
  return rows.results;
}
async function inspectEvidence(db: Db, bucket: R2Bucket, secret: string, actor: string, c: CaseRow, revisionId: string, lease: string, verdicts: Verdict[], terminalCorrection = false) {
  const proofs = terminalCorrection ? await retainedCorrectionEvidence(db, c, revisionId) : await candidateProofs(db, c, revisionId);
  if (!proofs.length || proofs.length !== verdicts.length || proofs.length > 10) return null;
  const inspected: { proof: ProofRecord; verdict: Verdict; reviewedAt: string }[] = [];
  for (const proof of proofs) {
    const verdict = verdicts.find(v => v.proofId === proof.id && v.sha256 === proof.sha256);
    if (!verdict || !objectMatches(await bucket.head(proof.object_key), proof)) return null;
    const reviewedAt = await verifyProofView(secret, verdict.viewToken, { actorId: actor, caseId: c.id, revisionId, proofId: proof.id, sha256: proof.sha256, objectKey: proof.object_key, size: proof.size_bytes, lease });
    if (!reviewedAt) return null;
    inspected.push({ proof, verdict, reviewedAt });
  }
  return inspected;
}
function subjectGuard(db: Db, actor: string, c: CaseRow, lease: string, revisionId: string, expected: string | null) {
  const gate = caseLease(actor, lease);
  return statement(db, `UPDATE moderation_case AS c SET status=status WHERE c.id=? AND c.kind=? AND ${gate.text}
    AND EXISTS(SELECT 1 FROM engagement_log l JOIN log_revision r ON r.log_id=l.id WHERE l.id=? AND l.current_revision_id IS ? AND r.id=?
      AND (c.kind='correction' OR (r.decision IS NULL AND r.state='submitted'
        AND NOT EXISTS(SELECT 1 FROM log_revision newer WHERE newer.log_id=l.id AND newer.rev_no>r.rev_no AND newer.moderation_case_id=c.id))))`,
  [c.id, c.kind, ...gate.args, c.log_id, expected, revisionId]);
}
function proofGuards(db: Db, c: CaseRow, revisionId: string, checked: NonNullable<Awaited<ReturnType<typeof inspectEvidence>>>) {
  const list: D1PreparedStatement[] = [];
  for (const { proof: p } of checked) list.push(statement(db, `UPDATE proof_file SET status=status WHERE id=? AND log_id=? AND status='attached'
    AND object_key=? AND sha256=? AND size_bytes=? AND mime=? AND purge_inflight=0 AND write_inflight=0`, [p.id, c.log_id, p.object_key, p.sha256, p.size_bytes, p.mime]), assertChanged(db));
  // A new binding/evidence file after the R2 awaits must lose the entire batch.
  list.push(statement(db, `SELECT CASE WHEN (SELECT count(*) FROM proof_file p WHERE p.log_id=? AND p.status='attached'
    AND (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=?) OR (p.revision_id=? AND p.owner_kind='filer')
      OR (?='correction' AND p.owner_kind='client' AND p.correction_request_id=?
        AND EXISTS(SELECT 1 FROM correction_request cr,json_each(cr.active_proof_ids) selected WHERE cr.id=p.correction_request_id AND selected.value=p.id))))=? THEN 1 ELSE json('review-proof-conflict') END`,
  [c.log_id, revisionId, revisionId, c.kind, c.correction_request_id, checked.length]));
  return list;
}
function roundStatements(db: Db, c: CaseRow, actor: string, revisionId: string, decision: string, reason: string, roundId: string, checked: NonNullable<Awaited<ReturnType<typeof inspectEvidence>>>) {
  const list = [statement(db, `INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at)
    SELECT ?,?,COALESCE(MAX(round_no),0)+1,?,?,?,?,${nowSql} FROM review_round WHERE case_id=?`, [roundId, c.id, revisionId, actor, decision, reason, c.id])];
  for (const { proof, verdict, reviewedAt } of checked) list.push(statement(db, `INSERT INTO proof_review(id,round_id,proof_id,proof_sha256,verdict,reason,reviewed_at) VALUES(?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), roundId, proof.id, proof.sha256, verdict.verdict === "accept" ? "accepted" : "rejected", verdict.reason, reviewedAt]));
  return list;
}
function closeStatements(db: Db, c: CaseRow, actor: string, roundId: string, decision: string, reason: string) {
  return [statement(db, `UPDATE moderation_case SET status=?,claimed_by=NULL,claimed_until=NULL,decision=?,reason=?,decided_by=?,
    decided_at=CASE WHEN ?='ask_changes' THEN NULL ELSE (SELECT decided_at FROM review_round WHERE id=?) END,
    closed_at=CASE WHEN ?='ask_changes' THEN NULL ELSE (SELECT decided_at FROM review_round WHERE id=?) END,
    closure_kind=CASE WHEN ?='ask_changes' THEN NULL ELSE 'decision' END WHERE id=?`,
  [decision === "ask_changes" ? "awaiting_changes" : "decided", decision === "ask_changes" ? null : decision, decision === "ask_changes" ? null : reason,
    decision === "ask_changes" ? null : actor, decision, roundId, decision, roundId, decision, c.id]), assertChanged(db),
  statement(db, "INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'review_decided','review_round',?,?)", [crypto.randomUUID(), actor, roundId, c.id])];
}

export async function decideLogReview(db: Db, bucket: R2Bucket, actorId: string | null, input: unknown, secret: string): Promise<LogResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = logReviewInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const f = parsed.data;
  try {
    const c = await loadReviewCase(db, actorId, f.caseId);
    if (!c || !["log", "filer_update"].includes(c.kind)) return failure("not_found");
    const r = await candidateRevision(db, c);
    if (!r || r.id !== f.revisionId || c.current_revision_id !== f.expectedCurrentRevisionId) return failure("conflict");
    const checked = await inspectEvidence(db, bucket, secret, actorId, c, r.id, f.expectedClaimUntil, f.proofVerdicts);
    if (!checked || checked.length > 5 || (f.decision === "approve" && checked.some(p => p.verdict.verdict !== "accept"))) return failure("conflict");
    const roundId = crypto.randomUUID();
    const list = [subjectGuard(db, actorId, c, f.expectedClaimUntil, r.id, f.expectedCurrentRevisionId), assertChanged(db), ...proofGuards(db, c, r.id, checked),
      ...roundStatements(db, c, actorId, r.id, f.decision, f.reason, roundId, checked),
      statement(db, `UPDATE log_revision SET decision=?,reason=?,decided_by=?,decided_at=(SELECT decided_at FROM review_round WHERE id=?) WHERE id=? AND decision IS NULL`, [f.decision, f.reason, actorId, roundId, r.id]), assertChanged(db)];
    if (f.decision === "approve") {
      const time = await statement(db, `SELECT ${nowSql} AS now`).first<{ now: string }>();
      if (!time) return failure("unavailable");
      list.push(statement(db, `UPDATE engagement_log SET status='published',current_revision_id=?,published_at=COALESCE(published_at,?),expires_at=COALESCE(expires_at,?)
        WHERE id=? AND current_revision_id IS ? AND status=? AND (expires_at IS NULL OR expires_at>${nowSql})
          AND EXISTS(SELECT 1 FROM user u WHERE u.id=engagement_log.freelancer_id AND (u.deactivated_at IS NULL OR engagement_log.name_retention_until>${nowSql}))`,
      [r.id, time.now, addTwelveMonthsUtc(time.now), c.log_id, f.expectedCurrentRevisionId, c.kind === "log" ? "pending" : "published"]), assertChanged(db));
    } else if (c.kind === "log") list.push(statement(db, "UPDATE engagement_log SET status=? WHERE id=? AND status='pending' AND current_revision_id IS NULL", [f.decision === "ask_changes" ? "ask_changes" : "rejected", c.log_id]), assertChanged(db));
    list.push(...closeStatements(db, c, actorId, roundId, f.decision, f.reason));
    await db.$client.batch(list);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}

export async function decideCorrection(db: Db, bucket: R2Bucket, actorId: string | null, input: unknown, secret: string): Promise<LogResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = correctionReviewInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const f = parsed.data;
  try {
    const c = await loadReviewCase(db, actorId, f.caseId);
    if (!c || c.kind !== "correction" || c.correction_request_id !== f.requestId) return failure("not_found");
    if (c.current_revision_id !== f.expectedCurrentRevisionId) return failure("conflict");
    const checked = await inspectEvidence(db, bucket, secret, actorId, c, f.expectedCurrentRevisionId, f.expectedClaimUntil, f.proofVerdicts,
      f.decision === "uphold" || f.decision === "withdraw");
    if (!checked) return failure("conflict");
    const roundId = crypto.randomUUID(), revisionId = f.decision === "correct" ? crypto.randomUUID() : f.expectedCurrentRevisionId;
    const list = [subjectGuard(db, actorId, c, f.expectedClaimUntil, f.expectedCurrentRevisionId, f.expectedCurrentRevisionId), assertChanged(db), ...proofGuards(db, c, f.expectedCurrentRevisionId, checked),
      statement(db, "UPDATE correction_request SET status=status WHERE id=? AND log_id=? AND status='submitted' AND active_proof_ids=?", [f.requestId, c.log_id, c.active_proof_ids]), assertChanged(db)];
    if (f.fields) {
      const v = f.fields;
      list.push(statement(db, `UPDATE engagement_log SET status=status WHERE id=?
        AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=engagement_log.engagement_id AND e.started_on<=?)
        AND ?<=date('now','+8 hours')`, [c.log_id, v.periodStart, v.periodEnd]), assertChanged(db));
      // Corrected publications retain filer evidence; counterproof stays private request evidence.
      const filer = checked.filter(p => p.proof.uploaded_by === c.freelancer_id && p.proof.owner_kind === "filer" && p.verdict.verdict === "accept");
      if (!filer.length || filer.length > 5) return failure("conflict");
      list.push(statement(db, `INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,amount_centavos,submitted_by,moderation_case_id,draft_updated_at)
        SELECT ?,?,COALESCE(MAX(rev_no),0)+1,'correction',?,?,?,?,?,?,?,?,${nowSql} FROM log_revision WHERE log_id=?`,
      [revisionId, c.log_id, v.rating, outcomeForRating(v.rating), v.facts, v.periodStart, v.periodEnd, v.amountCentavos ?? null, actorId, c.id, c.log_id]));
      for (const tag of v.tags) list.push(statement(db, "INSERT INTO log_tag(revision_id,tag) VALUES(?,?)", [revisionId, tag]));
      for (const p of filer) list.push(statement(db, "INSERT INTO revision_proof(revision_id,proof_id) VALUES(?,?)", [revisionId, p.proof.id]));
      list.push(statement(db, `UPDATE log_revision SET state='submitted',submitted_at=${nowSql} WHERE id=?`, [revisionId]), assertChanged(db));
    }
    list.push(...roundStatements(db, c, actorId, revisionId, f.decision, f.reason, roundId, checked));
    if (f.decision === "correct") list.push(
      statement(db, `UPDATE log_revision SET decision='correct',reason=?,decided_by=?,decided_at=(SELECT decided_at FROM review_round WHERE id=?) WHERE id=? AND decision IS NULL`, [f.reason, actorId, roundId, revisionId]), assertChanged(db),
      statement(db, `UPDATE log_revision SET invalidated_at=(SELECT decided_at FROM review_round WHERE id=?) WHERE log_id=? AND id!=? AND decision IN ('approve','correct') AND invalidated_at IS NULL`, [roundId, c.log_id, revisionId]),
      statement(db, `UPDATE engagement_log SET current_revision_id=? WHERE id=? AND current_revision_id=? AND status IN ('published','hidden') AND expires_at>${nowSql}`, [revisionId, c.log_id, f.expectedCurrentRevisionId]), assertChanged(db));
    if (f.decision === "withdraw") list.push(statement(db, "UPDATE engagement_log SET status='withdrawn' WHERE id=? AND current_revision_id=? AND status IN ('published','hidden')", [c.log_id, f.expectedCurrentRevisionId]), assertChanged(db));
    if (f.decision === "uphold" || f.decision === "correct") {
      list.push(statement(db, `WITH ${contentDeadlineCtes} UPDATE engagement_log SET status='published' WHERE id=? AND status='hidden' AND expires_at>${nowSql}
        AND EXISTS(SELECT 1 FROM log_revision r WHERE r.id=engagement_log.current_revision_id AND ${contentDeadlineSql("revision", "r")})
        AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=engagement_log.id
          AND (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=engagement_log.current_revision_id)
            OR (p.revision_id=engagement_log.current_revision_id AND p.owner_kind='filer')
            OR (p.owner_kind='client' AND p.correction_request_id=? AND EXISTS(SELECT 1 FROM correction_request cr,json_each(cr.active_proof_ids) selected
              WHERE cr.id=p.correction_request_id AND selected.value=p.id))) AND NOT (${contentDeadlineSql("proof", "p")}))
        AND EXISTS(SELECT 1 FROM correction_request cr WHERE cr.id=? AND cr.hidden_at IS NOT NULL AND cr.restored_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM correction_request other WHERE other.log_id=engagement_log.id AND other.id!=? AND other.hidden_at IS NOT NULL AND other.restored_at IS NULL)
        AND EXISTS(SELECT 1 FROM user u WHERE u.id=engagement_log.freelancer_id AND (u.deactivated_at IS NULL OR engagement_log.name_retention_until>${nowSql}))`, [c.log_id, f.requestId, f.requestId, f.requestId]),
      statement(db, `UPDATE correction_request SET restored_at=${nowSql} WHERE id=? AND hidden_at IS NOT NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=correction_request.log_id AND l.status='published')`, [f.requestId]));
    }
    list.push(statement(db, `UPDATE correction_request SET status=?,closed_at=CASE WHEN ?='ask_changes' THEN NULL ELSE ${nowSql} END,updated_at=${nowSql} WHERE id=? AND status='submitted'`, [f.decision === "ask_changes" ? "ask_changes" : "closed", f.decision, f.requestId]), assertChanged(db), ...closeStatements(db, c, actorId, roundId, f.decision, f.reason));
    await db.$client.batch(list);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}

export async function hideCorrectionRisk(db: Db, actorId: string | null, input: unknown): Promise<LogResult> {
  const base = leaseInput.extend({ requestId: (await import("@/features/logs/schema")).idInput, reason: privateReason,
    expectedCurrentRevisionId: (await import("@/features/logs/schema")).idInput,
    riskKind: (await import("zod")).z.enum(["factual_error", "privacy_risk"]) }).safeParse(input);
  if (!actorId) return failure("unauthenticated");
  if (!base.success) return failure("invalid_input");
  const f = base.data, gate = caseLease(actorId, f.expectedClaimUntil);
  try {
    await db.$client.batch([
      statement(db, `UPDATE correction_request SET hidden_at=${nowSql},hidden_by=?,hide_reason=? WHERE id=? AND status='submitted' AND hidden_at IS NULL
        AND EXISTS(SELECT 1 FROM moderation_case c WHERE c.id=? AND c.correction_request_id=correction_request.id AND c.kind='correction' AND ${gate.text})
        AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=correction_request.log_id AND l.current_revision_id=?)`, [actorId, f.reason, f.requestId, f.caseId, ...gate.args, f.expectedCurrentRevisionId]), assertChanged(db),
      statement(db, `UPDATE engagement_log SET status='hidden' WHERE id=(SELECT log_id FROM correction_request WHERE id=?) AND current_revision_id=? AND status='published' AND expires_at>${nowSql}`, [f.requestId, f.expectedCurrentRevisionId]), assertChanged(db),
      statement(db, "INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'correction_risk_hidden','correction_request',?,?)", [crypto.randomUUID(), actorId, f.requestId, f.caseId]),
    ]);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}
