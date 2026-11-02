import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { acceptOnboarding } from "@/features/onboarding/accept";
import { createInvitation } from "@/features/engagements/handlers";
import { POLICY_VERSIONS } from "@/lib/policies";
import { commitOnboarding, loadViewer } from "@/server/db/queries/viewer";
import { engagementActor } from "@/server/db/queries/engagements";
import { account, policyAcceptance, session, user } from "@/server/db/schema";
import { BASE, setup } from "./helpers";

// Exercise the real scoped maintenance authority, preserving production guards.
// These fixtures isolate authentication from the separately tested staff UI.
async function assessTarget(f: ReturnType<typeof setup>, subjectId: string, targetType: string, targetId: string, operation: string) {
  const adminId = crypto.randomUUID(), requestId = crypto.randomUUID(), taskId = crypto.randomUUID();
  const dueAt = new Date(Date.now() - 1_000).toISOString();
  const target = { targetType, targetId, operation, dueAt };
  const scope = JSON.stringify({ targets: [target] });
  const assessment = JSON.stringify({ targets: [{ ...target, basis: "account_closure" }] });
  await f.db.insert(user).values({ id: adminId, email: `${adminId}@example.invalid`, name: "Synthetic processor", role: "admin" });
  await f.db.insert(policyAcceptance).values((["privacy", "terms"] as const).map(policy => ({
    id: crypto.randomUUID(), userId: adminId, policy, version: POLICY_VERSIONS[policy],
  })));
  await f.db.$client.prepare(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,status,scope)
    VALUES(?,?,?,'closure',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),'received',?)`)
    .bind(requestId, subjectId, adminId, scope).run();
  await f.db.$client.prepare(`UPDATE privacy_request SET status='executing',identity_verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    assessed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),assessment=? WHERE id=?`).bind(assessment, requestId).run();
  await f.db.$client.prepare(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at)
    VALUES(?,?,?,?,?,?,'account_closure',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)
    .bind(taskId, requestId, adminId, targetType, targetId, operation, dueAt).run();
  await f.db.$client.prepare(`UPDATE maintenance_task SET status='claimed',claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),attempts=attempts+1 WHERE id=?`)
    .bind(taskId).run();
}

async function deactivate(f: ReturnType<typeof setup>, subjectId: string) {
  await assessTarget(f, subjectId, "user", subjectId, "redact_identity");
  await f.db.$client.prepare(`UPDATE user SET deactivated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(subjectId).run();
}

describe("PRD-F12 closed-account authentication", () => {
  it("denies stale session reads and writes even before session cleanup, while allowing logout", async () => {
    const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
    const signed = await f.signIn(email);
    expect(signed.res.status).toBe(200);
    await deactivate(f, signed.userId!);
    expect(await f.db.select().from(session).where(eq(session.userId, signed.userId!))).toHaveLength(1);
    expect(await loadViewer(f.db, signed.userId!)).toBeNull();
    const headers = new Headers({ cookie: signed.cookie, origin: BASE });
    const http = await f.auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers }));
    expect(http.status).toBe(403);
    expect(await http.json()).toEqual({ code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable. Contact support." });
    await expect(f.auth.api.getSession({ headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect((await f.post("/update-user", { name: "Replacement name" }, signed.cookie)).status).toBe(403);
    expect((await f.db.query.user.findFirst({ where: eq(user.id, signed.userId!) }))?.name).not.toBe("Replacement name");
    expect((await f.post("/sign-out", {}, signed.cookie)).status).toBe(200);
    expect(await f.db.select().from(session).where(eq(session.userId, signed.userId!))).toHaveLength(0);
  });

  it("blocks new OTP delivery and already-issued sign-in codes through HTTP and server APIs", async () => {
    const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
    const signed = await f.signIn(email);
    await f.post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    const otp = f.codes.get(email)!;
    await deactivate(f, signed.userId!);
    const before = await f.db.select().from(session).where(eq(session.userId, signed.userId!));
    expect((await f.post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(403);
    expect((await f.post("/sign-in/email-otp", { email, otp })).status).toBe(403);
    await expect(f.auth.api.signInEmailOTP({ body: { email, otp } })).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await f.db.select().from(session).where(eq(session.userId, signed.userId!))).toEqual(before);
  });

  it("does not let onboarding or stale action identity write after closure", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    await deactivate(f, signed.userId!);
    await commitOnboarding(f.db, signed.userId!, "client", ["privacy", "terms"]);
    expect((await acceptOnboarding(f.db, signed.userId!, { role: "client", privacy: "on", terms: "on" })).ok).toBe(false);
    expect((await f.db.query.user.findFirst({ where: eq(user.id, signed.userId!) }))?.role).toBeNull();
    expect(await f.db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, signed.userId!))).toHaveLength(0);
    expect((await createInvitation(f.db, signed.userId!, { title: "Synthetic project", clientNameHint: "Synthetic client", startedOn: "2026-11-01" })).ok).toBe(false);
  });

  it("rejects direct credential creation and reactivation for a deactivated account", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    await deactivate(f, signed.userId!);
    await expect(f.db.insert(session).values({ id: crypto.randomUUID(), userId: signed.userId!, token: crypto.randomUUID(), expiresAt: "2027-01-01T00:00:00.000Z" }))
      .rejects.toThrow();
    await expect(f.db.insert(account).values({ id: crypto.randomUUID(), userId: signed.userId!, providerId: "google", accountId: crypto.randomUUID() }))
      .rejects.toThrow();
    await expect(f.db.update(user).set({ deactivatedAt: null }).where(eq(user.id, signed.userId!))).rejects.toThrow();
  });

  it("does not accept a retired current-version receipt as live onboarding authority", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    expect(await acceptOnboarding(f.db, signed.userId!, { role: "client", privacy: "on", terms: "on" })).toEqual({ ok: true });
    const receipt = (await f.db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, signed.userId!))).find(p => p.policy === "privacy")!;
    await assessTarget(f, signed.userId!, "policy_acceptance", receipt.id, "retire_policy");
    await f.db.$client.prepare(`UPDATE policy_acceptance SET retired_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(receipt.id).run();
    expect((await loadViewer(f.db, signed.userId!))?.missingPolicies).toContain("privacy");
    const actor = engagementActor("client", signed.userId!);
    expect((await f.db.$client.prepare(`SELECT CASE WHEN ${actor.text} THEN 1 ELSE 0 END AS allowed`).bind(...actor.args).first())?.allowed).toBe(0);
    expect(await acceptOnboarding(f.db, signed.userId!, { role: "client", privacy: "on", terms: "on" })).toEqual({ ok: true });
    const history = await f.db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, signed.userId!));
    expect(history.find(p => p.id === receipt.id)?.retiredAt).not.toBeNull();
    expect(history.filter(p => p.policy === "privacy")).toHaveLength(2);
    expect((await loadViewer(f.db, signed.userId!))?.missingPolicies).toEqual([]);
  });

  it("does not accept client-supplied deactivation state at signup", async () => {
    const f = setup();
    const signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`, { deactivatedAt: "2026-11-01T00:00:00.000Z" });
    expect(signed.res.status).toBe(400);
    expect(signed.cookie).toBe("");
  });
});
