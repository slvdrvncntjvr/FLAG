import { describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { GET } from "@/app/api/privacy/exports/[deliveryId]/route";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));
vi.mock("@/server/db", () => ({ getDb: vi.fn() }));
vi.mock("@/server/auth/guards", () => ({ getViewer: vi.fn() }));

describe("private export HTTP early denials", () => {
  it.each([
    { query: "", authorization: null },
    { query: "", authorization: "Basic synthetic" },
    { query: "?token=synthetic", authorization: "Bearer synthetic" },
  ])("denies unsafe delivery inputs with private headers before accessing resources: %j", async ({ query, authorization }) => {
    const headers = new Headers();
    if (authorization) headers.set("Authorization", authorization);
    const response = await GET(new Request(`https://flag.invalid/api/privacy/exports/nonexistent${query}`, { headers }), { params: Promise.resolve({ deliveryId: "nonexistent" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
    expect(getCloudflareContext).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(getViewer).not.toHaveBeenCalled();
  });
});
