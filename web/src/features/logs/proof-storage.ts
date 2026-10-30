import type { Db } from "@/server/db";
import { noActiveLogHold } from "./holds";

export type ProofRecord = { id: string; log_id: string; revision_id: string | null; uploaded_by: string; object_key: string; kind: string; mime: string; size_bytes: number; sha256: string; status: string; uploaded_at: string; purge_attempts: number };
export function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
}
export function objectMatches(object: R2Object | null, proof: ProofRecord): boolean {
  return !!object && object.size === proof.size_bytes && object.httpMetadata?.contentType === proof.mime
    && !!object.checksums.sha256 && hex(object.checksums.sha256) === proof.sha256;
}
export async function trackedProof(db: Db, id: string): Promise<ProofRecord | null> {
  return db.$client.prepare("SELECT * FROM proof_file WHERE id=?").bind(id).first<ProofRecord>();
}

// The caller claims pending_purge first. Retaining metadata on every failure makes retries possible.
export async function purgeClaimedProof(db: Db, proofs: R2Bucket, proofId: string): Promise<boolean> {
  // Persist rotation before R2: a failed/mismatched oldest object must not starve
  // the rest of the queue across requests, restarts, or bounded limit=1 runs.
  const row = await db.$client.prepare(`UPDATE proof_file SET purge_attempts=purge_attempts+1,purge_inflight=1
    WHERE id=? AND status='pending_purge' AND purge_inflight=0 AND EXISTS(SELECT 1 FROM engagement_log l
      WHERE l.id=proof_file.log_id AND l.status='draft' AND l.first_submitted_at IS NULL AND ${noActiveLogHold("l")}) RETURNING *`)
    .bind(proofId).first<ProofRecord>();
  if (!row) return false;
  try {
    const object = await proofs.head(row.object_key);
    // Never erase an unexpected replacement. Keep the claim/tracking for investigation
    // and retry; a missing object is already deleted and can finish idempotently.
    if (object && !objectMatches(object, row)) return false;
    await proofs.delete(row.object_key);
    const result = await db.$client.prepare(`UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id=? AND status='pending_purge' AND purge_inflight=1 AND purge_attempts=?
      AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=proof_file.log_id AND l.status='draft' AND l.first_submitted_at IS NULL AND ${noActiveLogHold("l")})`)
      .bind(proofId, row.purge_attempts).run();
    return result.meta.changes === 1;
  } catch { return false; }
  finally {
    // R2 has settled before releasing exclusive ownership. A crashed invocation
    // deliberately stays claimed; never permit a timed takeover by a stale deleter.
    await db.$client.prepare("UPDATE proof_file SET purge_inflight=0 WHERE id=? AND status='pending_purge' AND purge_inflight=1 AND purge_attempts=?")
      .bind(proofId, row.purge_attempts).run();
  }
}
