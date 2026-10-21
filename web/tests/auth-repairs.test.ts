import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { acceptOnboarding } from "@/features/onboarding/accept";
import { createAuth } from "@/server/auth/config";
import { createAuthRateLimiter, OTP_LIMIT } from "@/server/auth/rate-limit";
import { loadViewer } from "@/server/db/queries/viewer";
import { authRateLimit, policyAcceptance } from "@/server/db/schema";
import { setup, BASE } from "./helpers";

const CLIENT = { role: "client", privacy: "on", terms: "on" };
const SECRET = "audit-test-secret-should-never-be-used-in-production";

describe("PRD-F7 email delivery failures", () => {
  const base = "https://auth-review.example.invalid";
  const request = (email: string, ip: string) => new Request(`${base}/api/auth/email-otp/send-verification-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": ip },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const config = { BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: base, MAIL_FROM: "test@example.invalid" };

  it("returns 503 instead of success when delivery fails, without leaking the provider error", async () => {
    const { db, ip } = setup();
    const email = "delivery-failure@example.invalid";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = createAuth(config, db, { sendOtp: async (_, otp) => { throw new Error(`private-provider-detail ${email} ${otp}`); } });
      const response = await auth.handler(request(email, ip));
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
      expect(JSON.stringify(body)).not.toMatch(/private-provider-detail|delivery-failure@|success/);
      expect(errorLog.mock.calls).toEqual([["Sign-in email delivery failed"]]);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("isolates concurrent success/failure and permits a successful retry on the same auth instance", async () => {
    const { db, ip } = setup();
    let unavailable = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = createAuth(config, db, { sendOtp: async email => {
        await Promise.resolve();
        if (unavailable && email.startsWith("fails")) throw new Error("simulated unavailable provider");
      } });
      const responses = await Promise.all([
        auth.handler(request("fails@example.invalid", ip)),
        auth.handler(request("succeeds@example.invalid", ip)),
      ]);
      expect(responses.map(response => response.status)).toEqual([503, 200]);
      expect(await responses[1].json()).toEqual({ success: true });
      unavailable = false;
      expect((await auth.handler(request("fails@example.invalid", ip))).status).toBe(200);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("reports Brevo quota/server rejection as unavailable without exposing provider response contents", async () => {
    const { db, ip } = setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = createAuth({ ...config, BREVO_API_KEY: "synthetic-test-key" }, db);
      for (const status of [429, 500]) {
        fetchMock.mockResolvedValueOnce(new Response("private-provider-response", { status }));
        const response = await auth.handler(request(`provider-${status}@example.invalid`, ip));
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
      }
      expect(errorLog.mock.calls.flat().join(" ")).not.toContain("private-provider-response");
    } finally {
      fetchMock.mockRestore();
      errorLog.mockRestore();
    }
  });

  it("handles a provider network timeout with a bounded request and a retryable response", async () => {
    const { db, ip } = setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = createAuth({ ...config, BREVO_API_KEY: "synthetic-test-key" }, db);
      const response = await auth.handler(request("timeout@example.invalid", ip));
      expect(response.status).toBe(503);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(await response.json()).toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
    } finally {
      fetchMock.mockRestore();
      errorLog.mockRestore();
    }
  });
});

describe("PRD-F8 atomic onboarding", () => {
  it("rolls back the role if a policy insert fails", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("rollback@example.com");
    const escapedId = userId!.replaceAll("'", "''");
    await db.$client.exec(`CREATE TRIGGER test_policy_failure BEFORE INSERT ON policy_acceptance WHEN NEW.user_id = '${escapedId}' BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
    try {
      expect((await acceptOnboarding(db, userId!, CLIENT)).ok).toBe(false);
      expect((await loadViewer(db, userId!))?.role).toBeNull();
      expect(await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, userId!))).toHaveLength(0);
    } finally {
      await db.$client.exec("DROP TRIGGER test_policy_failure;");
    }
    expect(await acceptOnboarding(db, userId!, CLIENT)).toEqual({ ok: true });
  });

  it("concurrent duplicate submissions create one acceptance per current policy", async () => {
    const { db, signIn } = setup();
    const { userId } = await signIn("concurrent-onboarding@example.com");
    const results = await Promise.all(Array.from({ length: 4 }, () => acceptOnboarding(db, userId!, CLIENT)));
    expect(results.every(result => result.ok)).toBe(true);
    expect(await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, userId!))).toHaveLength(2);
  });
});

describe("PRD-F7 durable authentication limits", () => {
  it("allows exactly five concurrent attempts across limiter instances without storing raw identifiers", async () => {
    const { db } = setup();
    const key = JSON.stringify(["otp", "203.0.113.254", "/send", "concurrency@example.com"]);
    const limiters = Array.from({ length: 10 }, () => createAuthRateLimiter(db, SECRET));
    const results = await Promise.all(limiters.map(limiter => limiter.consume(key, OTP_LIMIT)));
    expect(results.filter(result => result.allowed)).toHaveLength(5);
    const rows = await db.select().from(authRateLimit);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
    expect(rows.some(row => row.count === 5)).toBe(true);
  });

  it("resets after fifteen minutes and returns a retry delay before expiry", async () => {
    const { db } = setup();
    let now = Date.now();
    const limiter = createAuthRateLimiter(db, SECRET, () => now);
    for (let index = 0; index < 5; index++) expect((await limiter.consume("expiry-test", OTP_LIMIT)).allowed).toBe(true);
    now += 14 * 60 * 1000;
    expect(await limiter.consume("expiry-test", OTP_LIMIT)).toEqual({ allowed: false, retryAfter: 60 });
    now += 60 * 1000;
    expect((await limiter.consume("expiry-test", OTP_LIMIT)).allowed).toBe(true);
  });

  it("separates emails on the same trusted IP and lets a delivered code be verified after the send bucket fills", async () => {
    const { post, codes } = setup();
    const email = "bucket-a@example.com";
    for (let index = 0; index < 5; index++) expect((await post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(200);
    expect((await post("/email-otp/send-verification-otp", { email: "bucket-b@example.com", type: "sign-in" })).status).toBe(200);
    expect((await post("/email-otp/send-verification-otp", { email: " BUCKET-A@example.com ", type: "sign-in" })).status).toBe(429);
    expect((await post("/sign-in/email-otp", { email, otp: codes.get(email) })).status).toBe(200);
    expect((await post("/sign-in/email-otp", { email, otp: codes.get(email) })).status).toBe(400);
  });

  it("caps code emails per trusted IP across different addresses", async () => {
    const { post } = setup();
    const statuses = [];
    for (let index = 0; index < 21; index++) {
      statuses.push((await post("/email-otp/send-verification-otp", { email: `spray-${index}@example.com`, type: "sign-in" })).status);
    }
    expect(statuses.slice(0, 20).every(status => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("treats every address in one IPv6 /64 as one client", async () => {
    const { auth } = setup();
    const send = (ip: string) => auth.handler(new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip },
      body: JSON.stringify({ email: "rotating-ipv6@example.com", type: "sign-in" }),
    }));
    for (let index = 1; index <= 5; index++) expect((await send(`2001:db8:ffff:1::${index.toString(16)}`)).status).toBe(200);
    expect((await send("2001:db8:ffff:1:abcd::99")).status).toBe(429);
    expect((await send("2001:db8:ffff:2::1")).status).toBe(200);
  });

  it("rejects cross-origin OTP requests", async () => {
    const { auth } = setup();
    const response = await auth.handler(new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://untrusted.example", "cf-connecting-ip": "203.0.113.251" },
      body: JSON.stringify({ email: "csrf@example.com", type: "sign-in" }),
    }));
    expect(response.status).toBe(403);
  });

  it("fails instead of claiming email delivery when no provider is configured outside localhost", async () => {
    const { db } = setup();
    // Prefix checks must not mistake localhost.attacker.example for local development.
    const base = "http://localhost.attacker.example";
    const auth = createAuth({ BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: base, MAIL_FROM: "test@example.com" }, db);
    const response = await auth.handler(new Request(`${base}/api/auth/email-otp/send-verification-otp`, {
      method: "POST", headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": "203.0.113.250" },
      body: JSON.stringify({ email: "no-mail@example.com", type: "sign-in" }),
    }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("success");
  });
});
