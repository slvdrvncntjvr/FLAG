import type { Db } from "@/server/db";
import { candidateProofs, candidateRevision, caseLease, loadReviewCase } from "@/server/db/queries/reviews";
import { objectMatches } from "@/features/logs/proof-storage";
import { issueProofView } from "./proof-view-token";
import { idInput } from "@/features/logs/schema";
import { leaseInput } from "./schema";
import { contentWithinDeadline } from "@/server/db/queries/logs";

export async function downloadReviewProof(db: Db, bucket: R2Bucket, actor: string | null, proofId: string, input: unknown, secret: string): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const missing = () => new Response(null, { status: 404, headers });
  const parsed = leaseInput.extend({ revisionId: idInput }).safeParse(input);
  if (!actor || !parsed.success || !idInput.safeParse(proofId).success) return missing();
  const f = parsed.data;
  try {
    const c = await loadReviewCase(db, actor, f.caseId);
    if (!c || (c.expires_at !== null && c.expires_at <= new Date().toISOString())) return missing();
    const revision = await candidateRevision(db, c);
    if (!revision || revision.id !== f.revisionId || !await contentWithinDeadline(db, "revision", revision.id)) return missing();
    const p = (await candidateProofs(db, c, f.revisionId)).find(p => p.id === proofId);
    if (!p || !await contentWithinDeadline(db, "proof", p.id)) return missing();
    const object = await bucket.get(p.object_key);
    if (!object || !objectMatches(object, p)) return missing();
    const gate = caseLease(actor, f.expectedClaimUntil);
    const current = await db.$client.prepare(`SELECT 1 FROM moderation_case c JOIN proof_file p ON p.id=?
      JOIN engagement_log l ON l.id=p.log_id WHERE c.id=? AND ${gate.text} AND p.status='attached' AND p.purge_inflight=0
      AND p.sha256=? AND p.object_key=? AND p.size_bytes=? AND (l.expires_at IS NULL OR l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .bind(proofId, f.caseId, ...gate.args, p.sha256, p.object_key, p.size_bytes).first();
    const after = await loadReviewCase(db, actor, f.caseId);
    if (!current || !after || (await candidateRevision(db, after))?.id !== f.revisionId || !(await candidateProofs(db, after, f.revisionId)).some(x => x.id === p.id)
      || !await contentWithinDeadline(db, "revision", f.revisionId) || !await contentWithinDeadline(db, "proof", p.id)) return missing();
    const token = await issueProofView(secret, { actorId: actor, caseId: c.id, revisionId: f.revisionId, proofId, sha256: p.sha256, objectKey: p.object_key, size: p.size_bytes, lease: f.expectedClaimUntil });
    return new Response(object.body, { headers: { ...headers, "Content-Type": p.mime, "Content-Length": String(p.size_bytes), "Content-Disposition": `attachment; filename="proof-${proofId}"`, "X-FLAG-Proof-View": token } });
  } catch { return missing(); }
}
