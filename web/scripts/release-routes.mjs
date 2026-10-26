import assert from "node:assert/strict";
import { POLICY_VERSIONS } from "../src/lib/policies.ts";

// Node 24 reads the policy source directly, so a policy bump updates both probes.
const protectedPages = [
  "/home", "/onboarding", "/verification", "/moderation/verification", "/moderation/verification/nonexistent",
];
export const ANONYMOUS_ROUTES = Object.freeze([
  "/", ...protectedPages, "/sign-in", "/legal/privacy", "/legal/terms", "/api/auth/get-session",
]);

export function checkAnonymousRoute({ path, response, body, base }) {
  assert.ok(ANONYMOUS_ROUTES.includes(path), `${path}: unexpected probe route`);
  const protectedPage = protectedPages.includes(path);
  assert.equal(response.status, protectedPage ? 307 : 200, `${path}: unexpected status`);
  if (protectedPage) {
    const destination = new URL(response.headers.get("location"), base);
    assert.equal(destination.origin, new URL(base).origin, `${path}: unexpected redirect origin`);
    assert.equal(destination.pathname, "/sign-in", `${path}: unexpected redirect destination`);
  }
  if (path !== "/") assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${path}: missing noindex`);
  const policy = { "/legal/privacy": "privacy", "/legal/terms": "terms" }[path];
  if (policy) {
    // Ignore comments and hydration/script data: an incidental current date is
    // not evidence of the policy version that the page actually presents.
    const visible = body.replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const main = visible.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? "";
    const title = policy === "privacy" ? "Privacy notice" : "Terms";
    const headings = [...main.matchAll(/<h1\b[^>]*>([^<]*)<\/h1\s*>/gi)];
    assert.equal(headings.length, 1, `${path}: unexpected legal page title`);
    assert.equal(headings[0][1].trim(), title, `${path}: unexpected legal page title`);
    const versions = [...main.matchAll(/<p\b[^>]*>\s*Version\s+([^<]*?)\s*<\/p\s*>/gi)];
    assert.equal(versions.length, 1, `${path}: missing current policy version`);
    assert.equal(versions[0][1].trim(), POLICY_VERSIONS[policy], `${path}: missing current policy version`);
  }
  if (path === "/legal/privacy") assert.ok(!body.includes("permanent record"), "Outdated privacy retention copy");
  if (path === "/api/auth/get-session") assert.equal(body, "null");
}
