import type { Db } from "@/server/db";
import { runMaintenance } from "@/features/lifecycle/maintenance";

// Compatibility entry point: tracked destruction uses the hourly executor's exact grants.
export async function runPrivateIntakeCleanup(db: Db, proofs: R2Bucket, options: { limit?: number; cursor?: string; scanOrphans?: boolean } = {}) {
  const before = await db.$client.prepare("SELECT count(*) AS count FROM engagement_log WHERE first_submitted_at IS NULL").first<{ count: number }>();
  // The historical limit bounds object deletion, while dependent D1 task work
  // keeps the common executor's independent 25-claim ceiling.
  const result = await runMaintenance({ DB: db.$client, PROOFS: proofs }, Date.now(), 25, options.limit);
  const after = await db.$client.prepare("SELECT count(*) AS count FROM engagement_log WHERE first_submitted_at IS NULL").first<{ count: number }>();
  let deletedObjects = result.r2Deletes, cursor: string | undefined;
  if (options.scanOrphans && deletedObjects < 25) {
    const listed = await proofs.list({ prefix: "logs/", limit: 25 - deletedObjects, ...(options.cursor ? { cursor: options.cursor } : {}) });
    if (listed.truncated) cursor = listed.cursor;
    for (const object of listed.objects) {
      const key = /^logs\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})$/.exec(object.key);
      if (!key || object.uploaded.getTime() > Date.now() - 30 * 86400000) continue;
      const tracked = await db.$client.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM proof_file WHERE object_key=?) OR EXISTS(SELECT 1 FROM engagement_log WHERE id=?)").bind(object.key, key[1]).first();
      if (tracked) continue;
      await proofs.delete(object.key);
      if (!await proofs.head(object.key)) deletedObjects++;
    }
  }
  return { deletedObjects, deletedDrafts: Math.max(0, (before?.count ?? 0) - (after?.count ?? 0)), ...(cursor ? { cursor } : {}) };
}
