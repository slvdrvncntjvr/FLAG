import { describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { acceptOnboarding } from "@/features/onboarding/accept";
import { POLICY_VERSIONS } from "@/lib/policies";
import { AccessError, assertVerifiedFreelancer } from "@/server/auth/guards-core";
import { isOnboarded, loadViewer } from "@/server/db/queries/viewer";
import { authVerification, freelancerProfile, policyAcceptance, user } from "@/server/db/schema";
import { setup } from "./helpers";

const FREELANCER_FORM = { role: "freelancer", privacy: "on", terms: "on", ack_proof: "on", ack_not_legal: "on", ack_false_logs: "on" };

describe("PRD-F7 accounts and sign-in", () => {
  it("H-07: email code creates an account with no role, then onboarding sets freelancer", async () => {
    const { db, signIn } = setup();
    const { res, userId } = await signIn("h07@example.com");
    expect(res.status).toBe(200);
    const viewer = await loadViewer(db, userId!);
    expect(viewer?.role).toBeNull();
    expect(viewer && isOnboarded(viewer)).toBe(false);

    expect(await acceptOnboarding(db, userId!, FREELANCER_FORM)).toEqual({ ok: true });
    expect((await loadViewer(db, userId!))?.role).toBe("freelancer");
  });

  it("a wrong code is rejected and the account is not created", async () => {
    const { db, post, codes } = setup();
    await post("/email-otp/send-verification-otp", { email: "s11@example.com", type: "sign-in" });
    const wrong = codes.get("s11@example.com") === "000000" ? "111111" : "000000";
    const res = await post("/sign-in/email-otp", { email: "s11@example.com", otp: wrong });
    expect(res.status).toBe(400);
    expect(await db.query.user.findFirst({ where: eq(user.email, "s11@example.com") })).toBeUndefined();
  });

  it("S-11: expired code is rejected without creating an account", async () => {
    const { db, post, codes } = setup();
    const email = "expired@example.com";
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    await db.update(authVerification).set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(like(authVerification.identifier, `%${email}%`));
    expect((await post("/sign-in/email-otp", { email, otp: codes.get(email) })).status).toBe(400);
    expect(await db.query.user.findFirst({ where: eq(user.email, email) })).toBeUndefined();
  });

  it("AB-12: role in the sign-up payload is refused", async () => {
    const { db, signIn } = setup();
    const { res } = await signIn("ab12@example.com", { role: "moderator" });
    expect(res.status).toBe(400);
    expect(await db.query.user.findFirst({ where: eq(user.email, "ab12@example.com") })).toBeUndefined();
  });

  it("AB-12: role in the update payload is refused", async () => {
    const { db, signIn, post } = setup();
    const { cookie, userId } = await signIn("ab12b@example.com");
    const res = await post("/update-user", { role: "admin" }, cookie);
    expect(res.status).toBe(400);
    expect((await loadViewer(db, userId!))?.role).toBeNull();
  });

  it("AB-12: onboarding cannot pick a staff role or change a role already set", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("ab12c@example.com");
    const staff = await acceptOnboarding(db, userId!, { ...FREELANCER_FORM, role: "admin" });
    expect(staff.ok).toBe(false);
    await acceptOnboarding(db, userId!, { role: "client", privacy: "on", terms: "on" });
    await acceptOnboarding(db, userId!, { ...FREELANCER_FORM });
    expect((await loadViewer(db, userId!))?.role).toBe("client");
  });

  it("a suspended account cannot start a session", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("banned@example.com");
    await db.update(user).set({ banned: true }).where(eq(user.id, userId!));
    const again = await signIn("banned@example.com");
    expect(again.res.status).toBe(403);
    expect(again.cookie).toBe("");
  });
});

describe("PRD-F8 onboarding and legal acknowledgment", () => {
  it("H-08: stores acceptances with the current versions", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("h08@example.com");
    await acceptOnboarding(db, userId!, FREELANCER_FORM);
    const rows = await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, userId!));
    expect(rows.map((r) => [r.policy, r.version]).sort()).toEqual(
      [
        ["freelancer_ack", POLICY_VERSIONS.freelancer_ack],
        ["privacy", POLICY_VERSIONS.privacy],
        ["terms", POLICY_VERSIONS.terms],
      ].sort(),
    );
    expect(isOnboarded((await loadViewer(db, userId!))!)).toBe(true);
  });

  it("freelancer must confirm all three statements", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("ack@example.com");
    const result = await acceptOnboarding(db, userId!, { ...FREELANCER_FORM, ack_false_logs: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.ack_false_logs).toBeDefined();
    expect((await loadViewer(db, userId!))?.role).toBeNull();
    expect(await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, userId!))).toHaveLength(0);
    expect(await acceptOnboarding(db, userId!, { role: "client", privacy: "on", terms: "on" })).toEqual({ ok: true });
    expect((await loadViewer(db, userId!))?.role).toBe("client");
  });

  it("client does not need the freelancer statements", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("client@example.com");
    expect(await acceptOnboarding(db, userId!, { role: "client", privacy: "on", terms: "on" })).toEqual({ ok: true });
  });

  it("S-12: an acceptance for an old version leaves the user not onboarded", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("s12@example.com");
    await db.update(user).set({ role: "client" }).where(eq(user.id, userId!));
    await db.insert(policyAcceptance).values([
      { id: crypto.randomUUID(), userId: userId!, policy: "privacy", version: "2026-01-01" },
      { id: crypto.randomUUID(), userId: userId!, policy: "terms", version: POLICY_VERSIONS.terms },
    ]);
    const viewer = (await loadViewer(db, userId!))!;
    expect(viewer.missingPolicies).toEqual(["privacy"]);
    expect(isOnboarded(viewer)).toBe(false);
  });

  it("policy acceptances are append-only", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("append@example.com");
    await acceptOnboarding(db, userId!, { role: "client", privacy: "on", terms: "on" });
    await expect(db.update(policyAcceptance).set({ version: "x" }).where(eq(policyAcceptance.userId, userId!))).rejects.toThrow();
    await expect(db.delete(policyAcceptance).where(eq(policyAcceptance.userId, userId!))).rejects.toThrow();
    // Deleting the account still cascades (PRD-F12).
    await db.delete(user).where(eq(user.id, userId!));
    expect(await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, userId!))).toHaveLength(0);
  });
});

describe("NT-10 (INV-8)", () => {
  it("an unonboarded or unverified freelancer is refused", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("nt10@example.com");
    expect(() => assertVerifiedFreelancer(null)).toThrow(AccessError);
    const fresh = (await loadViewer(db, userId!))!;
    expect(() => assertVerifiedFreelancer(fresh)).toThrow(AccessError);
    await acceptOnboarding(db, userId!, FREELANCER_FORM);
    const onboarded = (await loadViewer(db, userId!))!;
    expect(isOnboarded(onboarded)).toBe(true);
    expect(() => assertVerifiedFreelancer(onboarded)).toThrow(AccessError);
  });
});

describe("NT-10 (INV-8) real verification status", () => {
  it("only verified current-policy non-banned freelancers pass the shared guard", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("nt10-real-profile@example.com");
    await acceptOnboarding(db, userId!, FREELANCER_FORM);
    await db.insert(freelancerProfile).values({ userId: userId!, displayName: "Owner Name" });
    for (const status of ["unverified", "pending", "rejected", "suspended", "verified"] as const) {
      await db.update(freelancerProfile).set({ status }).where(eq(freelancerProfile.userId, userId!));
      const viewer = await loadViewer(db, userId!);
      if (status === "verified") expect(() => assertVerifiedFreelancer(viewer)).not.toThrow();
      else expect(() => assertVerifiedFreelancer(viewer)).toThrow(AccessError);
    }
    await db.update(user).set({ banned: true }).where(eq(user.id, userId!));
    const banned = await loadViewer(db, userId!);
    expect(() => assertVerifiedFreelancer(banned)).toThrow(AccessError);
  });

  it("verified status never bypasses stale or missing policies or a different role", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("nt10-stale-verified@example.com");
    await db.update(user).set({ role: "freelancer" }).where(eq(user.id, userId!));
    await db.insert(freelancerProfile).values({ userId: userId!, displayName: "Owner Name", status: "verified" });
    await db.insert(policyAcceptance).values([
      { id: crypto.randomUUID(), userId: userId!, policy: "privacy", version: "old" },
      { id: crypto.randomUUID(), userId: userId!, policy: "terms", version: POLICY_VERSIONS.terms },
      { id: crypto.randomUUID(), userId: userId!, policy: "freelancer_ack", version: POLICY_VERSIONS.freelancer_ack },
    ]);
    const stale = await loadViewer(db, userId!);
    expect(stale?.freelancerStatus).toBe("verified");
    expect(() => assertVerifiedFreelancer(stale)).toThrow(AccessError);
    await acceptOnboarding(db, userId!, FREELANCER_FORM);
    await db.update(user).set({ role: "client" }).where(eq(user.id, userId!));
    const client = await loadViewer(db, userId!);
    expect(() => assertVerifiedFreelancer(client)).toThrow(AccessError);
  });
});

describe("PRD-F7 sign-in code limits", () => {
  it("a sixth code request for one IP+email is rate limited", async () => {
    const { post } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post("/email-otp/send-verification-otp", { email: "rate-limit@example.com", type: "sign-in" })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
