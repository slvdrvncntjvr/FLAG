import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkActiveRelease, parseReleaseOptions } from "./release-identity.mjs";
import { CLOUDFLARE_ACCOUNT_ID, getDeploymentTarget } from "./check-resource-bindings.mjs";
import { ANONYMOUS_ROUTES, READ_ONLY_ANONYMOUS_ROUTES, checkAnonymousRoute } from "./release-routes.mjs";
import { POLICY_VERSIONS } from "../src/lib/policies.ts";
import { probeDevOtpThrottle } from "./release-otp-probe.mjs";

const candidate = "56f6236e-eb0a-4627-9ada-ca9e59994ff8";
const older = "0530461e-9992-4f4c-8b28-68fbfd1d61b2";
const deployment = (versionId, createdOn = "2026-10-25T07:48:20.000Z", percentage = 100) => ({
  created_on: createdOn, versions: [{ version_id: versionId, percentage }],
});

test("release CLI requires a full explicit UUID in either option form", () => {
  for (const args of [["--expected-version", candidate], [`--expected-version=${candidate}`]]) {
    assert.deepEqual(parseReleaseOptions(args), { expectedVersion: candidate, healthOnly: false, target: "dev", otpThrottle: false });
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
  assert.deepEqual(parseReleaseOptions(["--health-only"]), { expectedVersion: undefined, healthOnly: true, target: "dev", otpThrottle: false });
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
function runVerifier(args, activeVersion = older, subsequentVersions = [activeVersion, activeVersion], routeOverrides = {}, mock = {}) {
  const environment = mock.environment ?? "dev";
  const target = getDeploymentTarget(environment);
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
      wrangler: ${JSON.stringify(`export const unstable_readConfig = ({env}) => { if (env !== ${JSON.stringify(environment)}) throw new Error("Wrong config environment"); return (${JSON.stringify(config)}); };`)},
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
    const routeOverrides = ${JSON.stringify(routeOverrides)};
    const mock = ${JSON.stringify(mock)};
    const policies = ${JSON.stringify(POLICY_VERSIONS)};
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(url).pathname;
      console.log("REQUEST " + (options.method || "GET") + " " + path);
      if (url.startsWith("https://api.cloudflare.com/")) {
        if (!path.startsWith(${JSON.stringify(`/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${target.worker}/`)})) throw new Error("Wrong metadata target");
        let result;
        if (path.endsWith("/deployments")) {
          const version = activeVersions.shift();
          result = { deployments: [{ created_on: "2026-10-25T07:48:20.000Z", versions: [{ version_id: version, percentage: mock.percentage ?? 100 }] }] };
        }
        else if (path.endsWith("/versions/${activeVersion}")) result = { resources: { bindings: mock.bindings ?? ${JSON.stringify(bindings)} } };
        else throw new Error("Unexpected metadata request");
        return Response.json({ success: true, result });
      }
      if (new URL(url).origin !== ${JSON.stringify(target.authUrl)}) throw new Error("Unexpected origin");
      if (new Headers(options.headers).has("cookie") || new Headers(options.headers).has("authorization")) throw new Error("Probe must be anonymous");
      if (path === "/api/auth/sign-in/email-otp" && options.method === "POST") {
        const payload = JSON.parse(options.body);
        if (!payload.email.endsWith("@example.invalid") || payload.otp !== "000000") throw new Error("Unexpected OTP payload");
        if (options.redirect !== "manual") throw new Error("OTP redirects must be disabled");
        return new Response("", { status: ++attempts === 6 ? 429 : 400, headers: { "retry-after": "900" } });
      }
      const privateRoutes = ["/home", "/onboarding", "/verification", "/moderation/verification", "/moderation/verification/nonexistent"];
      const routes = ["/", ...privateRoutes, "/sign-in", "/legal/privacy", "/legal/terms", "/api/auth/get-session"];
      if (!routes.includes(path) || options.method) throw new Error("Unexpected smoke request");
      const protectedPage = privateRoutes.includes(path);
      const override = routeOverrides[path] || {};
      if (override.requestFailure) throw new Error("private upstream request details");
      if (override.bodyFailure) return { text() { throw new Error("private upstream body details"); } };
      const policy = { "/legal/privacy": "privacy", "/legal/terms": "terms" }[path];
      return new Response(override.body ?? (path === "/api/auth/get-session" ? "null" : policy ? '<main><h1>' + (policy === 'privacy' ? 'Privacy notice' : 'Terms') + '</h1><p>Version <!-- -->' + policies[policy] + '</p></main>' : ""), {
        status: override.status ?? (protectedPage ? 307 : 200),
        headers: { "x-robots-tag": "noindex, nofollow", location: "/sign-in", ...override.headers },
      });
    };
  `;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(scriptUrl), ...args], {
    encoding: "utf8", windowsHide: true, timeout: 10_000, env: { ...process.env, CLOUDFLARE_ENV: environment === "dev" ? "production" : "dev" },
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

test("actual CLI exact candidate defaults to metadata/GET without throttle writes", () => {
  const result = runVerifier([`--expected-version=${candidate}`], candidate);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"verificationMode":"release","releaseIdentityVerified":true/);
  assert.match(result.stdout, /"bindingsVerified":true/);
  assert.match(result.stdout, /"routesVerified":\[/);
  assert.match(result.stdout, /"readOnly":true,"otpLimitVerified":false,"otpThrottleSkipped":true,"throttleStateWrites":false,"mailSent":false/);
  assert.doesNotMatch(result.stdout, /REQUEST POST/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST")).length, 12);
  const routes = JSON.parse(result.stdout.split("\n").find(line => line.startsWith('{"routesVerified":'))).routesVerified;
  assert.deepEqual(routes.map(route => route.path), READ_ONLY_ANONYMOUS_ROUTES);
  assert.equal(ANONYMOUS_ROUTES.length, 10, "Packaged smoke retains the full list");
  assert.doesNotMatch(result.stdout, /REQUEST GET \/api\/auth\/get-session/);
  assert.match(result.stdout, /"routesSkipped":\[\{"path":"\/api\/auth\/get-session"/);
  for (const path of ["/verification", "/moderation/verification", "/moderation/verification/nonexistent"]) {
    assert.deepEqual(routes.find(route => route.path === path), { path, status: 307 });
  }
});

test("actual CLI rejects stale policy pages before OTP checks", () => {
  for (const path of ["/legal/privacy", "/legal/terms"]) {
    const result = runVerifier(["--expected-version", candidate], candidate, undefined, { [path]: { body: "outdated-policy" } });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /missing current policy version|unexpected legal page title/);
    assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true/);
  }
});

test("actual CLI rejects public, misdirected or indexable F1 pages before OTP checks", () => {
  for (const path of ["/verification", "/moderation/verification", "/moderation/verification/nonexistent"]) {
    for (const override of [
      { status: 200 }, { headers: { location: "/home" } },
      { headers: { location: "https://other.example.invalid/sign-in" } },
      { headers: { "x-robots-tag": "index" } },
    ]) {
      const result = runVerifier(["--expected-version", candidate], candidate, undefined, { [path]: override });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /unexpected status|unexpected redirect|missing noindex/);
      assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true/);
    }
  }
});

test("actual CLI requires the correct visible legal title and version, not incidental dates", () => {
  for (const path of ["/legal/privacy", "/legal/terms"]) {
    const policy = path.endsWith("privacy") ? "privacy" : "terms";
    const title = policy === "privacy" ? "Privacy notice" : "Terms";
    const current = POLICY_VERSIONS[policy];
    for (const body of [
      `<main><h1>${title}</h1><p>Version 2026-10-14</p><!-- generated ${current} --></main>`,
      `<main><h1>${title}</h1><p>Version 2026-10-14</p><script>const page = '<p>Version ${current}</p>';</script></main>`,
      `<!-- <main><h1>${title}</h1><p>Version ${current}</p></main> --><main>Error</main>`,
      `<main><h1>${policy === "privacy" ? "Terms" : "Privacy notice"}</h1><p>Version ${current}</p></main>`,
      `<main><h1>${title}</h1><p>Version 2026-10-14</p><p>Version ${current}</p></main>`,
    ]) {
      const result = runVerifier(["--expected-version", candidate], candidate, undefined, { [path]: { body } });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /missing current policy version|unexpected legal page title/);
      assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true/);
    }
  }
});

test("shared probes follow each policy's source version across later bumps", () => {
  const original = { ...POLICY_VERSIONS };
  const response = new Response("", { headers: { "x-robots-tag": "noindex, nofollow" } });
  try {
    Reflect.set(POLICY_VERSIONS, "privacy", "next-privacy");
    Reflect.set(POLICY_VERSIONS, "terms", "next-terms");
    for (const policy of ["privacy", "terms"]) {
      const probe = { path: `/legal/${policy}`, response, base: "https://example.invalid" };
      const page = version => `<main><h1>${policy === "privacy" ? "Privacy notice" : "Terms"}</h1><p>Version <!-- -->${version}</p></main>`;
      assert.doesNotThrow(() => checkAnonymousRoute({ ...probe, body: page(POLICY_VERSIONS[policy]) }));
      assert.throws(() => checkAnonymousRoute({ ...probe, body: page(original[policy]) }), /missing current policy version/);
      assert.throws(() => checkAnonymousRoute({ ...probe, body: page(POLICY_VERSIONS[policy === "privacy" ? "terms" : "privacy"]) }), /missing current policy version/);
    }
  } finally {
    Object.assign(POLICY_VERSIONS, original);
  }
});

test("actual CLI health-only output cannot be mistaken for candidate verification", () => {
  const result = runVerifier(["--health-only"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /HEALTH-ONLY.*release identity is NOT verified/);
  assert.match(result.stdout, /"verificationMode":"health-only","releaseIdentityVerified":false/);
  assert.match(result.stdout, /"readOnly":true/);
  assert.doesNotMatch(result.stdout, /REQUEST POST/);
  assert.doesNotMatch(result.stdout, /REQUEST GET \/api\/auth\/get-session/);
});

test("actual CLI rejects a release changed during route checks before OTP probes", () => {
  const result = runVerifier(["--expected-version", candidate], candidate, [older]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /changed during verification/);
  assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true|"otpLimitVerified":true/);
});

test("actual CLI rejects a release changed during OTP checks without success output", () => {
  const result = runVerifier(["--expected-version", candidate, "--otp-throttle"], candidate, [candidate, older]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /changed during verification/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST POST")).length, 6);
  assert.doesNotMatch(result.stdout, /"releaseIdentityVerified":true|"otpLimitVerified":true/);
});

test("health-only also rejects concurrent release changes and lost metadata", () => {
  for (const later of [candidate, null]) {
    const result = runVerifier(["--health-only"], older, [later]);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /"releaseIdentityVerified"|"otpLimitVerified":true/);
  }
});

test("explicit target syntax and dev throttle preserve the existing dev contract", () => {
  assert.deepEqual(parseReleaseOptions(["--health-only", "--target=production"]), {
    expectedVersion: undefined, healthOnly: true, target: "production", otpThrottle: false,
  });
  assert.equal(parseReleaseOptions(["--expected-version", candidate, "--target", "dev", "--otp-throttle"]).otpThrottle, true);
  for (const args of [
    ["--health-only", "--target", "prod"], ["--health-only", "--target", ""],
    ["--health-only", "--target", "dev", "--target", "dev"],
    ["--health-only", "--target", "production", "--otp-throttle"],
    ["--health-only", "--otp-throttle", "--otp-throttle"],
  ]) assert.throws(() => parseReleaseOptions(args));
});

test("production throttle is rejected before config/auth/network", () => {
  const result = runVerifier(["--health-only", "--target", "production", "--otp-throttle"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /never production/);
  assert.doesNotMatch(result.stdout, /AUTH_LOOKUP|REQUEST/);
});

test("production selects only production metadata, config and GET origin despite inherited dev env", () => {
  const result = runVerifier(["--expected-version", candidate, "--target", "production"], candidate, undefined, {}, { environment: "" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"target":"production"/);
  assert.match(result.stdout, /"database":"flag-db"/);
  assert.match(result.stdout, /"proofBucket":"flag-proofs"/);
  assert.match(result.stdout, /"releaseIdentityVerified":true/);
  assert.doesNotMatch(result.stdout, /flag-dev|REQUEST POST/);
});

test("target mismatch and production version/traffic/bindings failures stop before GETs", () => {
  const args = ["--expected-version", candidate, "--target", "production"];
  for (const [version, mock] of [
    [older, { environment: "" }], [candidate, { environment: "", percentage: 99 }],
    [candidate, { environment: "", bindings: [] }], [candidate, { environment: "dev" }],
  ]) {
    const result = runVerifier(args, version, undefined, {}, mock);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /REQUEST GET \/legal|"routesVerified"|REQUEST POST|"releaseIdentityVerified"/);
  }
  const wrong = getDeploymentTarget("");
  const result = runVerifier(["--expected-version", candidate], candidate, undefined, {}, {
    bindings: [{ name: "DB", type: "d1", database_id: wrong.databaseId },
      { name: "PROOFS", type: "r2_bucket", bucket_name: wrong.bucket },
      { name: "BETTER_AUTH_URL", type: "plain_text", text: wrong.authUrl }],
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /bindings do not match dev/);
});

test("production rejects concurrent changes, stale policies and protected-page exposure", () => {
  const args = ["--expected-version", candidate, "--target=production"];
  for (const [later, routes] of [
    [[older], {}], [undefined, { "/legal/terms": { body: "old" } }],
    [undefined, { "/verification": { status: 200 } }],
    [undefined, { "/verification": { headers: { "x-robots-tag": "index" } } }],
  ]) {
    const result = runVerifier(args, candidate, later, routes, { environment: "" });
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /REQUEST POST|"releaseIdentityVerified":true/);
  }
});

test("anonymous request/body failures identify the route without disclosing upstream text or retrying", () => {
  for (const override of [{ requestFailure: true }, { bodyFailure: true }]) {
    const result = runVerifier(["--expected-version", candidate], candidate, undefined, { "/legal/terms": override });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Anonymous GET \/legal\/terms: request\/body read failed or timed out; no automatic retry/);
    assert.doesNotMatch(result.stdout + result.stderr, /private upstream|REQUEST POST|"releaseIdentityVerified":true/);
  }
});

test("explicit dev throttle has exactly six POSTs and reports durable state writes", () => {
  const result = runVerifier(["--expected-version", candidate, "--otp-throttle"], candidate);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /write durable rate-limit counters/);
  assert.match(result.stdout, /"readOnly":false,"otpLimitVerified":true,"otpThrottleSkipped":false,"throttleStateWrites":true,"statuses":\[400,400,400,400,400,429\]/);
  assert.equal(result.stdout.split("\n").filter(line => line.startsWith("REQUEST POST")).length, 6);
});

const devProbe = overrides => ({ target: "dev", base: getDeploymentTarget("dev").authUrl, ...overrides });
test("probe itself rejects production target/origin without requests", async () => {
  for (const override of [{ target: "production" }, { base: getDeploymentTarget("").authUrl }, { base: getDeploymentTarget("dev").authUrl + "/" }]) {
    await assert.rejects(probeDevOtpThrottle(devProbe({ ...override, fetchImpl: () => assert.fail("Must not fetch") })));
  }
});

test("retry diagnostics distinguish shared limiter, missing delay and wrong sixth status without fallback success", async () => {
  for (const headers of [{}, { "x-retry-after": "900" }, { "retry-after": "0" }, { "retry-after": "NaN" }, { "retry-after": "901" }]) {
    const diagnostics = [];
    let count = 0;
    await assert.rejects(probeDevOtpThrottle(devProbe({ report: line => diagnostics.push(JSON.parse(line)), fetchImpl: async () =>
      new Response("sensitive provider body", { status: ++count === 6 ? 429 : 400, headers }) })), /without a valid Retry-After/);
    assert.equal(count, 6);
    assert.deepEqual(diagnostics[0].statuses, [400, 400, 400, 400, 400, 429]);
    assert.equal(diagnostics[0].failure, "missing-or-invalid-retry-after");
    assert.doesNotMatch(JSON.stringify(diagnostics), /sensitive provider body|@example/);
  }
  const diagnostics = [];
  let count = 0;
  await assert.rejects(probeDevOtpThrottle(devProbe({ report: line => diagnostics.push(JSON.parse(line)), fetchImpl: async () => {
    count++;
    return new Response("", { status: 400 });
  } })), /expected HTTP 429 at attempt 6, received 400/);
  assert.equal(diagnostics[0].failure, "unexpected-status");
  assert.equal(count, 6);
});

test("probe stops on early shared limiter, redirects, upstream errors and request/body timeouts", async () => {
  for (const status of [200, 302, 400, 403, 429, 503]) {
    let count = 0;
    if (status === 400) continue;
    await assert.rejects(probeDevOtpThrottle(devProbe({ report: () => {}, fetchImpl: async (_url, options) => {
      count++;
      assert.equal(options.redirect, "manual");
      return new Response("", { status, headers: { "retry-after": "900" } });
    } })), new RegExp(`expected HTTP 400 at attempt 1, received ${status}`));
    assert.equal(count, 1);
  }
  for (const fetchImpl of [async () => { throw new Error("secret upstream text"); }, async () => ({ arrayBuffer() { throw new Error("secret body"); } })]) {
    const lines = [];
    await assert.rejects(probeDevOtpThrottle(devProbe({ fetchImpl, report: line => lines.push(line) })), /No automatic retry/);
    assert.doesNotMatch(lines.join(""), /secret/);
    assert.match(lines[0], /request-or-body-read-failed/);
  }
});
