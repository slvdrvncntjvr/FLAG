import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkActiveRelease, parseReleaseOptions } from "./release-identity.mjs";
import { CLOUDFLARE_ACCOUNT_ID, getDeploymentTarget } from "./check-resource-bindings.mjs";

const candidate = "56f6236e-eb0a-4627-9ada-ca9e59994ff8";
const older = "0530461e-9992-4f4c-8b28-68fbfd1d61b2";
const deployment = (versionId, createdOn = "2026-10-25T07:48:20.000Z", percentage = 100) => ({
  created_on: createdOn, versions: [{ version_id: versionId, percentage }],
});

test("release CLI requires a full explicit UUID in either option form", () => {
  for (const args of [["--expected-version", candidate], [`--expected-version=${candidate}`]]) {
    assert.deepEqual(parseReleaseOptions(args), { expectedVersion: candidate, healthOnly: false });
  }
  assert.throws(() => parseReleaseOptions([]), /requires --expected-version/);
  for (const value of ["", "56f6236e", `${candidate}/resources`, ` ${candidate}`, `${candidate}\n`, "$(whoami)"]) {
    assert.throws(() => parseReleaseOptions(["--expected-version", value]));
  }
});

test("CLI rejects missing, duplicate, unknown, positional and conflicting options", () => {
  for (const args of [
    ["--expected-version"], ["--expected-version", "--health-only"],
    ["--expected-version", candidate, "--expected-version", older],
    ["--health-only", "--health-only"], ["--health-only=true"],
    ["--health-only", "--expected-version", candidate],
    ["--expected-version", candidate, "--unknown"], [candidate], ["--", candidate],
  ]) assert.throws(() => parseReleaseOptions(args), args.join(" "));
});

test("health-only is an explicit opt-out of candidate identity", () => {
  assert.deepEqual(parseReleaseOptions(["--health-only"]), { expectedVersion: undefined, healthOnly: true });
  assert.equal(checkActiveRelease({ deployments: [deployment(older)] }), older);
});

test("an older active version fails even when the candidate was previously deployed", () => {
  const result = { deployments: [deployment(candidate, "2026-10-25T06:51:22.000Z"), deployment(older)] };
  assert.throws(() => checkActiveRelease(result, candidate), /Active dev Worker version mismatch/);
  assert.equal(result.deployments[0].versions[0].version_id, candidate, "Input history must not be mutated");
});

test("only the exact candidate at 100 percent passes release identity", () => {
  assert.equal(checkActiveRelease({ deployments: [deployment(candidate), deployment(older, "2026-10-24T00:00:00Z")] }, candidate), candidate);
  assert.throws(() => checkActiveRelease({ deployments: [deployment(candidate)] }, candidate.toUpperCase()), /version mismatch/);
});

test("split traffic, missing metadata and malformed identity fail closed", () => {
  for (const result of [
    undefined, {}, { deployments: [] }, { deployments: [null] },
    { deployments: [{ ...deployment(candidate), created_on: "invalid" }] },
    { deployments: [{ ...deployment(candidate), versions: [] }] },
    { deployments: [{ ...deployment(candidate), versions: [deployment(candidate).versions[0], deployment(older).versions[0]] }] },
    { deployments: [deployment(candidate, undefined, 99)] },
    { deployments: [deployment(candidate, undefined, "100")] },
    { deployments: [deployment("56f6236e")] },
    { deployments: [deployment(candidate), deployment(older)] },
  ]) assert.throws(() => checkActiveRelease(result, candidate));
  assert.throws(() => checkActiveRelease({ deployments: [deployment(candidate)] }, ""));
});

// Exercise the actual CLI without credentials or network. Module hooks replace
// only its Wrangler config/auth lookup; fetch rejects any unexpected request.
function runVerifier(args, activeVersion = older, subsequentVersions = [activeVersion, activeVersion]) {
  const target = getDeploymentTarget("dev");
  const config = {
    name: target.worker, account_id: CLOUDFLARE_ACCOUNT_ID,
    vars: { BETTER_AUTH_URL: target.authUrl },
    d1_databases: [{ binding: "DB", database_name: target.database, database_id: target.databaseId }],
    r2_buckets: [{ binding: "PROOFS", bucket_name: target.bucket }],
  };
  const bindings = [
    { name: "DB", type: "d1", database_id: target.databaseId },
    { name: "PROOFS", type: "r2_bucket", bucket_name: target.bucket },
    { name: "BETTER_AUTH_URL", type: "plain_text", text: target.authUrl },
  ];
  const scriptUrl = new URL("./verify-dev-release.mjs", import.meta.url).href;
  const preload = `
    import { registerHooks } from "node:module";
    const source = {
      wrangler: ${JSON.stringify(`export const unstable_readConfig = () => (${JSON.stringify(config)});`)},
      "node:child_process": 'export function spawnSync() { console.log("AUTH_LOOKUP"); return { status: 0, stdout: JSON.stringify({ token: "test-only" }) }; }',
    };
    registerHooks({ resolve(name, context, next) {
      if (context.parentURL === ${JSON.stringify(scriptUrl)} && Object.hasOwn(source, name)) {
        return { url: "data:text/javascript," + encodeURIComponent(source[name]), shortCircuit: true };
      }
      return next(name, context);
    }});
    let attempts = 0;
    const activeVersions = ${JSON.stringify([activeVersion, ...subsequentVersions])};
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(url).pathname;
      console.log("REQUEST " + (options.method || "GET") + " " + path);
      if (url.startsWith("https://api.cloudflare.com/")) {
        let result;
        if (path.endsWith("/deployments")) {
          const version = activeVersions.shift();
          result = { deployments: [{ created_on: "2026-10-25T07:48:20.000Z", versions: [{ version_id: version, percentage: 100 }] }] };
        }
        else if (path.endsWith("/versions/${activeVersion}")) result = { resources: { bindings: ${JSON.stringify(bindings)} } };
        else throw new Error("Unexpected metadata request");
        return Response.json({ success: true, result });
      }
      if (new URL(url).origin !== ${JSON.stringify(target.authUrl)}) throw new Error("Unexpected origin");
      if (path === "/api/auth/sign-in/email-otp" && options.method === "POST") {
        return new Response("", { status: ++attempts === 6 ? 429 : 400, headers: { "retry-after": "900" } });
      }
      const routes = ["/", "/home", "/onboarding", "/sign-in", "/legal/privacy", "/legal/terms", "/api/auth/get-session"];
      if (!routes.includes(path) || options.method) throw new Error("Unexpected smoke request");
      const protectedPage = path === "/home" || path === "/onboarding";
      return new Response(path === "/api/auth/get-session" ? "null" : "2026-10-14", {
        status: protectedPage ? 307 : 200, headers: { "x-robots-tag": "noindex, nofollow", location: "/sign-in" },
      });
    };
  `;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(scriptUrl), ...args], {
    encoding: "utf8", windowsHide: true, timeout: 10_000,
  });
}

test("actual CLI rejects malformed arguments before authentication or requests", () => {
  for (const args of [[], ["--expected-version=56f6236e"], ["--expected-version", candidate, "--unexpected"]]) {
    const result = runVerifier(args);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /AUTH_LOOKUP|REQUEST/);
  }
});

test("actual CLI stops an older live version before version resources, routes or OTP checks", () => {
  const result = runVerifier(["--expected-version", candidate]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Active dev Worker version mismatch/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST")).length, 1);
  assert.match(result.stdout, /\/deployments/);
});

test("actual CLI exact candidate preserves binding, access, policy and OTP checks", () => {
  const result = runVerifier([`--expected-version=${candidate}`], candidate);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"verificationMode":"release","releaseIdentityVerified":true/);
  assert.match(result.stdout, /"bindingsVerified":true/);
  assert.match(result.stdout, /"routesVerified":\[/);
  assert.match(result.stdout, /"activeVersionStable":true,"otpLimitVerified":true,"statuses":\[400,400,400,400,400,429\],"mailSent":false/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST")).length, 17);
});

test("actual CLI health-only output cannot be mistaken for candidate verification", () => {
  const result = runVerifier(["--health-only"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /HEALTH-ONLY.*release identity is NOT verified/);
  assert.match(result.stdout, /"verificationMode":"health-only","releaseIdentityVerified":false/);
});

test("actual CLI rejects a release changed during route checks before OTP probes", () => {
  const result = runVerifier(["--expected-version", candidate], candidate, [older]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /changed during verification/);
  assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true|"otpLimitVerified":true/);
});

test("actual CLI rejects a release changed during OTP checks without success output", () => {
  const result = runVerifier(["--expected-version", candidate], candidate, [candidate, older]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /changed during verification/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST POST")).length, 6);
  assert.doesNotMatch(result.stdout, /"releaseIdentityVerified":true|"otpLimitVerified":true/);
});

test("health-only also rejects concurrent release changes and lost metadata", () => {
  for (const later of [candidate, null]) {
    const result = runVerifier(["--health-only"], older, [older, later]);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /"releaseIdentityVerified"|"otpLimitVerified":true/);
  }
});
