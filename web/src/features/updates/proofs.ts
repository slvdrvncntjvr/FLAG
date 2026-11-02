import type { Db } from "@/server/db";
import { assertChanged, intakeNow } from "@/server/db/queries/logs";
import { correctionGate, proposalGate } from "@/server/db/queries/proposals";
import { boundedMultipart, signatureMime } from "@/features/logs/proofs";
import { hex, objectMatches, trackedProof, removeTrackedProof, settleProofWrite } from "@/features/logs/proof-storage";
import { failure, idInput, MAX_PROOF_BYTES, proofKindInput } from "@/features/logs/schema";

type Target = { revisionId: string } | { requestId: string };
export async function uploadProposalProof(db: Db, bucket: R2Bucket, actorId: string | null, target: Target, request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const error = (code: Parameters<typeof failure>[0], status: number) => Response.json(failure(code), { status, headers });
  const id = "revisionId" in target ? target.revisionId : target.requestId;
  if (!actorId || !idInput.safeParse(id).success) return error("not_found", 404);
  const revision = "revisionId" in target;
  const row = revision
    ? await db.$client.prepare("SELECT log_id,kind FROM log_revision WHERE id=? AND submitted_by=? AND state='draft' AND decision IS NULL AND kind IN ('initial','filer_update')").bind(id, actorId).first<{ log_id: string; kind: "initial" | "filer_update" }>()
    : await db.$client.prepare("SELECT log_id,active_proof_ids FROM correction_request WHERE id=? AND requested_by=? AND status IN ('draft','ask_changes')").bind(id, actorId).first<{ log_id: string; active_proof_ids: string; kind?: never }>();
  if (!row) return error("not_found", 404);
  const gate = revision ? proposalGate(actorId, row.kind!) : correctionGate(actorId);
  const scope = revision
    ? `EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=? AND r.submitted_by=? AND r.state='draft' AND r.decision IS NULL AND ${gate.text})`
    : `EXISTS(SELECT 1 FROM correction_request cr JOIN engagement_log l ON l.id=cr.log_id WHERE cr.id=? AND cr.requested_by=? AND cr.status IN ('draft','ask_changes') AND ${gate.text})`;
  const args = [id, actorId, ...gate.args];
  if (!await db.$client.prepare(`SELECT 1 WHERE ${scope}`).bind(...args).first()) return error("not_found", 404);
  let bytes: Uint8Array<ArrayBuffer>, kind: string;
  try {
    const form = await boundedMultipart(request), file = form.get("file"), parsed = proofKindInput.safeParse(form.get("kind"));
    if ([...form.keys()].some(k => k !== "file" && k !== "kind") || form.getAll("file").length !== 1 || form.getAll("kind").length !== 1 || !(file instanceof File) || !parsed.success || !file.size) return error("invalid_input", 400);
    if (file.size > MAX_PROOF_BYTES) return error("too_large", 413);
    bytes = new Uint8Array(await file.arrayBuffer()); kind = parsed.data;
  } catch (e) { return error(e && typeof e === "object" && "status" in e && e.status === 413 ? "too_large" : "invalid_input", e && typeof e === "object" && "status" in e && e.status === 413 ? 413 : 400); }
  const mime = signatureMime(bytes);
  if (!mime) return error("invalid_input", 400);
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes)), proofId = crypto.randomUUID(), key = `logs/${row.log_id}/${proofId}`;
  const count = revision
    ? "(SELECT count(DISTINCT p.id) FROM proof_file p WHERE p.log_id=? AND ((p.revision_id=? AND p.owner_kind='filer' AND p.status='uploading') OR p.status='attached' AND EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=? AND rp.proof_id=p.id)))"
    : "(SELECT json_array_length(active_proof_ids) FROM correction_request WHERE log_id=? AND id=?)";
  const countArgs = revision ? [row.log_id, id, id] : [row.log_id, id];
  try {
    await db.$client.batch([
      db.$client.prepare(`INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('private-upload:'||?||':'||date('now','+8 hours'),1,CAST(strftime('%s','now','+2 days') AS INTEGER)*1000)
        ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<20`).bind(actorId), assertChanged(db),
      db.$client.prepare(`INSERT INTO proof_file(id,log_id,revision_id,correction_request_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,write_inflight)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,1 WHERE ${scope} AND ${count}<5`)
        .bind(proofId, row.log_id, revision ? id : null, revision ? null : id, revision ? "filer" : "client", actorId, key, kind, mime, bytes.byteLength, sha, ...args, ...countArgs), assertChanged(db),
      revision ? db.$client.prepare(`UPDATE log_revision SET draft_updated_at=${intakeNow} WHERE id=? AND ${scope}`).bind(id, ...args)
        : db.$client.prepare(`UPDATE correction_request SET active_proof_ids=json_insert(active_proof_ids,'$[#]',?),updated_at=${intakeNow} WHERE id=? AND active_proof_ids=? AND ${scope}`)
          .bind(proofId, id, "active_proof_ids" in row ? row.active_proof_ids : "[]", ...args), assertChanged(db),
    ]);
  } catch { return error("conflict", 409); }
  try {
    try {
      await bucket.put(key, bytes, { httpMetadata: { contentType: mime }, sha256: sha });
    } finally {
      await settleProofWrite(db, proofId, key);
    }
    const p = await trackedProof(db, proofId);
    if (!p || !objectMatches(await bucket.head(key), p)) throw new Error("changed");
    if (p.status !== "attached") {
      const result = await db.$client.prepare(`UPDATE proof_file SET status=status WHERE id=? AND status='uploading' AND ${scope}
        ${revision ? "" : "AND EXISTS(SELECT 1 FROM correction_request q,json_each(q.active_proof_ids) selected WHERE q.id=proof_file.correction_request_id AND selected.value=proof_file.id)"}`).bind(proofId, ...args).run();
      if (result.meta.changes !== 1) throw new Error("changed");
    }
    return Response.json({ ok: true, data: { proofId } }, { status: 201, headers });
  } catch {
    // The put has settled; compensate only this exact unsubmitted, unshared upload.
    // Failed deletion keeps its fenced tracking row for a bounded retry.
    if (!revision) await db.$client.prepare(`UPDATE correction_request SET active_proof_ids=(SELECT json_group_array(value) FROM json_each(active_proof_ids) WHERE value!=?),updated_at=${intakeNow}
      WHERE id=? AND requested_by=? AND status IN ('draft','ask_changes') AND ${scope}
      AND EXISTS(SELECT 1 FROM proof_file p WHERE p.id=? AND p.correction_request_id=correction_request.id AND p.status='uploading')`)
      .bind(proofId, id, actorId, ...args, proofId).run().catch(() => undefined);
    await removeTrackedProof(db, bucket, proofId, actorId).catch(() => false);
    return error("unavailable", 503);
  }
}
