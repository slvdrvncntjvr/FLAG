import type { Db } from "@/server/db";
import { purgeClaimedProof } from "./proof-storage";
import { noActiveLogHold } from "./holds";

// Internal/local invocation only. No scheduled deployment or public maintenance route is implied.
// A finite batch can be awaited in a private request. Held and submitted evidence is never eligible.
export async function runPrivateIntakeCleanup(db: Db, proofs: R2Bucket, options: { limit?: number; cursor?: string; scanOrphans?: boolean } = {}) {
  const limit = Number.isFinite(options.limit) ? Math.min(25, Math.max(1, Math.trunc(options.limit!))) : 5;
  let deletedObjects = 0, deletedDrafts = 0;
  const idle = `l.status='draft' AND l.first_submitted_at IS NULL AND ${noActiveLogHold("l")}
    AND coalesce(l.draft_updated_at,l.created_at)<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
    AND NOT EXISTS(SELECT 1 FROM moderation_case mc WHERE mc.kind='log' AND mc.subject_id=l.id AND mc.status IN ('open','claimed'))`;
  // Claim before object deletion. 0009 rejects concurrent touches/submission/hold changes while claimed.
  await db.$client.prepare(`UPDATE proof_file SET status='pending_purge' WHERE id IN (
    SELECT p.id FROM proof_file p JOIN engagement_log l ON l.id=p.log_id WHERE ${idle}
    AND (p.status IN ('uploading','abandoned') OR (p.status='purged' AND p.uploaded_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')))
    ORDER BY p.purge_attempts,p.uploaded_at,p.id LIMIT ?)`)
    .bind(limit).run();
  const claimed = await db.$client.prepare(`SELECT p.id FROM proof_file p JOIN engagement_log l ON l.id=p.log_id
    WHERE p.status='pending_purge' AND p.purge_inflight=0 AND l.status='draft' AND l.first_submitted_at IS NULL AND ${noActiveLogHold("l")}
    ORDER BY p.purge_attempts,p.uploaded_at,p.id LIMIT ?`).bind(limit).all<{ id: string }>();
  for (const row of claimed.results) {
    if (!await purgeClaimedProof(db, proofs, row.id)) continue;
    deletedObjects++;
    // Retain fresh compensation tombstones for30days. Aged tombstones must be
    // claimed/deleted AGAIN before retirement, since a late put may have created bytes.
    // Individual retirement makes progress even when a draft has many failed attempts.
    await db.$client.prepare(`DELETE FROM proof_file WHERE id=? AND status='purged'
      AND uploaded_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
      AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=proof_file.log_id AND ${idle})`)
      .bind(row.id).run();
  }
  const drafts = await db.$client.prepare(`SELECT l.id FROM engagement_log l WHERE ${idle}
    AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id) ORDER BY l.created_at,l.id LIMIT ?`)
    .bind(limit).all<{ id: string }>();
  for (const { id } of drafts.results) {
    // Repeat every gate in the atomic purge; a new edit, hold or live object must preserve all rows.
    const eligible = `EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=? AND ${idle}
      AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id))`;
    try {
      const result = await db.$client.batch([
        db.$client.prepare(`DELETE FROM log_tag WHERE revision_id IN(SELECT id FROM log_revision WHERE log_id=?) AND ${eligible}`).bind(id, id),
        db.$client.prepare(`DELETE FROM proof_file WHERE log_id=? AND ${eligible}`).bind(id, id),
        db.$client.prepare(`DELETE FROM log_revision WHERE log_id=? AND ${eligible}`).bind(id, id),
        db.$client.prepare(`DELETE FROM engagement_log WHERE id=? AND ${eligible}`).bind(id, id),
      ]);
      deletedDrafts += result[3].meta.changes;
    } catch { /* Keep metadata and retry the next bounded invocation. No content is logged. */ }
  }
  let cursor: string | undefined;
  if (options.scanOrphans) {
    const listed = await proofs.list({ prefix: "logs/", limit, ...(options.cursor ? { cursor: options.cursor } : {}) });
    if (listed.truncated) cursor = listed.cursor;
    for (const object of listed.objects) {
      const key = /^logs\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})$/.exec(object.key);
      if (!key || object.uploaded.getTime() > Date.now() - 30 * 86400000) continue;
      // An untracked key under any existing parent is retained conservatively:
      // a hold or submission could otherwise win after our final read, before R2 delete.
      // Normal reservations are tracked before put, and generated parent IDs are never reused.
      const safe = async () => !(await db.$client.prepare(`SELECT 1 AS present WHERE EXISTS(SELECT 1 FROM proof_file WHERE object_key=?)
        OR EXISTS(SELECT 1 FROM engagement_log WHERE id=? )`)
        .bind(object.key, key[1]).first());
      if (await safe() && await safe()) { await proofs.delete(object.key); deletedObjects++; }
    }
  }
  return { deletedObjects, deletedDrafts, ...(cursor ? { cursor } : {}) };
}
