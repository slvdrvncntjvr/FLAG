import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createDb } from "@/server/db";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { user, policyAcceptance, verificationCase, freelancerProfile, portfolioLink, moderationCase, auditEvent, type Role } from "@/server/db/schema";
import { submitVerification } from "@/features/verification/submit";
import { claimVerification, decideVerification, inspectVerification } from "@/features/moderation/handlers";
import { loadVerificationReview } from "@/server/db/queries/verification";
import { parseSubmittedProfile } from "@/features/verification/submitted-profile";
import { verificationInput } from "@/features/verification/schema";

const db = createDb(env.DB);
async function actor(role: Role) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, role, name: "Alex Rivera", email: `${id}@example.invalid` });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map(policy => ({ id: crypto.randomUUID(), userId: id, policy, version: POLICY_VERSIONS[policy] })));
  return id;
}

it("reopening a rejected case after resubmission retains the original name, city, links and inspection", async () => {
  const owner = await actor("freelancer"), mod = await actor("moderator");
  const original = { name: "Original Owner", city: "Original City", portfolioLinks: [{ url: "https://example.com/original", label: "Original portfolio" }] };
  const first = await submitVerification(db, owner, original);
  if (!first.ok) throw new Error(first.code);
  const claim = await claimVerification(db, mod, { caseId: first.moderationCaseId });
  if (!claim.ok) throw new Error(claim.code);
  const lease = { caseId: first.moderationCaseId, expectedClaimUntil: claim.claimUntil };
  expect(await inspectVerification(db, mod, { ...lease, idKind: "passport", result: "fail", nameMatch: false })).toEqual({ ok: true });
  expect(await decideVerification(db, mod, { ...lease, decision: "reject", reason: "Please correct the profile and portfolio" })).toEqual({ ok: true });
  const before = await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, first.verificationCaseId) });
  const corrected = { name: "Corrected Owner", city: "Corrected City", portfolioLinks: [{ url: "https://example.com/corrected", label: "Corrected portfolio" }] };
  const second = await submitVerification(db, owner, corrected);
  if (!second.ok) throw new Error(second.code);
  const oldCase = await loadVerificationReview(db, mod, first.moderationCaseId);
  // These assertions run against the old query too: the regression is the
  // replacement of the original portfolio by the corrected current portfolio.
  expect(oldCase?.portfolioLinks.map(({ url, label }) => ({ url, label }))).toEqual(original.portfolioLinks);
  expect(oldCase).toMatchObject({ submittedProfile: original, currentProfile: null, request: { decision: "reject", result: "fail", nameMatch: false } });
  expect(await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, first.verificationCaseId) })).toEqual(before);
  expect(await loadVerificationReview(db, mod, second.moderationCaseId)).toMatchObject({ submittedProfile: corrected, currentProfile: null });
});

it("captures the same winning validated submission without IDs and rejects snapshot changes while undecided", async () => {
  const owner = await actor("freelancer");
  const forms = [
    { name: "First Name", city: "First City", portfolioLinks: [{ url: "https://example.com/123456789", label: "First project" }] },
    { name: "Second Name", city: "Second City", portfolioLinks: [{ url: "https://example.com/987654321", label: "Second project" }] },
  ];
  const results = await Promise.all(forms.map(form => submitVerification(db, owner, form)));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  const winningForm = forms[results.findIndex(result => result.ok)];
  const request = await db.query.verificationCase.findFirst({ where: eq(verificationCase.freelancerId, owner) });
  expect(JSON.parse(request!.submittedProfile!)).toEqual(winningForm);
  expect(await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, owner) })).toMatchObject({ displayName: winningForm.name, city: winningForm.city });
  expect((await db.select().from(portfolioLink).where(eq(portfolioLink.freelancerId, owner))).map(({ url, label }) => ({ url, label }))).toEqual(winningForm.portfolioLinks);
  await expect(env.DB.prepare("UPDATE verification_case SET submitted_profile = ? WHERE id = ?").bind(JSON.stringify(forms[1]) + " ", request!.id).run()).rejects.toThrow(/immutable/);
  await expect(env.DB.prepare("UPDATE verification_case SET submitted_profile = NULL WHERE id = ?").bind(request!.id).run()).rejects.toThrow(/immutable/);
  expect(await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, request!.id) })).toEqual(request);
});

it("rolls back the snapshot, profile, links and audit when a later statement fails", async () => {
  const owner = await actor("freelancer");
  const originalUser = await db.query.user.findFirst({ where: eq(user.id, owner) });
  await env.DB.prepare("CREATE TRIGGER fail_snapshot_review BEFORE INSERT ON moderation_case BEGIN SELECT RAISE(ABORT, 'injected batch failure'); END").run();
  try {
    expect(await submitVerification(db, owner, { name: "Changed Name", portfolioLinks: [{ url: "https://example.com/12345678" }] })).toMatchObject({ ok: false, code: "unavailable" });
    expect(await db.query.user.findFirst({ where: eq(user.id, owner) })).toEqual(originalUser);
    expect(await db.select().from(freelancerProfile).where(eq(freelancerProfile.userId, owner))).toEqual([]);
    expect(await db.select().from(portfolioLink).where(eq(portfolioLink.freelancerId, owner))).toEqual([]);
    expect(await db.select().from(verificationCase).where(eq(verificationCase.freelancerId, owner))).toEqual([]);
    expect(await db.select().from(auditEvent).where(eq(auditEvent.actorId, owner))).toEqual([]);
  } finally { await env.DB.prepare("DROP TRIGGER fail_snapshot_review").run(); }
});

it("never reconstructs decided legacy originals, and labels current data separately only for fresh legacy inspection", async () => {
  const owner = await actor("freelancer"), mod = await actor("moderator");
  await db.insert(freelancerProfile).values({ userId: owner, displayName: "Current Name", city: "Current City", status: "pending" });
  await db.insert(portfolioLink).values({ id: crypto.randomUUID(), freelancerId: owner, url: "https://example.com/current", label: "Current work" });
  const requestId = crypto.randomUUID(), caseId = crypto.randomUUID();
  await db.insert(verificationCase).values({ id: requestId, freelancerId: owner });
  await db.insert(moderationCase).values({ id: caseId, kind: "verification", subjectId: requestId });
  const current = { name: "Current Name", city: "Current City", portfolioLinks: [{ url: "https://example.com/current", label: "Current work" }] };
  expect(await loadVerificationReview(db, mod, caseId)).toMatchObject({ submittedProfile: null, portfolioLinks: [], currentProfile: current });
  const claim = await claimVerification(db, mod, { caseId });
  if (!claim.ok) throw new Error(claim.code);
  expect(await decideVerification(db, mod, { caseId, expectedClaimUntil: claim.claimUntil, decision: "reject", reason: "Fresh inspection required" })).toEqual({ ok: true });
  const legacy = await loadVerificationReview(db, mod, caseId);
  expect(legacy).toMatchObject({ submittedProfile: null, portfolioLinks: [], currentProfile: null });
  expect(JSON.stringify(legacy)).not.toContain("Current Name");
  expect(JSON.stringify(legacy)).not.toContain("https://example.com/current");
  await expect(env.DB.prepare("UPDATE verification_case SET submitted_profile = ? WHERE id = ?").bind(JSON.stringify({ name: current.name, portfolioLinks: current.portfolioLinks }), requestId).run()).rejects.toThrow(/immutable/);
});

it("treats malformed, unsafe or unexpected snapshot shapes as unavailable without logs", () => {
  const warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error");
  const safe = { name: "Alex Rivera", portfolioLinks: [{ url: "https://example.com/12345678" }] };
  try {
    expect(parseSubmittedProfile(JSON.stringify(safe))).toEqual(safe);
    for (const value of [null, "", "{", "null", "[]", "1", "a".repeat(150_001), JSON.stringify({ ...safe, copiedId: "synthetic" }), JSON.stringify({ ...safe, name: "123456" }), JSON.stringify({ ...safe, portfolioLinks: [{ url: "javascript:alert(1)" }] })]) {
      expect(parseSubmittedProfile(value)).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally { warn.mockRestore(); error.mockRestore(); }
});

it("can read every accepted maximum-size snapshot even with worst-case JSON escaping", () => {
  const prefix = "https://example.com/";
  const form = { name: "A".repeat(160), city: "\u0001".repeat(160), portfolioLinks: Array.from({ length: 10 }, () => ({
    url: prefix + "\u0001".repeat(2048 - prefix.length), label: "\u0001".repeat(100),
  })) };
  const accepted = verificationInput.parse(form);
  const serialized = JSON.stringify(accepted);
  expect(serialized.length).toBeGreaterThan(24_000);
  expect(parseSubmittedProfile(serialized)).toEqual(accepted);
});
