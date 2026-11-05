import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { addActor, addProof, intakeFixture } from "./private-intake-fixtures";
import { submitLog } from "@/features/logs/submit";
import { claimLogReview, decideLogReview } from "@/features/moderation/log-handlers";
import { downloadReviewProof } from "@/features/moderation/proof-view";
import { candidateProofs, candidateRevision, loadReviewCase } from "@/server/db/queries/reviews";

export const reviewSecret = "synthetic-proof-view-secret-for-tests";
// Advance only a fixture's stored clock, restoring the exact production guard
// before callers exercise any application read/write or storage delivery.
export async function fixtureClock(trigger: "pilot_log_update" | "revision_update", mutation: D1PreparedStatement) {
  const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").bind(trigger).first<{ sql: string }>();
  if (!guard) throw new Error("Fixture clock guard unavailable");
  await expect(mutation.run()).rejects.toThrow();
  await env.DB.prepare(`DROP TRIGGER ${trigger}`).run();
  try { await mutation.run(); } finally { await env.DB.prepare(guard.sql).run(); }
}
export async function pendingFixture(proofCount = 1) {
  const f = await intakeFixture(), proofId = await addProof(f), moderatorId = await addActor("moderator");
  for (let index = 1; index < proofCount; index++) await addProof(f);
  expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
  const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE kind='log' AND log_id=?").bind(f.logId).first<{ id: string }>();
  return { ...f, proofId, moderatorId, caseId: c!.id };
}
export type ReviewFixture = Awaited<ReturnType<typeof pendingFixture>>;
export async function reviewInput(f: Pick<ReviewFixture, "db">, actor: string, caseId: string) {
  const claim = await claimLogReview(f.db, actor, { caseId });
  expect(claim).toMatchObject({ ok: true });
  if (!claim.ok) throw new Error(`Claim failed: ${claim.code}`);
  const c = await loadReviewCase(f.db, actor, caseId);
  const revision = await candidateRevision(f.db, c!);
  const expectedClaimUntil = claim.data.claimUntil;
  const proofs = await candidateProofs(f.db, c!, revision!.id);
  const proofVerdicts = [];
  for (const proof of proofs) {
    const response = await downloadReviewProof(f.db, env.PROOFS, actor, proof.id, { caseId, revisionId: revision!.id, expectedClaimUntil }, reviewSecret);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(proof.size_bytes);
    proofVerdicts.push({ proofId: proof.id, sha256: proof.sha256, verdict: "accept" as const, reason: "Synthetic evidence establishes the client, event and rating.", viewToken: response.headers.get("X-FLAG-Proof-View")! });
  }
  return { caseId, revisionId: revision!.id, expectedCurrentRevisionId: c!.current_revision_id, expectedClaimUntil, proofVerdicts, reason: "The supplied evidence supports this factual decision." };
}
export async function publishedFixture(proofCount = 1) {
  const f = await pendingFixture(proofCount), input = await reviewInput(f, f.moderatorId, f.caseId);
  expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: true });
  return { ...f, revisionId: input.revisionId };
}
export function correctionFields(input: Awaited<ReturnType<typeof reviewInput>>) {
  return { caseId: input.caseId, expectedClaimUntil: input.expectedClaimUntil, expectedCurrentRevisionId: input.expectedCurrentRevisionId,
    proofVerdicts: input.proofVerdicts, reason: input.reason };
}
export async function publication(logId: string) {
  return env.DB.prepare("SELECT status,current_revision_id,published_at,expires_at,first_submitted_at,anchor_date FROM engagement_log WHERE id=?").bind(logId).first<{ status: string; current_revision_id: string | null; published_at: string; expires_at: string; first_submitted_at: string; anchor_date: string }>();
}
