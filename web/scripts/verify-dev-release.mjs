import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
import { CLOUDFLARE_ACCOUNT_ID, checkDeployedBindings, checkResourceBindings } from "./check-resource-bindings.mjs";

// Read-only deployment metadata and anonymous route checks. No sign-in mail is sent.
const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
checkResourceBindings(config, "dev");
const base = config.vars.BETTER_AUTH_URL;
assert.equal(config.name, "flag-dev");
assert.equal(base, "https://flag-dev.factsfirst.workers.dev");
const expectedDatabase = config.d1_databases.find(binding => binding.binding === "DB");
assert.equal(expectedDatabase.database_name, "flag-db-dev");

const auth = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"], {
  encoding: "utf8", timeout: 30000, windowsHide: true,
});
assert.equal(auth.status, 0, "Wrangler authentication lookup failed");
const credential = JSON.parse(auth.stdout);
assert.ok(credential.token, "A Wrangler OAuth/API token is required for metadata checks");
async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/${path}`, {
    headers: { authorization: `Bearer ${credential.token}` }, signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.success, `Cloudflare metadata request failed: ${response.status}`);
  return body.result;
}
const deployments = await api("workers/scripts/flag-dev/deployments");
const active = deployments.deployments.toSorted((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
assert.equal(active.versions.length, 1, "Expected one active dev version");
assert.equal(active.versions[0].percentage, 100);
const versionId = active.versions[0].version_id;
const version = await api(`workers/scripts/flag-dev/versions/${versionId}`);
const bindings = version.resources.bindings;
assert.deepEqual(checkDeployedBindings(config, bindings), [], "Deployed DB/auth/PROOFS bindings do not match dev");
console.log(JSON.stringify({ versionId, database: expectedDatabase.database_name, authUrl: base,
  proofBucket: config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name, bindingsVerified: true }));

const routes = await Promise.all(["/", "/home", "/onboarding", "/sign-in", "/legal/privacy", "/legal/terms", "/api/auth/get-session"].map(async path => {
  const response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  const protectedPage = path === "/home" || path === "/onboarding";
  assert.equal(response.status, protectedPage ? 307 : 200, `${path}: unexpected status`);
  if (protectedPage) assert.equal(new URL(response.headers.get("location"), base).pathname, "/sign-in");
  if (path !== "/") assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${path}: missing noindex header`);
  if (path.startsWith("/legal/")) assert.ok(body.includes("2026-10-14"), `${path}: old policy version`);
  if (path === "/legal/privacy") assert.ok(!body.includes("permanent record"), "Privacy page still has permanent-retention copy");
  if (path === "/api/auth/get-session") assert.equal(body, "null");
  return { path, status: response.status };
}));
console.log(JSON.stringify({ routesVerified: routes }));

// Invalid-code attempts exercise the real throttle without generating a code or account.
const email = `release-check-${crypto.randomUUID()}@example.invalid`;
const statuses = [];
for (let attempt = 0; attempt < 6; attempt++) {
  const response = await fetch(`${base}/api/auth/sign-in/email-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, otp: "000000" }), signal: AbortSignal.timeout(20000),
  });
  statuses.push(response.status);
  await response.arrayBuffer();
  if (attempt === 5) assert.ok(Number(response.headers.get("retry-after")) > 0, "Missing retry delay");
}
assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
console.log(JSON.stringify({ otpLimitVerified: true, statuses, mailSent: false }));
