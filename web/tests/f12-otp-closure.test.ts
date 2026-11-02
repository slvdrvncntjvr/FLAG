import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { assessPrivacyRequest, executePrivacyRequest, recordPrivacyRequest } from "@/features/privacy/handlers";
import type { Assessment } from "@/features/privacy/schema";
import { account, authVerification, user } from "@/server/db/schema";
import { addActor } from "./private-intake-fixtures";
import { setup } from "./helpers";

const iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
const types = ["sign-in", "email-verification", "forget-password", "change-email"] as const;
function assessment(subject: string, targets: Assessment["targets"]): Assessment {
  return { targets, identity: { method: "non_id_control", evidenceReference: "synthetic-control", verifiedSubjectId: subject, verifiedAt: iso(-1000) },
    categories: [{ category: "identity", disposition: "remove", basis: "Synthetic assessed closure with finite shell purpose", until: iso(86400000) }], backups: "unverified" };
}
async function request(f: ReturnType<typeof setup>, admin: string, subject: string, kind: "closure" | "deletion") {
  const r = await recordPrivacyRequest(f.db, admin, { subjectUserId: subject, responsibleId: admin, kind, receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!r.ok || !r.id) throw new Error("request_fixture");
  return r.id;
}
async function seedCode(f: ReturnType<typeof setup>, identifier: string, expiresAt = iso(600000)) {
  const id = crypto.randomUUID();
  await f.db.insert(authVerification).values({ id, identifier, value: "synthetic-historical-hash:0", expiresAt });
  return id;
}

describe("PRD-F12 exact OTP erasure through assessed closure", () => {
  it("erases genuinely issued codes and credentials before scrubbing, denies stale signup and preserves nearby accounts", async () => {
    const f = setup(), email = `otp_${crypto.randomUUID()}@example.invalid`;
    const signed = await f.signIn(email), subject = signed.userId!;
    expect(signed.res.status).toBe(200);
    const others = [`other-${email}`, `sign-in-otp-${email}`];
    const unrelated = await Promise.all(others.map(other => f.signIn(other)));
    expect(unrelated.map(s => s.res.status)).toEqual([200, 200]);
    for (const address of [email, ...others]) {
      expect((await f.post("/email-otp/send-verification-otp", { email: address, type: "sign-in" })).status).toBe(200);
    }
    const stale = f.codes.get(email)!, otherCodes = others.map(address => f.codes.get(address)!);
    expect((await f.post("/email-otp/send-verification-otp", { email, type: "email-verification" })).status).toBe(200);
    // Generic server creation supports scalar change-email even though the
    // separate old/new-address HTTP flow is disabled in our configuration.
    await f.auth.api.createVerificationOTP({ body: { email, type: "change-email" } });
    await seedCode(f, `forget-password-otp-${email}`); // Historical reset codes: new reset issuance is denied.
    await f.db.insert(account).values({ id: crypto.randomUUID(), userId: subject, providerId: "google", accountId: subject, accessToken: "synthetic-provider-token" });
    const before = await f.db.select().from(authVerification);
    for (const type of types) expect(before.some(v => v.identifier === `${type}-otp-${email}`)).toBe(true);
    const admin = await addActor("admin"), id = await request(f, admin, subject, "closure");
    expect(await assessPrivacyRequest(f.db, admin, id, assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }]))).toEqual({ ok: true });
    expect((await executePrivacyRequest(f.db, env, admin, id)).ok).toBe(true);
    expect(await env.DB.prepare("SELECT name,email,email_verified,deactivated_at FROM user WHERE id=?").bind(subject).first()).toMatchObject({
      name: "Closed account", email: `${subject}@closed.invalid`, email_verified: 0, deactivated_at: expect.any(String),
    });
    expect(await env.DB.prepare("SELECT 1 FROM session WHERE user_id=?").bind(subject).first()).toBeNull();
    expect(await f.db.select().from(account).where(eq(account.userId, subject))).toEqual([]);
    const after = await f.db.select().from(authVerification);
    for (const type of types) expect(after.some(v => v.identifier === `${type}-otp-${email}`)).toBe(false);
    expect(after.filter(v => others.some(other => v.identifier === `sign-in-otp-${other}`))).toEqual(before.filter(v => others.some(other => v.identifier === `sign-in-otp-${other}`)));
    expect((await f.post("/sign-in/email-otp", { email, otp: stale })).status).toBe(400);
    expect(await f.db.select().from(user).where(eq(user.email, email))).toEqual([]);
    await expect(f.auth.api.signInEmailOTP({ body: { email, otp: stale } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    for (const [i, address] of others.entries()) {
      const response = await f.post("/sign-in/email-otp", { email: address, otp: otherCodes[i] });
      expect(response.status).toBe(200);
      expect((await response.json() as { user: { id: string } }).user.id).toBe(unrelated[i].userId);
    }
    const fresh = await f.signIn(email);
    expect(fresh.res.status).toBe(200); expect(fresh.userId).not.toBe(subject);
    expect((await f.db.select().from(user).where(eq(user.id, subject)))[0].deactivatedAt).not.toBeNull();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("binds all four scalar typed identifiers to exactly their subject and rejects foreign assessed erasure", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`), subject = signed.userId!;
    const email = (await f.db.select().from(user).where(eq(user.id, subject)))[0].email;
    const admin = await addActor("admin"), other = await addActor("client");
    const ids = await Promise.all(types.map(type => seedCode(f, `${type}-otp-${email}`)));
    for (const id of ids) {
      expect((await env.DB.prepare("SELECT subject_user_id FROM pilot_privacy_subject_target WHERE target_type='auth_verification' AND target_id=?").bind(id).all()).results).toEqual([{ subject_user_id: subject }]);
    }
    const foreignRequest = await request(f, admin, other, "deletion");
    const targets: Assessment["targets"] = ids.map(id => ({ targetType: "auth_verification", targetId: id, operation: "purge", basis: "assessed_erasure", dueAt: iso(-1000) }));
    expect(await assessPrivacyRequest(f.db, admin, foreignRequest, assessment(other, targets))).toEqual({ ok: false, error: "invalid_input" });
    const ownRequest = await request(f, admin, subject, "deletion");
    expect(await assessPrivacyRequest(f.db, admin, ownRequest, assessment(subject, targets))).toEqual({ ok: true });
    expect((await executePrivacyRequest(f.db, env, admin, ownRequest)).ok).toBe(true);
    for (const id of ids) expect(await env.DB.prepare("SELECT 1 FROM auth_verification WHERE id=?").bind(id).first()).toBeNull();
    expect((await f.db.select().from(user).where(eq(user.id, subject)))[0].deactivatedAt).toBeNull();
  });

  it("purges expired accountless and disabled-flow codes at their own deadline while keeping live codes", async () => {
    const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
    expect((await f.post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(200);
    const issued = await f.db.query.authVerification.findFirst({ where: eq(authVerification.identifier, `sign-in-otp-${email}`) });
    expect(issued).toBeDefined();
    const expired = await seedCode(f, `change-email-otp-old-${email}-new-${email}`, iso(-1));
    const boundary = await seedCode(f, `email-verification-otp-${email}`, iso(3600000));
    await env.DB.prepare("UPDATE auth_verification SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (?,?)").bind(issued!.id, boundary).run();
    const live = await seedCode(f, `sign-in-otp-live-${email}`);
    const limiters = (await env.DB.prepare("SELECT * FROM auth_rate_limit ORDER BY key").all()).results;
    const result = await runMaintenance(env);
    expect(result.blocked).toBe(0);
    for (const id of [issued!.id, expired, boundary]) {
      expect(await env.DB.prepare("SELECT 1 FROM auth_verification WHERE id=?").bind(id).first()).toBeNull();
      expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE target_type='auth_verification' AND target_id=?").bind(id).first()).toEqual({ status: "completed" });
    }
    expect(await env.DB.prepare("SELECT 1 FROM auth_verification WHERE id=?").bind(live).first()).not.toBeNull();
    expect((await env.DB.prepare("SELECT * FROM auth_rate_limit ORDER BY key").all()).results).toEqual(limiters);
  });
});
