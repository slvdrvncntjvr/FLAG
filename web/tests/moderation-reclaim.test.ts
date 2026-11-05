import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { auditEvent, freelancerProfile, moderationCase, policyAcceptance, user, verificationCase, type Role } from "@/server/db/schema";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { submitVerification } from "@/features/verification/submit";
import { claimVerification, decideVerification, inspectVerification, releaseVerification } from "@/features/moderation/handlers";

const db = createDb(env.DB);
async function actor(role: Role) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, role, name: "Alex Rivera", email: `${id}@example.invalid` });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map(policy => ({
    id: crypto.randomUUID(), userId: id, policy, version: POLICY_VERSIONS[policy],
  })));
  return id;
}
async function fixture() {
  const owner = await actor("freelancer"), reviewer = await actor("moderator"), other = await actor("moderator");
  const request = await submitVerification(db, owner, { name: "Alex Rivera", portfolioLinks: [{ url: "https://example.com/work" }] });
  if (!request.ok) throw new Error("Request fixture failed");
  const caseId = request.moderationCaseId, requestId = request.verificationCaseId;
  expect((await claimVerification(db, reviewer, { caseId })).ok).toBe(true);
  // Give the first lease a distinct, live expiry without a wall-clock sleep.
  const first = await env.DB.prepare("UPDATE moderation_case SET claimed_until=strftime('%Y-%m-%dT%H:%M:%fZ','now','+29 minutes') WHERE id=? RETURNING claimed_until").bind(caseId).first<{ claimed_until: string }>();
  const lease = { caseId, expectedClaimUntil: first!.claimed_until };
  expect(await inspectVerification(db, reviewer, { ...lease, idKind: "passport", result: "pass", nameMatch: true })).toEqual({ ok: true });
  const snapshot = async () => ({
    request: await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, requestId) }),
    review: await db.query.moderationCase.findFirst({ where: eq(moderationCase.id, caseId) }),
    profile: await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, owner) }),
    events: await db.select().from(auditEvent).orderBy(auditEvent.id),
  });
  return { owner, reviewer, other, lease, caseId, requestId, snapshot };
}

describe("reviewer-owned inspection across claim renewal", () => {
  for (const renewal of ["release", "expiry"] as const) {
    for (const returning of [true, false]) {
      it(`${returning ? "same" : "different"} reviewer after ${renewal}/reclaim retains evidence and enforces the current lease`, async () => {
        const f = await fixture(), inspected = (await f.snapshot()).request!;
        if (renewal === "release") expect(await releaseVerification(db, f.reviewer, f.lease)).toEqual({ ok: true });
        else {
          const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_case_update'").first<{ sql: string }>();
          if (!guard) throw new Error("Case authority guard unavailable");
          await expect(db.update(moderationCase).set({ claimedUntil: "2000-01-01T00:00:00.000Z" }).where(eq(moderationCase.id, f.caseId))).rejects.toThrow();
          // Clock-only setup; all real actions below retain the production guard.
          await env.DB.prepare("DROP TRIGGER pilot_case_update").run();
          try { await db.update(moderationCase).set({ claimedUntil: "2000-01-01T00:00:00.000Z" }).where(eq(moderationCase.id, f.caseId)); }
          finally { await env.DB.prepare(guard.sql).run(); }
        }
        const inactive = await f.snapshot();
        expect((await decideVerification(db, f.reviewer, { ...f.lease, decision: "approve", reason: "Earlier inspection" })).ok).toBe(false);
        expect(await f.snapshot()).toEqual(inactive);

        const reviewer = returning ? f.reviewer : f.other;
        const claim = await claimVerification(db, reviewer, { caseId: f.caseId });
        if (!claim.ok) throw new Error("Reclaim failed");
        const lease = { caseId: f.caseId, expectedClaimUntil: claim.claimUntil }, reclaimed = await f.snapshot();
        expect(reclaimed.request).toEqual(inspected);
        expect((await decideVerification(db, f.reviewer, { ...f.lease, decision: "approve", reason: "Stale lease" })).ok).toBe(false);
        expect(await f.snapshot()).toEqual(reclaimed);

        if (!returning) {
          expect((await decideVerification(db, reviewer, { ...lease, decision: "approve", reason: "Predecessor evidence" })).ok).toBe(false);
          expect(await f.snapshot()).toEqual(reclaimed);
          expect(await inspectVerification(db, reviewer, { ...lease, idKind: "ephilid", result: "pass", nameMatch: true })).toEqual({ ok: true });
        }
        expect(await decideVerification(db, reviewer, { ...lease, decision: "approve", reason: "Personally inspected live, matching name" })).toEqual({ ok: true });
        const final = await f.snapshot();
        expect(final.request).toMatchObject({ decision: "approve", reviewerId: reviewer });
        if (returning) expect(final.request).toMatchObject({ inspectedAt: inspected.inspectedAt, idKind: inspected.idKind });
        expect(final.profile?.status).toBe("verified");
        expect(final.review).toMatchObject({ status: "decided", decidedBy: reviewer });
        expect(final.events.filter(e => e.subjectId === f.requestId && e.action === "verification_inspected")).toHaveLength(returning ? 1 : 2);
        expect((await decideVerification(db, reviewer, { ...lease, decision: "approve", reason: "Replay" })).ok).toBe(false);
        expect(await f.snapshot()).toEqual(final);
      });
    }
  }
});
