import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "better-auth/client";
import { eq } from "drizzle-orm";
import { session } from "@/server/db/schema";
import { BASE, setup } from "./helpers";

describe("PRD-F7 durable logout", () => {
  it("reports failed D1 revocation to the real client, keeps its cookie retryable, then revokes copied-cookie access", async () => {
    const { auth, db, signIn, ip } = setup();
    const { res, cookie, userId } = await signIn("logout-failure@example.invalid");
    expect(res.status).toBe(200);
    expect(cookie).toContain("session_token=");
    const readSession = () => auth.api.getSession({ headers: new Headers({ cookie }) });
    expect((await readSession())?.user.id).toBe(userId);

    // A real SQLite/D1 write failure, below the library and the app hooks.
    await db.$client.exec("CREATE TRIGGER test_logout_failure BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'synthetic private database failure'); END;");
    let lastResponse: Response | undefined;
    const client = createAuthClient({
      baseURL: BASE,
      fetchOptions: {
        customFetchImpl: async (input, init) => {
          const request = new Request(input, init);
          request.headers.set("cookie", cookie);
          request.headers.set("origin", BASE);
          request.headers.set("cf-connecting-ip", ip);
          const response = await auth.handler(request);
          lastResponse = response.clone();
          return response;
        },
      },
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await client.signOut();
      expect((await readSession())?.user.id).toBe(userId);
      expect(await db.select().from(session).where(eq(session.userId, userId!))).toHaveLength(1);
      // SignOutButton navigates only when this client's result has no error.
      expect(result.error).toMatchObject({ status: 503, code: "SESSION_REVOCATION_FAILED" });
      expect(result.data).toBeNull();
      expect(lastResponse?.status).toBe(503);
      expect(lastResponse?.headers.get("location")).toBeNull();
      expect(lastResponse?.headers.get("set-cookie")).toBeNull();
      expect(await lastResponse?.text()).not.toMatch(/synthetic private|success|logout-failure@/);
      expect(errorLog.mock.calls).toEqual([["Sign-out session revocation failed"]]);
    } finally {
      errorLog.mockRestore();
      await db.$client.exec("DROP TRIGGER test_logout_failure;");
    }

    const [retry, concurrentRetry] = await Promise.all([client.signOut(), client.signOut()]);
    expect(retry.error).toBeNull();
    expect(concurrentRetry.error).toBeNull();
    expect(retry.data).toMatchObject({ success: true });
    expect(lastResponse?.headers.get("set-cookie")).toMatch(/session_token=;.*Max-Age=0/i);
    expect(await db.select().from(session).where(eq(session.userId, userId!))).toHaveLength(0);
    expect(await readSession()).toBeNull();
    // Replaying the old signed cookie, or having no cookie, remains idempotent.
    expect((await client.signOut()).error).toBeNull();
    expect((await auth.handler(new Request(`${BASE}/api/auth/sign-out`, {
      method: "POST", headers: { origin: BASE, "content-type": "application/json", "cf-connecting-ip": ip }, body: "{}",
    }))).status).toBe(200);
  });

  it("rejects cross-origin logout and untrusted callbacks before revoking the session", async () => {
    const { auth, signIn, ip } = setup();
    const { cookie, userId } = await signIn("logout-csrf@example.invalid");
    for (const [origin, body] of [
      ["https://untrusted.example", {}],
      ["", {}],
      [BASE, { callbackURL: "https://untrusted.example" }],
    ] as const) {
      const response = await auth.handler(new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST", headers: { origin, cookie, "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id).toBe(userId);
    }
  });

  it("retains library body validation without revoking a session on malformed input", async () => {
    const { auth, post, signIn } = setup();
    const { cookie, userId } = await signIn("logout-invalid@example.invalid");
    expect((await post("/sign-out", { callbackURL: 42 }, cookie)).status).toBe(400);
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id).toBe(userId);
  });

  it("does not revoke another session when its cookie signature is forged", async () => {
    const { auth, post, signIn } = setup();
    const { cookie, userId } = await signIn("logout-signature@example.invalid");
    // Keep the real token, corrupt only the signature.
    const forged = `${cookie.slice(0, -1)}${cookie.endsWith("x") ? "y" : "x"}`;
    expect((await post("/sign-out", {}, forged)).status).toBe(200);
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id).toBe(userId);
  });
});
