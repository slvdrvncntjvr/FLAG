import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { createAuth } from "@/server/auth/config";
import { authVerification, freelancerProfile, user, verificationCase } from "@/server/db/schema";
import { BASE, setup } from "./helpers";

const CHECK_DENIED = { code: "OTP_CHECK_DISABLED", message: "Use the email sign-in or verification form." };
const FROZEN = { code: "REVIEWED_NAME_FIXED", message: "This name cannot be changed while under review or verified." };
const UNAVAILABLE = { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable. Try again later." };
const captureConsole = () => (["error", "warn", "info", "log", "debug", "trace", "dir", "dirxml", "table", "assert", "count", "countReset", "group", "groupCollapsed", "groupEnd", "time", "timeEnd", "timeLog", "clear"] as const)
  .filter(method => typeof console[method] === "function")
  .map(method => vi.spyOn(console, method).mockImplementation(() => {}));
const privateError = () => new Error("SELECT private_sql params private-name@example.invalid 654321", {
  cause: new Error("nested_private_cause", { cause: new Error("deep_private_cause") }),
});
const assertSafe = (spies: ReturnType<typeof captureConsole>, body: unknown) => {
  const events = spies.flatMap(spy => spy.mock.calls);
  // JSON.stringify(Error) hides its message/stack/cause. Inspect the actual
  // argument shape too, so forwarding an Error object cannot pass unnoticed.
  for (const [code, ...metadata] of events) {
    expect(code).toMatch(/^AUTH_[A-Z_]+$/);
    if (metadata.length) {
      expect(code).toBe("AUTH_LIBRARY_EVENT");
      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({ severity: expect.stringMatching(/^(error|warn|info)$/) });
    }
  }
  const output = JSON.stringify([events, body]);
  expect(output).not.toMatch(/SELECT|private_sql|private-name|654321|nested_private|deep_private|stack|params|Safe Replacement|Reviewed Person/);
  expect(output.length).toBeLessThan(2500);
};

describe("auth route and error safety", () => {
  it("denies concurrent HTTP and server-only checks before reading a sign-in proof, then permits one sign-in", async () => {
    const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
    expect((await f.signIn(email)).res.status).toBe(200);
    await f.post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    const otp = f.codes.get(email)!;
    const before = await f.db.select().from(authVerification);
    const ctx = await f.auth.$context;
    const lookup = vi.spyOn(ctx.internalAdapter, "findVerificationValue");
    const results = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const body = { email, type: "sign-in" as const, otp: index % 2 ? otp : "incorrect" };
      const headers = new Headers({ origin: BASE, "content-type": "application/json", "cf-connecting-ip": `2001:db8:${(500 + index).toString(16)}::1` });
      if (index % 3) return f.auth.handler(new Request(`${BASE}/api/auth/email-otp/check-verification-otp`, {
        method: "POST", headers, body: JSON.stringify(body),
      }));
      return f.auth.api.checkVerificationOTP({ body, headers, asResponse: true });
    }));
    expect(results.map(r => r.status)).toEqual(Array(10).fill(403));
    for (const result of results) expect(await result.json()).toEqual(CHECK_DENIED);
    await expect(f.auth.api.checkVerificationOTP({ body: { email, type: "sign-in", otp } })).rejects.toMatchObject({ status: "FORBIDDEN", body: CHECK_DENIED });
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
    expect(await f.db.select().from(authVerification)).toEqual(before);
    expect((await f.post("/sign-in/email-otp", { email, otp })).status).toBe(200);
    expect((await f.post("/sign-in/email-otp", { email, otp })).status).toBe(400);
  });

  it("keeps the three-attempt sign-in budget and single-use verify-email", async () => {
    const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
    const signed = await f.signIn(email);
    await f.post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    const otp = f.codes.get(email)!;
    for (let attempt = 0; attempt < 3; attempt++) expect((await f.post("/sign-in/email-otp", { email, otp: "incorrect" })).status).toBe(400);
    expect((await f.post("/sign-in/email-otp", { email, otp })).status).toBe(403);
    await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, signed.userId!));
    expect((await f.post("/email-otp/send-verification-otp", { email, type: "email-verification" })).status).toBe(200);
    const verificationOtp = f.codes.get(email)!;
    expect((await f.post("/email-otp/verify-email", { email, otp: verificationOtp })).status).toBe(200);
    expect((await f.post("/email-otp/verify-email", { email, otp: verificationOtp })).status).toBe(400);
  });

  it.each(["pending", "verified"] as const)("deliberately denies safe replacement names for %s reviews and allows name no-ops", async status => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`, { name: "Reviewed Person" });
    const id = signed.userId!;
    await f.db.insert(freelancerProfile).values({ userId: id, displayName: "Reviewed Person", status });
    const reviewerId = crypto.randomUUID(), reviewedAt = new Date(Date.now() - 1000).toISOString();
    if (status === "verified") await f.db.insert(user).values({ id: reviewerId, name: "Reviewer", email: `${reviewerId}@example.invalid`, role: "moderator" });
    await f.db.insert(verificationCase).values({
      id: crypto.randomUUID(), freelancerId: id, createdAt: reviewedAt,
      submittedProfile: JSON.stringify({ name: "Reviewed Person", city: null, portfolioLinks: ["https://example.invalid/work"] }),
      // Exercise verified-profile freezing independently of an open-case freeze.
      ...(status === "verified" ? { reviewerId, idKind: "passport" as const, result: "pass" as const,
        nameMatch: true, inspectedAt: reviewedAt, decision: "approve" as const,
        reason: "Manual review completed", decidedAt: reviewedAt } : {}),
    });
    const snapshot = async () => ({
      user: await f.db.query.user.findFirst({ where: eq(user.id, id) }),
      profile: await f.db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, id) }),
      cases: await f.db.select().from(verificationCase),
    });
    const before = await snapshot(), spies = captureConsole();
    try {
      const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(FROZEN);
      await expect(f.auth.api.updateUser({ headers: new Headers({ cookie: signed.cookie }), body: { name: "Safe Replacement" } }))
        .rejects.toMatchObject({ status: "CONFLICT", body: FROZEN });
      expect(await snapshot()).toEqual(before);
      assertSafe(spies, FROZEN);
      expect((await f.post("/update-user", { name: "Reviewed Person" }, signed.cookie)).status).toBe(200);
      // Role input keeps the library's existing denial, including a same-name request.
      expect((await f.post("/update-user", { name: "Reviewed Person", role: "freelancer" }, signed.cookie)).status).toBe(400);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it.each(["http", "server"] as const)("bounds transient adapter errors and nested causes on %s calls", async seam => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    const ctx = await f.auth.$context, spies = captureConsole();
    const update = vi.spyOn(ctx.adapter, "update").mockRejectedValueOnce(privateError());
    try {
      if (seam === "http") {
        const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(UNAVAILABLE);
      } else {
        await expect(f.auth.api.updateUser({ headers: new Headers({ cookie: signed.cookie }), body: { name: "Safe Replacement" } }))
          .rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE", body: UNAVAILABLE });
      }
      assertSafe(spies, UNAVAILABLE);
      expect(spies.flatMap(spy => spy.mock.calls).length).toBeGreaterThan(0);
    } finally { update.mockRestore(); spies.forEach(spy => spy.mockRestore()); }
  });

  it("bounds session lookup failures and preserves the middleware's failed-session denial", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    const ctx = await f.auth.$context, spies = captureConsole();
    const before = await f.db.select().from(user);
    const lookup = vi.spyOn(ctx.adapter, "findOne").mockRejectedValueOnce(privateError());
    try {
      // Better Auth intentionally absorbs getSessionFromCtx errors as a missing
      // session. Keep that 401, while direct get-session failures remain 503.
      const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ code: "AUTH_REQUEST_REJECTED", message: "Check the authentication request and try again." });
      expect(await f.db.select().from(user)).toEqual(before);
      lookup.mockRejectedValueOnce(privateError());
      const direct = await f.auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: signed.cookie, "cf-connecting-ip": f.ip } }));
      expect(direct.status).toBe(503);
      const directBody = await direct.json();
      expect(directBody).toEqual(UNAVAILABLE);
      assertSafe(spies, body);
      assertSafe(spies, directBody);
    } finally { lookup.mockRestore(); spies.forEach(spy => spy.mockRestore()); }
  });

  it("emits fixed event codes for isolated delivery failures", async () => {
    const f = setup(), spies = captureConsole();
    const auth = createAuth({ BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.invalid" }, f.db, {
      sendOtp: async () => { throw privateError(); },
    });
    try {
      const response = await auth.handler(new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST", headers: { origin: BASE, "content-type": "application/json", "cf-connecting-ip": f.ip },
        body: JSON.stringify({ email: `${crypto.randomUUID()}@example.invalid`, type: "sign-in" }),
      }));
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
      assertSafe(spies, body);
      const events = spies.flatMap(spy => spy.mock.calls);
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) expect(event[0]).toMatch(/^AUTH_[A-Z_]+$/);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it("bounds failures before the route hook (general limiter) and after the handler (cookie hook)", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    const ctx = await f.auth.$context, spies = captureConsole();
    try {
      const limiter = vi.spyOn(ctx.options.rateLimit!.customStorage!, "consume").mockRejectedValueOnce(privateError());
      try {
        const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(UNAVAILABLE);
      } finally { limiter.mockRestore(); }
      const plugin = ctx.options.plugins!.find(plugin => plugin.id === "next-cookies")!;
      const hook = plugin.hooks!.after![0];
      const matcher = vi.spyOn(hook, "matcher").mockImplementationOnce(() => { throw privateError(); });
      try {
        const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(UNAVAILABLE);
      } finally { matcher.mockRestore(); }
      assertSafe(spies, UNAVAILABLE);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it.each([
    ["http", "INTERNAL_SERVER_ERROR"], ["server response", "INTERNAL_SERVER_ERROR"], ["server throw", "INTERNAL_SERVER_ERROR"],
    ["http", "BAD_REQUEST"], ["server response", "BAD_REQUEST"], ["server throw", "BAD_REQUEST"],
  ] as const)("sanitizes handler APIErrors converted by the dispatcher on %s (%s)", async (seam, status) => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    const ctx = await f.auth.$context, spies = captureConsole();
    const body = status === "BAD_REQUEST"
      ? { code: "AUTH_REQUEST_REJECTED", message: "Check the authentication request and try again." }
      : UNAVAILABLE;
    const update = vi.spyOn(ctx.adapter, "update").mockRejectedValueOnce(new APIError(status, { message: privateError().message, cause: privateError() }));
    try {
      if (seam === "server throw") {
        await expect(f.auth.api.updateUser({ headers: new Headers({ cookie: signed.cookie }), body: { name: "Safe Replacement" } }))
          .rejects.toMatchObject({ status: status === "BAD_REQUEST" ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE", body });
      } else {
        const response = seam === "http"
          ? await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie)
          : await f.auth.api.updateUser({ headers: new Headers({ cookie: signed.cookie }), body: { name: "Safe Replacement" }, asResponse: true });
        expect(response.status).toBe(status === "BAD_REQUEST" ? 400 : 503);
        expect(await response.json()).toEqual(body);
      }
      assertSafe(spies, body);
    } finally { update.mockRestore(); spies.forEach(spy => spy.mockRestore()); }
  });

  it("drops every library logger message and argument at every severity", async () => {
    const f = setup(), ctx = await f.auth.$context, spies = captureConsole();
    try {
      for (const method of ["error", "warn", "info", "debug", "success"] as const) ctx.logger[method](privateError().message, privateError(), { headers: "private_sql" });
      assertSafe(spies, null);
      expect(spies.flatMap(spy => spy.mock.calls)).toEqual([
        ["AUTH_LIBRARY_EVENT", { severity: "error" }],
        ["AUTH_LIBRARY_EVENT", { severity: "warn" }],
      ]);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it("preserves intentional local console OTP but excludes it in production even with localhost configured", async () => {
    const f = setup(), spies = captureConsole();
    const email = `${crypto.randomUUID()}@example.invalid`;
    const config = { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.invalid" };
    const request = () => new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: { origin: BASE, "content-type": "application/json", "cf-connecting-ip": f.ip }, body: JSON.stringify({ email, type: "sign-in" }) });
    try {
      const local = createAuth(config, f.db);
      expect((await local.handler(request())).status).toBe(200);
      expect(spies.flatMap(spy => spy.mock.calls).some(call => typeof call[0] === "string" && call[0].startsWith(`[dev] sign-in code for ${email}: `))).toBe(true);
      spies.forEach(spy => spy.mockClear());
      vi.stubEnv("NODE_ENV", "production");
      const production = createAuth(config, f.db);
      expect((await production.handler(request())).status).toBe(503);
      expect(JSON.stringify(spies.flatMap(spy => spy.mock.calls))).not.toContain(email);
    } finally { vi.unstubAllEnvs(); spies.forEach(spy => spy.mockRestore()); }
  });

  it("retains the SQL freeze when a review starts after the name precheck", async () => {
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`, { name: "Reviewed Person" });
    const id = signed.userId!;
    await f.db.insert(freelancerProfile).values({ userId: id, displayName: "Reviewed Person" });
    const read = f.db.query.verificationCase.findFirst.bind(f.db.query.verificationCase);
    const caseId = crypto.randomUUID(), submittedProfile = JSON.stringify({ name: "Reviewed Person", city: null, portfolioLinks: [] });
    const race = vi.spyOn(f.db.query.verificationCase, "findFirst").mockImplementationOnce((...args) => {
      const query = read(...args), execute = query.execute.bind(query);
      vi.spyOn(query, "execute").mockImplementationOnce(async () => {
        const result = await execute();
        await f.db.insert(verificationCase).values({ id: caseId, freelancerId: id, submittedProfile });
        return result;
      });
      return query;
    });
    const spies = captureConsole();
    try {
      const response = await f.post("/update-user", { name: "Safe Replacement" }, signed.cookie);
      expect(race).toHaveBeenCalledOnce();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(UNAVAILABLE);
      expect(await f.db.query.user.findFirst({ where: eq(user.id, id) })).toMatchObject({ name: "Reviewed Person" });
      expect(await f.db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, id) })).toMatchObject({ displayName: "Reviewed Person", status: "unverified" });
      expect(await f.db.query.verificationCase.findFirst({ where: eq(verificationCase.id, caseId) })).toMatchObject({ submittedProfile });
      const output = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
      expect(output).not.toMatch(/Safe Replacement|Reviewed Person|UPDATE|update.*user|params|cause|reviewed name is fixed/);
      assertSafe(spies, UNAVAILABLE);
    } finally { race.mockRestore(); spies.forEach(spy => spy.mockRestore()); }
  });
});
