import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { commitOnboarding } from "@/server/db/queries/viewer";
import { POLICY_VERSIONS } from "@/lib/policies";
import { BASE, setup } from "./helpers";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}));
// Only the server viewer helper is exercised here; Next's browser navigation
// module cannot initialize in the Workers test runtime.
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("Unexpected redirect"); }) }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));
vi.mock("@/server/db", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/db")>(),
  getDb: vi.fn(),
}));

function context() {
  vi.mocked(getCloudflareContext).mockResolvedValue({
    env: { ...env, BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.com" },
    cf: undefined, ctx: createExecutionContext(),
  });
  vi.mocked(getDb).mockReset().mockRejectedValue(new Error("Unexpected fallback database setup"));
}

describe("explicit request database setup keeps authentication live", () => {
  it("uses the supplied client and observes current policy, role, ban and session revocation", async () => {
    context();
    const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`);
    const requestDb = async () => f.db;
    expect(signed.res.status).toBe(200);
    await commitOnboarding(f.db, signed.userId!, "client", ["privacy", "terms"]);
    request.headers = new Headers({ cookie: signed.cookie, origin: BASE });
    expect(await getViewer(requestDb)).toMatchObject({ id: signed.userId, role: "client", missingPolicies: [] });

    const original = POLICY_VERSIONS.privacy;
    try {
      Reflect.set(POLICY_VERSIONS, "privacy", "2099-01-01");
      expect((await getViewer(requestDb))?.missingPolicies).toContain("privacy");
    } finally { Reflect.set(POLICY_VERSIONS, "privacy", original); }

    await f.db.$client.prepare("UPDATE user SET role='admin' WHERE id=?").bind(signed.userId!).run();
    expect((await getViewer(requestDb))?.role).toBe("admin");
    await f.db.$client.prepare("UPDATE user SET banned=1 WHERE id=?").bind(signed.userId!).run();
    expect(await getViewer(requestDb)).toBeNull();
    await f.db.$client.prepare("UPDATE user SET banned=0 WHERE id=?").bind(signed.userId!).run();
    expect((await getViewer(requestDb))?.id).toBe(signed.userId);
    expect((await f.post("/sign-out", {}, signed.cookie)).status).toBe(200);
    expect(await getViewer(requestDb)).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("does not retain another request's subject when headers and client change", async () => {
    context();
    const first = setup(), second = setup();
    const a = await first.signIn(`${crypto.randomUUID()}@example.invalid`);
    const b = await second.signIn(`${crypto.randomUUID()}@example.invalid`);
    expect(a.res.status).toBe(200); expect(b.res.status).toBe(200);
    request.headers = new Headers({ cookie: a.cookie, origin: BASE });
    expect((await getViewer(async () => first.db))?.id).toBe(a.userId);
    request.headers = new Headers({ cookie: b.cookie, origin: BASE });
    expect((await getViewer(async () => second.db))?.id).toBe(b.userId);
    request.headers = new Headers();
    expect(await getViewer(async () => first.db)).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
    request.headers = new Headers({ cookie: a.cookie, origin: BASE });
    vi.mocked(getDb).mockResolvedValue(first.db);
    expect((await getViewer())?.id).toBe(a.userId);
  });
});
