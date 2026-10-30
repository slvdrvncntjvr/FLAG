import type { Db } from "@/server/db";
import { assertChanged, editableDraftGate, filerGate, intakeNow, loadPrivateLog } from "@/server/db/queries/logs";
import { failure, idInput, MAX_PROOF_BYTES, proofKindInput, type LogFailureCode, type LogResult } from "./schema";
import { hex, objectMatches, purgeClaimedProof, trackedProof, type ProofRecord } from "./proof-storage";
import { runPrivateIntakeCleanup } from "./cleanup";
import { noActiveLogHold } from "./holds";

const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function errorResponse(code: LogFailureCode, status: number) {
  const result = failure(code);
  return Response.json({ ...result, error: result.error }, { status, headers: responseHeaders });
}
class BodyError extends Error { constructor(readonly status: number) { super("invalid upload"); } }

// Read at most one bounded multipart request. Never call formData on an unbounded network body.
export async function boundedMultipart(request: Request): Promise<FormData> {
  const maximum = MAX_PROOF_BYTES + 16 * 1024;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.length > 256 || !/^multipart\/form-data;\s*boundary=(?:"[^"\r\n]{1,100}"|[^\s;\r\n]{1,100})$/i.test(contentType)) throw new BodyError(400);
  const claimed = request.headers.get("content-length");
  if (claimed && (!/^\d{1,12}$/.test(claimed) || Number(claimed) > maximum)) throw new BodyError(413);
  if (!request.body) throw new BodyError(400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyError(400)), 30_000); });
  try {
    while (true) {
      const read = await Promise.race([reader.read(), timeout]);
      if (read.done) break;
      size += read.value.byteLength;
      if (size > maximum) throw new BodyError(413);
      chunks.push(read.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    // Cancel the incoming body rather than drain an oversized upload.
    await reader.cancel().catch(() => undefined);
    throw error instanceof BodyError ? error : new BodyError(400);
  } finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
}

export function signatureMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | null {
  if (bytes.length < 12) return null;
  const starts = (signature: number[]) => signature.every((b, i) => bytes[i] === b);
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (starts([137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 45 && text(12, 16) === "IHDR"
    && text(bytes.length - 8, bytes.length - 4) === "IEND") return "image/png";
  if (starts([255, 216, 255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217) return "image/jpeg";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP" && bytes.length >= 20
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 === bytes.length
    && ["VP8 ", "VP8L", "VP8X"].includes(text(12, 16))) return "image/webp";
  if (/^%PDF-[12]\.\d/.test(text(0, 8)) && text(Math.max(0, bytes.length - 1024), bytes.length).includes("%%EOF")) return "application/pdf";
  return null;
}

async function ownedDraft(db: Db, actorId: string | null, logId: string): Promise<"editable" | "conflict" | "missing"> {
  if (!actorId || !idInput.safeParse(logId).success) return "missing";
  const gate = editableDraftGate(actorId);
  const editable = await db.$client.prepare(`SELECT 1 FROM engagement_log WHERE id=? AND ${gate.text}`).bind(logId, ...gate.args).first();
  if (editable) return "editable";
  // Do not distinguish other people's objects or expose their state.
  const own = await db.$client.prepare("SELECT 1 FROM engagement_log WHERE id=? AND freelancer_id=?").bind(logId, actorId).first();
  return own ? "conflict" : "missing";
}

async function abandonUpload(db: Db, proofs: R2Bucket, proofId: string): Promise<void> {
  // Compensation can never claim attached/submitted/held evidence.
  await db.$client.prepare(`UPDATE proof_file SET status='pending_purge' WHERE id=? AND status IN ('uploading','abandoned','purged')
    AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=proof_file.log_id AND l.status='draft' AND l.first_submitted_at IS NULL AND ${noActiveLogHold("l")})`)
    .bind(proofId).run();
  await purgeClaimedProof(db, proofs, proofId);
  // A late put must reclaim its retained tombstone atomically BEFORE deleting bytes.
  // The pending_purge guard blocks a new hold during deletion; attached evidence is never claimed.
}

export async function uploadProof(db: Db, proofs: R2Bucket, actorId: string | null, logId: string, request: Request): Promise<Response> {
  let access = await ownedDraft(db, actorId, logId);
  if (access === "conflict" && actorId) {
    const actor = filerGate(actorId);
    const own = await db.$client.prepare(`SELECT 1 FROM engagement_log WHERE id=? AND freelancer_id=? AND ${actor.text}`).bind(logId, actorId, ...actor.args).first();
    // A failed object-delete claim must be retryable by the same uploader, not require another draft's traffic.
    if (own) { await runPrivateIntakeCleanup(db, proofs, { limit: 5 }).catch(() => undefined); access = await ownedDraft(db, actorId, logId); }
  }
  if (access !== "editable") return errorResponse(access === "missing" ? "not_found" : "conflict", access === "missing" ? 404 : 409);
  // Await finite retry work; lack of traffic still needs an operational internal runner.
  await runPrivateIntakeCleanup(db, proofs, { limit: 1 }).catch(() => undefined);
  let file: File, kind: string;
  try {
    const form = await boundedMultipart(request);
    if ([...form.keys()].some(key => key !== "file" && key !== "kind") || form.getAll("file").length !== 1 || form.getAll("kind").length !== 1) return errorResponse("invalid_input", 400);
    const uploaded = form.get("file"), parsedKind = proofKindInput.safeParse(form.get("kind"));
    if (!(uploaded instanceof File) || !parsedKind.success || uploaded.size === 0) return errorResponse("invalid_input", 400);
    if (uploaded.size > MAX_PROOF_BYTES) return errorResponse("too_large", 413);
    file = uploaded; kind = parsedKind.data;
  } catch (error) { return errorResponse(error instanceof BodyError && error.status === 413 ? "too_large" : "invalid_input", error instanceof BodyError ? error.status : 400); }
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = signatureMime(bytes);
  if (!mime) return errorResponse("invalid_input", 400);
  const checksum = hex(await crypto.subtle.digest("SHA-256", bytes));
  const id = crypto.randomUUID(), key = `logs/${logId}/${id}`, gate = editableDraftGate(actorId!);
  // The quota day is chosen by D1 inside the write, even across a Manila-midnight await.
  // Retain attempts after reservation/object deletion and at least through that entire day.
  try {
    await db.$client.batch([
      db.$client.prepare(`INSERT INTO auth_rate_limit(key,count,expires_at)
        VALUES('private-upload:'||?||':'||date('now','+8 hours'),1,CAST(strftime('%s','now','+2 days') AS INTEGER)*1000)
        ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<20`).bind(actorId!),
      assertChanged(db),
      db.$client.prepare(`INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256)
        SELECT ?,id,'filer',?,?,?,?,?,? FROM engagement_log WHERE id=? AND ${gate.text}`)
        .bind(id, actorId!, key, kind, mime, bytes.byteLength, checksum, logId, ...gate.args),
      assertChanged(db),
      // Reserving an active put is draft activity too. Cleanup must not retire its parent mid-put.
      db.$client.prepare(`UPDATE engagement_log SET draft_updated_at=${intakeNow} WHERE id=? AND ${gate.text}`).bind(logId, ...gate.args),
      assertChanged(db),
    ]);
  } catch {
    const quota = await db.$client.prepare("SELECT count FROM auth_rate_limit WHERE key='private-upload:'||?||':'||date('now','+8 hours')").bind(actorId!).first<{ count: number }>();
    return errorResponse(quota && quota.count >= 20 ? "quota" : "conflict", quota && quota.count >= 20 ? 429 : 409);
  }
  try {
    // The bounded buffer is also supported by the Node/OpenNext Miniflare bridge.
    // A Node Blob.stream() has no workerd fixed-length marker and is rejected there.
    await proofs.put(key, bytes, { httpMetadata: { contentType: mime }, sha256: checksum });
    const row = await trackedProof(db, id);
    if (!row || !objectMatches(await proofs.head(key), row)) throw new Error("upload unavailable");
    // A concurrent submit may have attached the complete reservation. That is success, never compensation.
    if (row.status === "attached") return Response.json({ ok: true, data: { proofId: id } }, { status: 201, headers: responseHeaders });
    const done = await db.$client.prepare(`UPDATE engagement_log SET draft_updated_at=${intakeNow}
      WHERE id=? AND ${gate.text} AND EXISTS(SELECT 1 FROM proof_file WHERE id=? AND log_id=engagement_log.id AND status='uploading')`)
      .bind(logId, ...gate.args, id).run();
    if (done.meta.changes !== 1) throw new Error("upload changed");
    return Response.json({ ok: true, data: { proofId: id } }, { status: 201, headers: responseHeaders });
  } catch {
    // DB errors retain the original reservation; never blindly delete an unknown or changed key.
    await abandonUpload(db, proofs, id).catch(() => undefined);
    return errorResponse("unavailable", 503);
  }
}

export async function downloadProof(db: Db, proofs: R2Bucket, actorId: string | null, proofId: string): Promise<Response> {
  if (!actorId || !idInput.safeParse(proofId).success) return errorResponse("not_found", 404);
  const row = await trackedProof(db, proofId);
  if (!row || !["uploading", "attached"].includes(row.status) || !await loadPrivateLog(db, actorId, row.log_id)) return errorResponse("not_found", 404);
  try {
    const object = await proofs.get(row.object_key);
    if (!objectMatches(object, row) || !object) return errorResponse("not_found", 404);
    // Recheck after R2 await: cleanup and concurrent state changes must not expose discarded evidence.
    const current = await trackedProof(db, proofId);
    if (!current || !["uploading", "attached"].includes(current.status) || !await loadPrivateLog(db, actorId, row.log_id)) return errorResponse("not_found", 404);
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[row.mime];
    if (!extension) return errorResponse("not_found", 404);
    return new Response(object.body, { headers: { ...responseHeaders, "Content-Type": row.mime, "Content-Length": String(row.size_bytes),
      "Content-Disposition": `attachment; filename="proof-${row.id}.${extension}"` } });
  } catch { return errorResponse("not_found", 404); }
}

export async function removeDraftProof(db: Db, proofs: R2Bucket, actorId: string | null, proofId: string): Promise<LogResult> {
  if (!actorId || !idInput.safeParse(proofId).success) return failure("not_found");
  const row = await trackedProof(db, proofId);
  if (!row || row.uploaded_by !== actorId || await ownedDraft(db, actorId, row.log_id) !== "editable") return failure("not_found");
  try {
    await abandonUpload(db, proofs, proofId);
    const current = await trackedProof(db, proofId);
    return current?.status === "purged" ? { ok: true, data: {} } : failure("unavailable");
  } catch { return failure("unavailable"); }
}

export type { ProofRecord };
