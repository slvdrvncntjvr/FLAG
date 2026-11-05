import type { Db } from "@/server/db";

export type ProofRecord = { id: string; log_id: string; revision_id: string | null; correction_request_id: string | null; owner_kind: string; uploaded_by: string; object_key: string; kind: string; mime: string; size_bytes: number; sha256: string; status: string; uploaded_at: string; purge_attempts: number; write_inflight: number };
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

// Call only from the original uploader's finally after its awaited PUT settles.
// Immutable unique ID/key bind the reservation generation; a settled row cannot
// acquire another writer. Keep every receipt/status/purge fence unchanged.
export async function settleProofWrite(db: Db, proofId: string, objectKey: string): Promise<void> {
  const settled = await db.$client.prepare("UPDATE proof_file SET write_inflight=0 WHERE id=? AND object_key=? AND write_inflight=1 RETURNING id")
    .bind(proofId, objectKey).first();
  if (!settled) throw new Error("proof_writer_settlement_lost");
}

// Fixed SQL only. Compensation cannot erase any attached/shared submitted evidence.
const compensatable = `EXISTS(SELECT 1 FROM pilot_unheld_target u WHERE u.target_type='proof_file' AND u.target_id=proof_file.id)
  AND NOT EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=proof_file.id)
  AND ((revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM log_revision r WHERE r.id=proof_file.revision_id AND r.state='draft' AND r.decision IS NULL AND r.submitted_by=proof_file.uploaded_by))
    OR (correction_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM correction_request c WHERE c.id=proof_file.correction_request_id AND c.status IN ('draft','ask_changes') AND c.requested_by=proof_file.uploaded_by))
    OR (revision_id IS NULL AND correction_request_id IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=proof_file.log_id AND l.status='draft' AND l.first_submitted_at IS NULL)))
  AND NOT EXISTS(SELECT 1 FROM maintenance_task t JOIN pilot_maintenance_target x ON x.target_type=t.target_type AND x.target_id=t.target_id WHERE t.status IN ('claimed','blocked') AND (x.log_id=proof_file.log_id OR t.target_type='engagement_log' AND t.target_id=proof_file.log_id))`;

export async function retryableCompensations(db: Db, limit: number) {
  return (await db.$client.prepare(`SELECT id FROM proof_file WHERE status='pending_purge' AND purge_inflight=0
    AND ${compensatable} AND EXISTS(SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type='proof_file'
      AND x.target_id=proof_file.id AND (x.purge_due_at IS NULL OR x.purge_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
    ORDER BY purge_attempts,uploaded_at,id LIMIT ?`).bind(limit).all<{ id: string }>()).results;
}

export async function removeTrackedProof(db: Db, proofs: R2Bucket, proofId: string, actorId: string): Promise<boolean> {
  const result = await db.$client.prepare(`UPDATE proof_file SET status='pending_purge' WHERE id=? AND uploaded_by=? AND status IN ('uploading','abandoned','purged') AND purge_inflight=0 AND ${compensatable}`).bind(proofId, actorId).run();
  return result.meta.changes === 1 && await purgeClaimedProof(db, proofs, proofId);
}

// The caller claims pending_purge first. Retaining metadata on every failure makes retries possible.
export async function purgeClaimedProof(db: Db, proofs: R2Bucket, proofId: string): Promise<boolean> {
  // Persist rotation before R2: a failed/mismatched oldest object must not starve
  // the rest of the queue across requests, restarts, or bounded limit=1 runs.
  const row = await db.$client.prepare(`UPDATE proof_file SET purge_attempts=purge_attempts+1,purge_inflight=1
    WHERE id=? AND status='pending_purge' AND purge_inflight=0 AND ${compensatable} RETURNING *`)
    .bind(proofId).first<ProofRecord>();
  if (!row) return false;
  try {
    const object = await proofs.head(row.object_key);
    // Never erase an unexpected replacement. Keep the claim/tracking for investigation
    // and retry; a missing object is already deleted and can finish idempotently.
    if (object && !objectMatches(object, row)) return false;
    const stillOwned = await db.$client.prepare(`SELECT 1 FROM proof_file WHERE id=? AND status='pending_purge'
      AND purge_inflight=1 AND purge_attempts=? AND ${compensatable}`).bind(proofId, row.purge_attempts).first();
    if (!stillOwned) return false;
    await proofs.delete(row.object_key);
    if (await proofs.head(row.object_key)) return false;
    const result = await db.$client.prepare(`UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id=? AND status='pending_purge' AND purge_inflight=1 AND purge_attempts=?
      AND ${compensatable}`)
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
