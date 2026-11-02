import type { Db } from "@/server/db";
import { assertChanged, intakeNow } from "@/server/db/queries/logs";
import { correctionGate } from "@/server/db/queries/proposals";
import { correctionDraftInput } from "@/features/moderation/log-schema";
import { failure, idInput, type LogResult } from "@/features/logs/schema";
import { objectMatches, type ProofRecord } from "@/features/logs/proof-storage";
import { z } from "zod";

export async function selectCorrectionProofs(db: Db, actorId: string | null, input: unknown): Promise<LogResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = z.strictObject({ requestId: idInput, expectedProofIds: z.array(idInput).max(5), proofIds: z.array(idInput).max(5).refine(ids => new Set(ids).size === ids.length) }).safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const f = parsed.data, gate = correctionGate(actorId);
  try {
    const current = await db.$client.prepare("SELECT active_proof_ids FROM correction_request WHERE id=? AND requested_by=? AND status IN ('draft','ask_changes')").bind(f.requestId, actorId).first<{ active_proof_ids: string }>();
    if (!current || JSON.stringify(JSON.parse(current.active_proof_ids)) !== JSON.stringify(f.expectedProofIds)) return failure("conflict");
    await db.$client.batch([
      db.$client.prepare(`UPDATE correction_request SET active_proof_ids=?,updated_at=${intakeNow} WHERE id=? AND requested_by=? AND status IN ('draft','ask_changes') AND active_proof_ids=?
        AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=correction_request.log_id AND ${gate.text})`)
        .bind(JSON.stringify(f.proofIds), f.requestId, actorId, current.active_proof_ids, ...gate.args), assertChanged(db),
    ]);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}

export async function openCorrection(db: Db, actorId: string | null, input: unknown): Promise<LogResult<{ requestId: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = correctionDraftInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const f = parsed.data, gate = correctionGate(actorId), id = crypto.randomUUID();
  // One bounded private factual note; schema deliberately has no editable public field.
  const note = f.newEvidenceNote ?? f.note;
  try {
    await db.$client.batch([
      db.$client.prepare(`INSERT INTO correction_request(id,log_id,subject_ref,requested_by,base_revision_id,new_evidence_note)
        SELECT ?,l.id,l.id,?,l.current_revision_id,? FROM engagement_log l WHERE l.id=? AND ${gate.text}
          AND NOT EXISTS(SELECT 1 FROM correction_request cr WHERE cr.log_id=l.id AND cr.status IN ('draft','submitted','ask_changes'))`)
        .bind(id, actorId, note, f.logId, ...gate.args), assertChanged(db),
      db.$client.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES(?,?,'correction_opened','correction_request',?)").bind(crypto.randomUUID(), actorId, id),
    ]);
    return { ok: true, data: { requestId: id } };
  } catch { return failure("conflict"); }
}
export async function submitCorrection(db: Db, bucket: R2Bucket, actorId: string | null, requestId: string): Promise<LogResult> {
  if (!actorId) return failure("unauthenticated");
  if (!idInput.safeParse(requestId).success) return failure("invalid_input");
  const gate = correctionGate(actorId);
  try {
    const request = await db.$client.prepare(`SELECT cr.*,l.current_revision_id FROM correction_request cr JOIN engagement_log l ON l.id=cr.log_id
      WHERE cr.id=? AND cr.requested_by=? AND cr.status IN ('draft','ask_changes') AND ${gate.text}`)
      .bind(requestId, actorId, ...gate.args).first<{ log_id: string; status: string; new_evidence_note: string; current_revision_id: string; active_proof_ids: string }>();
    if (!request) return failure("not_found");
    const proofs = await db.$client.prepare(`SELECT p.* FROM proof_file p JOIN json_each(?) selected ON selected.value=p.id WHERE p.correction_request_id=? AND p.uploaded_by=? AND p.owner_kind='client' AND p.status IN ('uploading','attached') ORDER BY p.id`)
      .bind(request.active_proof_ids, requestId, actorId).all<ProofRecord>();
    if (!proofs.results.length || proofs.results.length > 5 || proofs.results.length !== JSON.parse(request.active_proof_ids).length) return failure("invalid_input");
    if (request.status === "ask_changes" && !proofs.results.some(p => p.status === "uploading")) return failure("invalid_input");
    for (const p of proofs.results) if (!objectMatches(await bucket.head(p.object_key), p)) return failure("conflict");
    const caseId = request.status === "draft" ? crypto.randomUUID() : (await db.$client.prepare("SELECT id FROM moderation_case WHERE correction_request_id=? AND status='awaiting_changes'")
      .bind(requestId).first<{ id: string }>())?.id;
    if (!caseId) return failure("conflict");
    const list = [db.$client.prepare(`UPDATE correction_request SET updated_at=${intakeNow} WHERE id=? AND requested_by=? AND status=? AND active_proof_ids=?
      AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=correction_request.log_id AND l.current_revision_id=? AND ${gate.text})
      AND (NOT EXISTS(SELECT 1 FROM correction_request old WHERE old.subject_ref=correction_request.subject_ref AND old.requested_by=? AND old.id!=correction_request.id AND old.submitted_at IS NOT NULL)
        OR NOT EXISTS(SELECT 1 FROM correction_request old WHERE old.subject_ref=correction_request.subject_ref AND old.requested_by=? AND old.id!=correction_request.id AND old.submitted_at IS NOT NULL AND old.new_evidence_note=correction_request.new_evidence_note)
        OR EXISTS(SELECT 1 FROM proof_file fresh JOIN json_each(correction_request.active_proof_ids) selected ON selected.value=fresh.id WHERE fresh.correction_request_id=correction_request.id AND NOT EXISTS(SELECT 1 FROM proof_file prior JOIN correction_request old ON old.id=prior.correction_request_id
          WHERE old.subject_ref=correction_request.subject_ref AND old.requested_by=? AND old.id!=correction_request.id AND old.submitted_at IS NOT NULL AND prior.sha256=fresh.sha256)))
      AND (SELECT count(*) FROM proof_file p JOIN json_each(correction_request.active_proof_ids) selected ON selected.value=p.id WHERE p.correction_request_id=correction_request.id AND p.status IN ('uploading','attached'))=?`)
      .bind(requestId, actorId, request.status, request.active_proof_ids, request.current_revision_id, ...gate.args, actorId, actorId, actorId, proofs.results.length), assertChanged(db)];
    for (const p of proofs.results) list.push(db.$client.prepare(`UPDATE proof_file SET status='attached' WHERE id=? AND correction_request_id=? AND status=? AND object_key=? AND sha256=? AND size_bytes=? AND mime=? AND purge_inflight=0`)
      .bind(p.id, requestId, p.status, p.object_key, p.sha256, p.size_bytes, p.mime), assertChanged(db));
    if (request.status === "draft") list.push(db.$client.prepare("INSERT INTO moderation_case(id,kind,subject_id,log_id,correction_request_id,status) VALUES(?,'correction',?,?,?,'open')").bind(caseId, requestId, request.log_id, requestId));
    else list.push(db.$client.prepare("UPDATE moderation_case SET status='open' WHERE id=? AND status='awaiting_changes'").bind(caseId), assertChanged(db));
    list.push(db.$client.prepare(`UPDATE correction_request SET status='submitted',submitted_at=COALESCE(submitted_at,${intakeNow}),updated_at=${intakeNow} WHERE id=? AND status=?`).bind(requestId, request.status), assertChanged(db),
      db.$client.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'correction_submitted','correction_request',?,?)").bind(crypto.randomUUID(), actorId, requestId, caseId));
    await db.$client.batch(list);
    return { ok: true, data: {} };
  } catch { return failure("conflict"); }
}
