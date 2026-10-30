import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { freelancerProfile, moderationCase, policyAcceptance, user, verificationCase, type Role } from "@/server/db/schema";
import { loadVerificationQueue } from "@/server/db/queries/verification";
import { claimVerification, decideVerification } from "@/features/moderation/handlers";

const db = createDb(env.DB);

async function actor(role: Role) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, role, name: "Sam Santos", email: `${id}@example.invalid` });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map(policy => ({
    id: crypto.randomUUID(), userId: id, policy, version: POLICY_VERSIONS[policy],
  })));
  return id;
}

async function request(owner: string, createdAt: string, id = crypto.randomUUID()) {
  await db.insert(freelancerProfile).values({ userId: owner, displayName: "Sam Santos", status: "pending" });
  await db.insert(verificationCase).values({ id, freelancerId: owner, createdAt });
  const caseId = crypto.randomUUID();
  await db.insert(moderationCase).values({ id: caseId, kind: "verification", subjectId: id, createdAt });
  return { id, caseId };
}

async function serverTime() {
  const row = await env.DB.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS now").first<{ now: string }>();
  if (!row) throw new Error("Missing server clock");
  return Date.parse(row.now);
}

describe("PRD-F4 verification queue", () => {
  it("uses database time for waiting hours, overdue and oldest-first/id tie ordering", async () => {
    const reviewer = await actor("moderator"), now = await serverTime(), suffix = crypto.randomUUID();
    const newest = await request(await actor("freelancer"), new Date(now).toISOString());
    const tieTime = new Date(now - 37 * 3600_000).toISOString();
    const second = await request(await actor("freelancer"), tieTime, `b-${suffix}`);
    const first = await request(await actor("freelancer"), tieTime, `a-${suffix}`);
    const ids = [newest.id, second.id, first.id];
    const queue = (await loadVerificationQueue(db, reviewer)).filter(row => ids.includes(row.request.id));
    expect(queue.map(row => row.request.id)).toEqual([first.id, second.id, newest.id]);
    expect(queue[0]).toMatchObject({ waitingHours: 37, overdue: true });
    expect(queue[2]).toMatchObject({ waitingHours: 0, overdue: false });
    for (const row of queue) {
      const elapsed = Date.parse(row.serverNow) - Date.parse(row.request.createdAt);
      expect(row.waitingHours).toBe(Math.floor(elapsed / 3600_000));
      expect(row.overdue).toBe(elapsed > 36 * 3600_000);
    }
  });

  it("excludes self-review, signed-out/non-reviewer access and unsupported case kinds", async () => {
    const reviewer = await actor("moderator"), timestamp = new Date(await serverTime()).toISOString();
    const own = await request(reviewer, timestamp);
    const other = await request(await actor("freelancer"), timestamp);
    const futureCase = crypto.randomUUID();
    await db.insert(moderationCase).values({ id: futureCase, kind: "log", subjectId: other.id });
    const queue = await loadVerificationQueue(db, reviewer);
    expect(queue.some(row => row.review.id === own.caseId || row.review.id === futureCase)).toBe(false);
    expect(queue.some(row => row.review.id === other.caseId)).toBe(true);
    expect(await loadVerificationQueue(db, null)).toEqual([]);
    expect(await loadVerificationQueue(db, await actor("admin"))).toEqual([]);
    expect(await loadVerificationQueue(db, await actor("freelancer"))).toEqual([]);
  });

  it("removes a decided request while retaining claimed waiting requests", async () => {
    const reviewer = await actor("moderator");
    const pending = await request(await actor("freelancer"), new Date(await serverTime()).toISOString());
    const claim = await claimVerification(db, reviewer, { caseId: pending.caseId });
    expect(claim.ok).toBe(true);
    if (!claim.ok) throw new Error("Claim failed");
    expect((await loadVerificationQueue(db, reviewer)).find(row => row.review.id === pending.caseId)).toMatchObject({ claimActive: true });
    expect(await decideVerification(db, reviewer, { caseId: pending.caseId, expectedClaimUntil: claim.claimUntil, decision: "reject", reason: "Portfolio context is missing." })).toEqual({ ok: true });
    expect((await loadVerificationQueue(db, reviewer)).some(row => row.review.id === pending.caseId)).toBe(false);
  });
});
