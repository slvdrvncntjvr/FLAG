import { describe, expect, it } from "vitest";
import { privateResourcePreflight } from "@/lib/private-http";

describe("private resource Worker preflight", () => {
  it.each([undefined, "", " "])("denies no-cookie proof reads without framework or resources: %j", async cookie => {
    const response = privateResourcePreflight(new Request("https://flag.invalid/api/proofs/synthetic", { headers: cookie === undefined ? {} : { Cookie: cookie } }));
    expect(response?.status).toBe(404);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await response?.json()).toEqual({ error: "This log or proof is unavailable." });
  });
  it.each([undefined, "Basic synthetic", "Bearer "])("denies unsafe export authorization before framework initialization: %j", async authorization => {
    const response = privateResourcePreflight(new Request("https://flag.invalid/api/privacy/exports/synthetic", { headers: authorization ? { Authorization: authorization } : {} }));
    expect(response?.status).toBe(404);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response?.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await response?.text()).toBe("");
  });
  it("refuses query capability transport even when an authorization header exists", async () => {
    const response = privateResourcePreflight(new Request("https://flag.invalid/api/privacy/exports/synthetic?token=synthetic", { headers: { Authorization: `Bearer ${"a".repeat(64)}` } }));
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("");
  });
  it("passes cookie-bearing proofs and header-only exports to the existing authority checks without granting access", () => {
    expect(privateResourcePreflight(new Request("https://flag.invalid/api/proofs/synthetic", { headers: { Cookie: "synthetic=not-authority" } }))).toBeNull();
    expect(privateResourcePreflight(new Request("https://flag.invalid/api/privacy/exports/synthetic", { headers: { Authorization: `Bearer ${"a".repeat(64)}` } }))).toBeNull();
  });
  it("preserves unrelated routes and method handling", () => {
    for (const path of ["/home", "/api/proofs", "/api/proofs/", "/api/privacy/exports/"]) expect(privateResourcePreflight(new Request(`https://flag.invalid${path}`))).toBeNull();
    expect(privateResourcePreflight(new Request("https://flag.invalid/api/proofs/synthetic", { method: "POST" }))).toBeNull();
  });
});
