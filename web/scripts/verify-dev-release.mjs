import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
import { CLOUDFLARE_ACCOUNT_ID, checkDeployedBindings, checkResourceBindings } from "./check-resource-bindings.mjs";
import { checkActiveRelease, parseReleaseOptions } from "./release-identity.mjs";
import { READ_ONLY_ANONYMOUS_ROUTES, checkAnonymousRoute } from "./release-routes.mjs";
import { probeDevOtpThrottle } from "./release-otp-probe.mjs";

// Default: deployment metadata and anonymous GETs only, with no cookies or auth writes.
// --otp-throttle explicitly adds up to six dev POSTs that write durable throttle state.
// Parse before authentication or any request; release mode must name its candidate.
const { expectedVersion, healthOnly, target, otpThrottle } = parseReleaseOptions(process.argv.slice(2));
const verificationMode = healthOnly ? "health-only" : "release";
if (healthOnly) console.warn(`HEALTH-ONLY: checks the currently active ${target} Worker; release identity is NOT verified.`);
if (otpThrottle) console.warn("DEV OTP THROTTLE: up to six invalid-code POSTs write durable rate-limit counters; no code request, mail or signup.");
// An explicit empty env selects production even when CLOUDFLARE_ENV is inherited.
const environment = target === "dev" ? "dev" : "";
const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
checkResourceBindings(config, environment);
const base = config.vars.BETTER_AUTH_URL;
const expectedDatabase = config.d1_databases.find(binding => binding.binding === "DB");

const auth = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"], {
  encoding: "utf8", timeout: 30000, windowsHide: true,
});
assert.equal(auth.status, 0, "Wrangler authentication lookup failed");
const credential = JSON.parse(auth.stdout);
assert.ok(credential.token, "A Wrangler OAuth/API token is required for metadata checks");
async function api(path) {
  let response, body;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/${path}`, {
      headers: { authorization: `Bearer ${credential.token}` }, redirect: "error", signal: AbortSignal.timeout(20000),
    });
    body = await response.json();
  } catch {
    throw new Error(`Cloudflare ${target} metadata request/body read failed (HTTP ${response?.status ?? "unavailable"}): ${path}; no automatic retry`);
  }
  assert.ok(response.ok && body?.success === true, `Cloudflare ${target} metadata request failed: HTTP ${response.status}`);
  return body.result;
}
const deploymentPath = `workers/scripts/${config.name}/deployments`;
const deployments = await api(deploymentPath);
const versionId = checkActiveRelease(deployments, expectedVersion, target);
const version = await api(`workers/scripts/${config.name}/versions/${versionId}`);
const bindings = version.resources?.bindings;
assert.deepEqual(checkDeployedBindings(config, bindings), [], `Deployed DB/auth/PROOFS bindings do not match ${target}`);
console.log(JSON.stringify({ verificationMode, target, expectedVersion,
  versionId, database: expectedDatabase.database_name, authUrl: base,
  proofBucket: config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name, bindingsVerified: true }));

async function requireUnchangedRelease() {
  // Recheck the original version even in health-only mode. A deployment during
  // the run invalidates the combined evidence; it must never produce success.
  const current = checkActiveRelease(await api(deploymentPath), undefined, target);
  assert.equal(current, versionId, `Active ${target} Worker changed during verification; rerun against the intended release`);
}

const routes = await Promise.all(READ_ONLY_ANONYMOUS_ROUTES.map(async path => {
  let response, body;
  try {
    response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    body = await response.text();
  } catch {
    throw new Error(`Anonymous GET ${path}: request/body read failed or timed out; no automatic retry`);
  }
  checkAnonymousRoute({ path, response, body, base });
  return { path, status: response.status };
}));
console.log(JSON.stringify({ routesVerified: routes,
  routesSkipped: [{ path: "/api/auth/get-session", reason: "HTTP endpoint writes durable rate-limit counters even without a cookie" }] }));

await requireUnchangedRelease();
let throttle = { otpLimitVerified: false, otpThrottleSkipped: true, throttleStateWrites: false };
if (otpThrottle) {
  throttle = await probeDevOtpThrottle({ target, base });
  await requireUnchangedRelease();
}
console.log(JSON.stringify({ verificationMode, releaseIdentityVerified: !healthOnly,
  target, versionId, activeVersionStable: true, readOnly: !otpThrottle, ...throttle, mailSent: false }));
