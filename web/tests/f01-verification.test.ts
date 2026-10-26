import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createDb } from "@/server/db";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { auditEvent, freelancerProfile, moderationCase, policyAcceptance, portfolioLink, user, verificationCase, type Role } from "@/server/db/schema";
import { assertVerifiedFreelancer } from "@/server/auth/guards-core";
import { loadViewer } from "@/server/db/queries/viewer";
import { loadVerificationQueue, loadVerificationReview, loadVerificationStatus } from "@/server/db/queries/verification";
import { submitVerification } from "@/features/verification/submit";
import { claimVerification, decideVerification, inspectVerification, releaseVerification } from "@/features/moderation/handlers";

const db = createDb(env.DB);
const request = { name: "Alex Rivera", portfolioLinks: [{ url: "https://example.com/portfolio", label: "Portfolio" }] };
async function actor(role: Role = "freelancer", current = true) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, role, name: "Owner Entered Name", email: `${id}@example.invalid` });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map((policy) => ({ id: crypto.randomUUID(), userId: id, policy, version: current ? POLICY_VERSIONS[policy] : "old" })));
  return id;
}
async function pending() {
  const owner = await actor(), mod = await actor("moderator"), other = await actor("moderator");
  const submitted = await submitVerification(db, owner, request);
  if (!submitted.ok) throw new Error(`fixture submission failed: ${submitted.code}`);
  return { owner, mod, other, caseId: submitted.moderationCaseId, requestId: submitted.verificationCaseId };
}
async function claimed() {
  const f = await pending();
  const claim = await claimVerification(db, f.mod, { caseId: f.caseId });
  if (!claim.ok) throw new Error(`fixture claim failed: ${claim.code}`);
  return { ...f, lease: { caseId: f.caseId, expectedClaimUntil: claim.claimUntil } };
}
async function inspected(nameMatch = true, result: "pass" | "fail" = "pass") {
  const f = await claimed();
  expect(await inspectVerification(db, f.mod, { ...f.lease, idKind: "passport", result, nameMatch })).toEqual({ ok: true });
  return f;
}
async function state(f: Awaited<ReturnType<typeof pending>>) {
  return {
    request: await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, f.requestId) }),
    review: await db.query.moderationCase.findFirst({ where: eq(moderationCase.id, f.caseId) }),
    profile: await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, f.owner) }),
    events: await db.select().from(auditEvent).where(eq(auditEvent.actorId, f.mod)),
  };
}

// Synthetic values exercise supported fields, rather than relying on unknown-key rejection.
const sensitiveValues = [
  ["hyphenated number", "1234-5678-9012-3456"],
  ["slash number", "1234/5678/9012/3456"],
  ["spaced number", "1234 5678 9012 3456"],
  ["compact number", "1234567890123456"],
  ["Unicode number", "１２３４－５６７８－９０１２－３４５６"],
  ["invisible separators", "1234\u200b5678\u200b9012\u200b3456"],
  ["combining-mark separators", Array.from("1234567890123456").join("\u20dd")],
  ["encoded number", "%31%32%33%34%2F%35%36%37%38%2F%39%30%31%32%2F%33%34%35%36"],
  ["marked image", "data:image/png;base64,iVBORw0KGgo="],
  ["marked QR", 'qrBody={"PCN":"synthetic-sensitive-value"}'],
  ["marked ID hash", "idHash=" + "a".repeat(64)],
  ["marked passport", "passportNumber=PABCDEF"],
] as const;
const requestPrivacyCases = sensitiveValues.flatMap(([variant, value]) => [
  { field: "name", variant, input: { ...request, name: value } },
  { field: "city", variant, input: { ...request, city: value } },
  { field: "portfolio label", variant, input: { ...request, portfolioLinks: [{ url: request.portfolioLinks[0].url, label: value }] } },
  { field: "portfolio URL", variant, input: { ...request, portfolioLinks: [{ url: `https://example.com/work?detail=${encodeURIComponent(value)}` }] } },
]);

describe("PRD-F1 verification backend", () => {
  it.each(requestPrivacyCases)("NT-05: $variant in $field rejects before any submission write", async ({ input }) => {
    const owner = await actor();
    const snapshot = async () => ({
      account: await db.query.user.findFirst({ where: eq(user.id, owner) }),
      profiles: await db.select().from(freelancerProfile).where(eq(freelancerProfile.userId, owner)),
      links: await db.select().from(portfolioLink).where(eq(portfolioLink.freelancerId, owner)),
      requests: await db.select().from(verificationCase).where(eq(verificationCase.freelancerId, owner)),
      cases: await db.select().from(moderationCase),
      events: await db.select().from(auditEvent),
    });
    const before = await snapshot();
    expect(await submitVerification(db, owner, input)).toEqual({ ok: false, code: "invalid_input", message: "Check the supplied fields. Do not include ID details or files." });
    expect(await snapshot()).toEqual(before);
  });

  it.each(sensitiveValues.flatMap(([variant, value]) => (["approve", "reject"] as const).map((decision) => ({ variant, value, decision }))))(
    "NT-05: $decision with $variant reason leaves decision, profile and audit unchanged", async ({ value, decision }) => {
      const f = await inspected(), before = await state(f);
      expect(await decideVerification(db, f.mod, { ...f.lease, decision, reason: `Live review: ${value}` })).toMatchObject({ ok: false, code: "invalid_input" });
      expect(await state(f)).toEqual(before);
    },
  );

  it("privacy validation preserves owner names, optional city, and ordinary encoded portfolio links", async () => {
    const owner = await actor();
    const input = { name: "María O’Connor / Studio 7", city: "Quezon City", portfolioLinks: [{ url: "https://example.com/Mar%C3%ADa/work?category=art+design#project-two", label: "Design 2026" }] };
    expect(await submitVerification(db, owner, input)).toMatchObject({ ok: true });
    expect((await loadViewer(db, owner))?.name).toBe(input.name);
    expect(await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, owner) })).toMatchObject({ displayName: input.name, city: input.city });
    expect(await db.query.portfolioLink.findFirst({ where: eq(portfolioLink.freelancerId, owner) })).toMatchObject(input.portfolioLinks[0]);
  });

  it.each([
    "https%3A%2F%2Fexample.invalid%2Fwork", "%3Csynthetic%3E",
    "https%253A%252F%252Fexample.invalid%252Fwork", "ｈｔｔｐｓ：//example.invalid/work",
  ].flatMap((value) => (["approve", "reject"] as const).map((decision) => ({ value, decision }))))(
    "encoded review URL or markup reason rejects $decision without mutation: $value", async ({ value, decision }) => {
      const f = await inspected(), before = await state(f);
      expect(await decideVerification(db, f.mod, { ...f.lease, decision, reason: `Live review: ${value}` })).toMatchObject({ ok: false, code: "invalid_input" });
      expect(await state(f)).toEqual(before);
    },
  );

  it("H-01: owner-entered request has no fake inspection; actual live review grants verified atomically", async () => {
    const f = await pending();
    const initial = await state(f);
    expect(initial.request).toMatchObject({ method: "live_manual", reviewerId: null, idKind: null, result: null, nameMatch: null, inspectedAt: null, decision: null, reason: null, decidedAt: null });
    expect(initial.profile).toMatchObject({ status: "pending", displayName: request.name, city: null });
    expect((await loadViewer(db, f.owner))?.name).toBe(request.name);
    expect((await loadVerificationStatus(db, f.owner))?.portfolioLinks).toHaveLength(1);
    const pendingViewer = await loadViewer(db, f.owner);
    expect(() => assertVerifiedFreelancer(pendingViewer)).toThrow();
    const claim = await claimVerification(db, f.mod, { caseId: f.caseId });
    expect(claim.ok).toBe(true); if (!claim.ok) return;
    const lease = { caseId: f.caseId, expectedClaimUntil: claim.claimUntil };
    expect(await inspectVerification(db, f.mod, { ...lease, idKind: "philid", result: "pass", nameMatch: true })).toEqual({ ok: true });
    expect((await state(f)).profile?.status).toBe("pending");
    expect(await decideVerification(db, f.mod, { ...lease, decision: "approve", reason: "Live identity and portfolio checked" })).toEqual({ ok: true });
    const final = await state(f);
    expect(final.profile?.status).toBe("verified");
    expect(final.profile?.verifiedAt).toBe(final.request?.decidedAt);
    expect(final.review).toMatchObject({ status: "decided", claimedBy: null, claimedUntil: null, decision: "approve", decidedBy: f.mod, decidedAt: final.request?.decidedAt });
    expect(final.events.map((e) => e.action)).toEqual(["moderation_claimed", "verification_inspected", "verification_decided"]);
    const viewer = await loadViewer(db, f.owner);
    expect(() => assertVerifiedFreelancer(viewer)).not.toThrow();
    expect((await submitVerification(db, f.owner, request)).ok).toBe(false);
  });

  it.each([[false, "pass"], [true, "fail"]] as const)("S-02: nameMatch=%s result=%s cannot approve", async (nameMatch, result) => {
    const f = await inspected(nameMatch, result), before = await state(f);
    expect((await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Review complete" })).ok).toBe(false);
    expect(await state(f)).toEqual(before);
    expect(await decideVerification(db, f.mod, { ...f.lease, decision: "reject", reason: "Live evidence did not meet verification requirements" })).toEqual({ ok: true });
    expect((await state(f)).profile?.status).toBe("rejected");
    const retry = await submitVerification(db, f.owner, { ...request, name: "Corrected Owner Name" });
    expect(retry.ok).toBe(true);
    expect((await db.select().from(verificationCase).where(eq(verificationCase.freelancerId, f.owner)))).toHaveLength(2);
  });

  it("AB-02: reasoned duplicate-person rejection needs no stored ID or fabricated inspection", async () => {
    const f = await claimed();
    expect(await decideVerification(db, f.mod, { ...f.lease, decision: "reject", reason: "Recognized an existing account during live review" })).toEqual({ ok: true });
    expect((await state(f)).request).toMatchObject({ reviewerId: null, idKind: null, result: null, nameMatch: null, inspectedAt: null, decision: "reject" });
  });

  it("AB-01: non-moderators, bare admin, self-review, wrong-kind and missing subject cannot mutate", async () => {
    const f = await claimed();
    for (const who of [null, f.owner, await actor("client"), await actor("admin")]) {
      const before = await state(f);
      expect((await claimVerification(db, who, { caseId: f.caseId })).ok).toBe(false);
      expect((await inspectVerification(db, who, { ...f.lease, idKind: "passport", result: "pass", nameMatch: true })).ok).toBe(false);
      expect((await decideVerification(db, who, { ...f.lease, decision: "reject", reason: "Review grounds" })).ok).toBe(false);
      expect((await releaseVerification(db, who, f.lease)).ok).toBe(false);
      expect(await state(f)).toEqual(before);
    }
    await db.update(user).set({ role: "moderator" }).where(eq(user.id, f.owner));
    expect((await claimVerification(db, f.owner, { caseId: f.caseId })).ok).toBe(false);
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(moderationCase).values([{ id: ids[0], kind: "log", subjectId: f.requestId }, { id: ids[1], kind: "verification", subjectId: "missing" }]);
    for (const caseId of ids) expect((await claimVerification(db, f.mod, { caseId })).ok).toBe(false);
    expect(await loadVerificationReview(db, f.owner, f.caseId)).toBeNull();
    expect(await loadVerificationQueue(db, await actor("admin"))).toEqual([]);
    expect(await loadVerificationReview(db, null, f.caseId)).toBeNull();
    const review = await loadVerificationReview(db, f.mod, f.caseId);
    expect(review?.portfolioLinks).toHaveLength(1);
    expect(JSON.stringify(review)).not.toContain("email");
  });

  it("NT-05/AB-23: unknown ID images/numbers/hash/QR/phone and copied ID names are rejected without storage or logs", async () => {
    const owner = await actor(), f = await claimed();
    const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error"), warn = vi.spyOn(console, "warn"), info = vi.spyOn(console, "info"), debug = vi.spyOn(console, "debug");
    const marker = "SENSITIVE_MARKER_123456789012";
    const before = await state(f), objectsBefore = await env.PROOFS.list();
    try {
      for (const key of ["idImage", "idNumber", "idHash", "qrBody", "phone", "idName", "reviewerId", "decision", "claimedBy", "freelancerId"]) {
        const a = await submitVerification(db, owner, { ...request, [key]: marker });
        const b = await inspectVerification(db, f.mod, { ...f.lease, idKind: "passport", result: "pass", nameMatch: true, [key]: marker });
        expect(a).toMatchObject({ ok: false, code: "invalid_input" });
        expect(b).toMatchObject({ ok: false, code: "invalid_input" });
        expect(JSON.stringify([a,b])).not.toContain(marker);
      }
      const rawPayloads = [
        { idImage: new File([marker], "government-id.png", { type: "image/png" }) },
        { idImage: new Blob([marker], { type: "application/pdf" }) },
        { idNumber: "1234-5678-9012-3456" },
        { qrBody: { PCN: marker, fullName: "Copied ID Name", photo: "data:image/png;base64," + marker } },
        { idHash: "a".repeat(64) }, { phone: "+639171234567" },
      ];
      for (const payload of rawPayloads) {
        expect(await submitVerification(db, owner, { ...request, ...payload })).toMatchObject({ ok: false, code: "invalid_input" });
        expect(await inspectVerification(db, f.mod, { ...f.lease, idKind: "passport", result: "pass", nameMatch: true, ...payload })).toMatchObject({ ok: false, code: "invalid_input" });
      }
      expect((await decideVerification(db, f.mod, { ...f.lease, decision: "reject", reason: marker })).ok).toBe(false);
      expect(await state(f)).toEqual(before);
      expect(await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, owner) })).toBeUndefined();
      expect((await env.PROOFS.list()).objects).toEqual(objectsBefore.objects);
      const stored = await Promise.all([db.select().from(verificationCase), db.select().from(auditEvent), db.select().from(moderationCase), db.select().from(portfolioLink)]);
      expect(JSON.stringify(stored)).not.toContain(marker);
      expect(JSON.stringify([log.mock.calls, error.mock.calls, warn.mock.calls, info.mock.calls, debug.mock.calls])).not.toContain(marker);
    } finally { log.mockRestore(); error.mockRestore(); warn.mockRestore(); info.mockRestore(); debug.mockRestore(); }
  });

  it("incomplete/unsafe requests and unknown nested fields change nothing; open review freezes identity inputs", async () => {
    const owner = await actor();
    for (const input of [{ ...request, name: " " }, { ...request, name: "email@example.com" }, { ...request, portfolioLinks: [] }, { ...request, portfolioLinks: [{ url: "javascript:alert(1)" }] }, { ...request, portfolioLinks: [{ url: "https://example.com", idNumber: "secret" }] }]) {
      expect((await submitVerification(db, owner, input)).ok).toBe(false);
    }
    expect(await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, owner) })).toBeUndefined();
    const f = await pending(), before = await state(f);
    expect((await submitVerification(db, f.owner, { ...request, name: "Replacement" })).ok).toBe(false);
    await expect(db.update(user).set({ name: "Replacement" }).where(eq(user.id, f.owner))).rejects.toThrow();
    await expect(db.update(freelancerProfile).set({ displayName: "Replacement" }).where(eq(freelancerProfile.userId, f.owner))).rejects.toThrow();
    await expect(db.delete(portfolioLink).where(eq(portfolioLink.freelancerId, f.owner))).rejects.toThrow();
    await expect(db.insert(portfolioLink).values({ id: crypto.randomUUID(), freelancerId: f.owner, url: "https://example.org" })).rejects.toThrow();
    expect(await state(f)).toEqual(before);
  });

  it("write boundary rejects banned, suspended, stale-policy and changed-role accounts", async () => {
    for (const role of ["client", "admin", "moderator"] as const) expect((await submitVerification(db, await actor(role), request)).ok).toBe(false);
    expect((await submitVerification(db, await actor("freelancer", false), request)).ok).toBe(false);
    const banned = await actor(); await db.update(user).set({ banned: true }).where(eq(user.id, banned));
    expect((await submitVerification(db, banned, request)).ok).toBe(false);
    const suspended = await actor(); await db.insert(freelancerProfile).values({ userId: suspended, displayName: "Suspended Owner", status: "suspended" });
    expect((await submitVerification(db, suspended, request)).ok).toBe(false);
    for (const change of ["banReviewer", "roleReviewer", "banOwner", "suspendOwner", "roleOwner"] as const) {
      const f = await inspected(), beforeEvents = (await state(f)).events;
      if (change === "banReviewer" || change === "banOwner") await db.update(user).set({ banned: true }).where(eq(user.id, change === "banReviewer" ? f.mod : f.owner));
      if (change === "roleReviewer" || change === "roleOwner") await db.update(user).set({ role: "client" }).where(eq(user.id, change === "roleReviewer" ? f.mod : f.owner));
      if (change === "suspendOwner") await db.update(freelancerProfile).set({ status: "suspended" }).where(eq(freelancerProfile.userId, f.owner));
      expect((await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Checked live evidence" })).ok).toBe(false);
      expect((await state(f)).request?.decision).toBeNull();
      expect((await state(f)).events).toEqual(beforeEvents);
    }
    const f = await pending();
    expect((await claimVerification(db, await actor("moderator", false), { caseId: f.caseId })).ok).toBe(false);
  });

  it("rejecting a suspended subject preserves suspension and cannot reopen submission", async () => {
    const f = await claimed();
    await db.update(freelancerProfile).set({ status: "suspended" }).where(eq(freelancerProfile.userId, f.owner));
    expect(await decideVerification(db, f.mod, { ...f.lease, decision: "reject", reason: "Account cannot complete verification" })).toEqual({ ok: true });
    expect((await state(f)).profile?.status).toBe("suspended");
    expect((await submitVerification(db, f.owner, request)).ok).toBe(false);
  });

  it("expired lease is reclaimable; new claimant must reinspect and stale releases/decisions change nothing", async () => {
    const f = await inspected();
    await db.update(moderationCase).set({ claimedUntil: "2000-01-01T00:00:00.000Z" }).where(eq(moderationCase.id, f.caseId));
    expect((await releaseVerification(db, f.mod, f.lease)).ok).toBe(false);
    const reclaim = await claimVerification(db, f.other, { caseId: f.caseId });
    expect(reclaim.ok).toBe(true); if (!reclaim.ok) return;
    const lease = { caseId: f.caseId, expectedClaimUntil: reclaim.claimUntil }, before = await state(f);
    expect((await decideVerification(db, f.other, { ...lease, decision: "approve", reason: "Old inspection" })).ok).toBe(false);
    expect((await decideVerification(db, f.other, { ...lease, decision: "reject", reason: "Old inspection" })).ok).toBe(false);
    expect((await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Stale decision" })).ok).toBe(false);
    expect(await state(f)).toEqual(before);
    expect(await inspectVerification(db, f.other, { ...lease, idKind: "ephilid", result: "pass", nameMatch: true })).toEqual({ ok: true });
    expect(await releaseVerification(db, f.other, lease)).toEqual({ ok: true });
    const events = await db.select().from(auditEvent).where(eq(auditEvent.actorId, f.other));
    expect(events.map((e) => e.action)).toEqual(["moderation_reclaimed", "verification_inspected", "moderation_released"]);
    expect((await releaseVerification(db, f.other, lease)).ok).toBe(false);
  });

  it("request/claim/decision races have one winner and zero dependent loser writes", async () => {
    const owner = await actor();
    const submissions = await Promise.all(Array.from({ length: 4 }, () => submitVerification(db, owner, request)));
    expect(submissions.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(verificationCase).where(eq(verificationCase.freelancerId, owner))).toHaveLength(1);
    expect(await db.select().from(auditEvent).where(eq(auditEvent.actorId, owner))).toHaveLength(1);
    const f = await pending();
    const claims = await Promise.all([f.mod, f.other].map((mod) => claimVerification(db, mod, { caseId: f.caseId })));
    expect(claims.filter((r) => r.ok)).toHaveLength(1);
    const mod = claims[0].ok ? f.mod : f.other, claim = claims.find((r) => r.ok)!;
    if (!claim.ok) return;
    const lease = { caseId: f.caseId, expectedClaimUntil: claim.claimUntil };
    expect(await inspectVerification(db, mod, { ...lease, idKind: "drivers_licence", result: "pass", nameMatch: true })).toEqual({ ok: true });
    const decisions = await Promise.all(["approve", "reject"].map((decision) => decideVerification(db, mod, { ...lease, decision, reason: "Live review complete" })));
    expect(decisions.filter((r) => r.ok)).toHaveLength(1);
    const final = await state(f);
    expect(final.profile?.status).toBe(final.request?.decision === "approve" ? "verified" : "rejected");
    const audit = await db.select().from(auditEvent).where(and(eq(auditEvent.subjectId, f.requestId), eq(auditEvent.action, "verification_decided")));
    expect(audit).toHaveLength(1);
    expect((await decideVerification(db, mod, { ...lease, decision: "approve", reason: "Replay" })).ok).toBe(false);
    expect(await state(f)).toEqual(final);
  });

  it("current policy changes after claim are checked for both moderator and subject at each write", async () => {
    const f = await inspected(), before = await state(f);
    const oldPrivacy = POLICY_VERSIONS.privacy, oldAck = POLICY_VERSIONS.freelancer_ack;
    try {
      Reflect.set(POLICY_VERSIONS, "privacy", "new-policy");
      expect((await releaseVerification(db, f.mod, f.lease)).ok).toBe(false);
      expect((await inspectVerification(db, f.mod, { ...f.lease, idKind: "passport", result: "pass", nameMatch: true })).ok).toBe(false);
      expect((await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Old policy must not grant" })).ok).toBe(false);
      Reflect.set(POLICY_VERSIONS, "privacy", oldPrivacy);
      Reflect.set(POLICY_VERSIONS, "freelancer_ack", "new-ack");
      expect((await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Subject must accept current acknowledgment" })).ok).toBe(false);
      expect(await state(f)).toEqual(before);
    } finally {
      Reflect.set(POLICY_VERSIONS, "privacy", oldPrivacy);
      Reflect.set(POLICY_VERSIONS, "freelancer_ack", oldAck);
    }
    expect(await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Current policies and live evidence checked" })).toEqual({ ok: true });
  });

  it("claim, inspection and release audit SQL failure rolls back each preceding transition", async () => {
    for (const action of ["moderation_claimed", "verification_inspected", "moderation_released"] as const) {
      const f = await claimed(), g = action === "moderation_claimed" ? await pending() : f;
      const before = await state(g);
      await env.DB.exec(`CREATE TRIGGER test_fail_review_audit BEFORE INSERT ON audit_event WHEN NEW.action = '${action}' BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END`);
      try {
        const result = action === "moderation_claimed" ? await claimVerification(db, g.mod, { caseId: g.caseId })
          : action === "verification_inspected" ? await inspectVerification(db, f.mod, { ...f.lease, idKind: "passport", result: "pass", nameMatch: true })
          : await releaseVerification(db, f.mod, f.lease);
        expect(result).toMatchObject({ ok: false, code: "unavailable" });
      } finally { await env.DB.exec("DROP TRIGGER test_fail_review_audit"); }
      expect(await state(g)).toEqual(before);
    }
  });

  it("simultaneous release versus decision has one winner with only its corresponding event", async () => {
    const f = await inspected(), before = await state(f);
    const outcomes = await Promise.all([
      releaseVerification(db, f.mod, f.lease),
      decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Live review complete" }),
    ]);
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    const after = await state(f);
    expect(after.events).toHaveLength(before.events.length + 1);
    if (outcomes[0].ok) {
      expect(after.request).toEqual(before.request);
      expect(after.profile).toEqual(before.profile);
      expect(after.review?.status).toBe("open");
    } else {
      expect(after.profile?.status).toBe("verified");
      expect(after.review?.status).toBe("decided");
    }
  });

  it("actual SQL failures roll back name/profile/request/audit and decision grant together", async () => {
    const owner = await actor(), name = (await loadViewer(db, owner))?.name;
    await env.DB.exec("CREATE TRIGGER test_fail_verification_request BEFORE INSERT ON moderation_case WHEN NEW.kind = 'verification' BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END");
    try { expect(await submitVerification(db, owner, request)).toMatchObject({ ok: false, code: "unavailable" }); }
    finally { await env.DB.exec("DROP TRIGGER test_fail_verification_request"); }
    expect((await loadViewer(db, owner))?.name).toBe(name);
    expect(await db.select().from(freelancerProfile).where(eq(freelancerProfile.userId, owner))).toHaveLength(0);
    expect(await db.select().from(verificationCase).where(eq(verificationCase.freelancerId, owner))).toHaveLength(0);
    expect(await db.select().from(auditEvent).where(eq(auditEvent.actorId, owner))).toHaveLength(0);
    const f = await inspected(), before = await state(f);
    await env.DB.exec("CREATE TRIGGER test_fail_verification_grant BEFORE UPDATE OF status ON freelancer_profile WHEN NEW.status = 'verified' BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END");
    try { expect(await decideVerification(db, f.mod, { ...f.lease, decision: "approve", reason: "Live identity checked" })).toMatchObject({ ok: false, code: "unavailable" }); }
    finally { await env.DB.exec("DROP TRIGGER test_fail_verification_grant"); }
    expect(await state(f)).toEqual(before);
  });
});
