import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@/server/auth/config";
import { account, authVerification, session, user } from "@/server/db/schema";
import { BASE, setup } from "./helpers";

const config = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  BETTER_AUTH_URL: BASE,
  MAIL_FROM: "test@example.invalid",
};
const PASSWORD = "synthetic-test-password-only";
const DENIED = { code: "PASSWORD_AUTH_DISABLED", message: "Password authentication is unavailable. Use an email sign-in code." };

function fixture(extra: Partial<Parameters<typeof createAuth>[0]> = {}) {
  const { db, ip } = setup();
  const sendOtp = vi.fn<(email: string, otp: string) => Promise<void>>(async () => {});
  const auth = createAuth({ ...config, ...extra }, db, { sendOtp });
  const email = `${crypto.randomUUID()}@example.invalid`;
  const headers = (cookie?: string) => new Headers({
    "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip,
    ...(cookie ? { cookie } : {}),
  });
  const post = (path: string, body: unknown, cookie?: string) => auth.handler(new Request(`${BASE}/api/auth${path}`, {
    method: "POST", headers: headers(cookie), body: JSON.stringify(body),
  }));
  async function signIn() {
    expect((await post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(200);
    const otp = sendOtp.mock.calls.at(-1)![1];
    const response = await post("/sign-in/email-otp", { email, otp });
    expect(response.status).toBe(200);
    const { user: signedUser } = await response.json() as { user: { id: string } };
    sendOtp.mockClear();
    return { userId: signedUser.id, cookie: response.headers.get("set-cookie")!.split(";")[0] };
  }
  const snapshot = async () => ({
    accounts: await db.select().from(account).orderBy(account.id),
    verifications: await db.select().from(authVerification).orderBy(authVerification.id),
    users: await db.select().from(user).orderBy(user.id),
    sessions: await db.select().from(session).orderBy(session.id),
  });
  return { db, auth, email, sendOtp, post, headers, signIn, snapshot };
}

async function seedResetOtp(f: ReturnType<typeof fixture>, expired = false) {
  const otp = "123456";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  await f.db.insert(authVerification).values({
    id: crypto.randomUUID(), identifier: `forget-password-otp-${f.email}`, value: `${hash}:0`,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 600_000)).toISOString(),
  });
  return otp;
}

async function expectDenied(f: ReturnType<typeof fixture>, action: () => Promise<Response>) {
  const before = await f.snapshot();
  const response = await action();
  // State assertions come first so the unfixed regression exposes actual writes.
  expect(await f.snapshot()).toEqual(before);
  expect(f.sendOtp).not.toHaveBeenCalled();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(DENIED);
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("PRD-F7 passwordless authentication", () => {
  it.each([
    "/email-otp/request-password-reset", "/forget-password/email-otp", "/email-otp/send-verification-otp",
  ])("denies %s for existing and unknown email without sending or replacing a code", async path => {
    const f = fixture();
    await f.signIn();
    await seedResetOtp(f);
    for (const email of [f.email, `unknown-${f.email}`]) {
      await expectDenied(f, () => f.post(path, { email, type: "forget-password" }));
    }
  });

  it.each(["valid", "wrong", "expired", "existing credential"])("denies OTP reset with a %s code without consuming or modifying verification state", async kind => {
    const f = fixture();
    const { userId } = await f.signIn();
    if (kind === "existing credential") await f.db.insert(account).values({
      id: crypto.randomUUID(), userId, providerId: "credential", accountId: userId, password: null,
    });
    const otp = await seedResetOtp(f, kind === "expired");
    await expectDenied(f, () => f.post("/email-otp/reset-password", {
      email: f.email, otp: kind === "wrong" ? "654321" : otp, password: PASSWORD,
    }));
  });

  it.each(["valid", "wrong", "expired"])("denies generic reset-code checks with a %s code without changing attempt state", async kind => {
    const f = fixture();
    await f.signIn();
    const otp = await seedResetOtp(f, kind === "expired");
    await expectDenied(f, () => f.post("/email-otp/check-verification-otp", {
      email: f.email, type: "forget-password", otp: kind === "wrong" ? "654321" : otp,
    }));
  });

  it.each(["body", "query"])("denies core token reset through the %s without consuming a valid token", async location => {
    const f = fixture();
    const { userId } = await f.signIn();
    if (location === "query") await f.db.insert(account).values({
      id: crypto.randomUUID(), userId, providerId: "credential", accountId: userId, password: null,
    });
    const token = crypto.randomUUID();
    await f.db.insert(authVerification).values({
      id: crypto.randomUUID(), identifier: `reset-password:${token}`, value: userId,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    await expectDenied(f, () => f.post(`/reset-password${location === "query" ? `?token=${token}` : ""}`, {
      newPassword: PASSWORD, ...(location === "body" ? { token } : {}),
    }));
    await expectDenied(f, () => f.auth.handler(new Request(`${BASE}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(BASE)}`, {
      headers: f.headers(),
    })));
  });

  it.each(["/request-password-reset", "/sign-up/email", "/sign-in/email", "/change-password", "/verify-password"])(
    "denies unused password endpoint %s without mutation", async path => {
      const f = fixture();
      const { cookie } = await f.signIn();
      await expectDenied(f, () => f.post(path, {
        email: f.email, name: "Alex Rivera", password: PASSWORD, newPassword: PASSWORD, currentPassword: PASSWORD,
      }, cookie));
    },
  );

  it("denies server-only password setup and reset-code creation without mutation", async () => {
    const f = fixture();
    const { cookie } = await f.signIn();
    const before = await f.snapshot();
    await expect(f.auth.api.setPassword({ body: { newPassword: PASSWORD }, headers: f.headers(cookie) }))
      .rejects.toMatchObject({ status: "FORBIDDEN", body: DENIED });
    expect(await f.snapshot()).toEqual(before);
    await expect(f.auth.api.createVerificationOTP({ body: { email: f.email, type: "forget-password" } }))
      .rejects.toMatchObject({ status: "FORBIDDEN", body: DENIED });
    expect(await f.snapshot()).toEqual(before);
    expect(f.sendOtp).not.toHaveBeenCalled();
  });

  it("preserves a pending ordinary sign-in code when a reset request is denied", async () => {
    const f = fixture();
    await f.signIn();
    expect((await f.post("/email-otp/send-verification-otp", { email: f.email, type: "sign-in" })).status).toBe(200);
    const otp = f.sendOtp.mock.calls.at(-1)![1];
    f.sendOtp.mockClear();
    await expectDenied(f, () => f.post("/email-otp/send-verification-otp", { email: f.email, type: "forget-password" }));
    expect((await f.post("/sign-in/email-otp", { email: f.email, otp })).status).toBe(200);
    expect(f.sendOtp).not.toHaveBeenCalled();
  });

  it("guards account creation and updates while allowing password-free Google accounts", async () => {
    const f = fixture();
    const { userId } = await f.signIn();
    const { internalAdapter } = await f.auth.$context;
    const google = await internalAdapter.createAccount({ userId, providerId: "google", accountId: "synthetic-google-id", password: null });
    await internalAdapter.updateAccount(google.id, { accessToken: "synthetic-test-token", password: null });
    const before = await f.snapshot();
    for (const fields of [{ providerId: "credential" }, { providerId: "google", password: "synthetic-hash" }]) {
      await expect(internalAdapter.createAccount({ userId, accountId: userId, ...fields }))
        .rejects.toMatchObject({ status: "FORBIDDEN", body: DENIED });
      expect(await f.snapshot()).toEqual(before);
    }
    for (const fields of [{ password: "synthetic-hash" }, { providerId: "credential" }]) {
      await expect(internalAdapter.updateAccount(google.id, fields))
        .rejects.toMatchObject({ status: "FORBIDDEN", body: DENIED });
      expect(await f.snapshot()).toEqual(before);
    }
  });

  it("keeps ordinary OTP signup/repeat sign-in, hashing and optional Google login", async () => {
    const f = fixture({ GOOGLE_CLIENT_ID: "synthetic-client-id", GOOGLE_CLIENT_SECRET: "synthetic-client-secret" });
    const first = await f.signIn();
    expect((await f.auth.api.getSession({ headers: f.headers(first.cookie) }))?.user.id).toBe(first.userId);
    const second = await f.signIn();
    expect(second.userId).toBe(first.userId);
    expect(await f.db.select().from(account).where(eq(account.userId, first.userId))).toEqual([]);
    expect((await f.auth.$context).socialProviders.map(provider => provider.id)).toContain("google");
    const withoutGoogle = fixture();
    expect((await withoutGoogle.auth.$context).socialProviders.map(provider => provider.id)).not.toContain("google");
    expect((await f.post("/email-otp/send-verification-otp", { email: f.email, type: "sign-in" })).status).toBe(200);
    const otp = f.sendOtp.mock.calls.at(-1)![1];
    const rows = await f.db.select().from(authVerification);
    expect(rows.find(row => row.identifier === `sign-in-otp-${f.email}`)?.value).not.toContain(otp);
  });
});
