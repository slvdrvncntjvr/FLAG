import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkBucketSafety, summarizeR2Usage } from "./r2-audit-policy.mjs";
import { inspectSubscriptions, inspectNotificationPolicies, inspectBillingConfiguration } from "./r2-billing-policy.mjs";
import { CLOUDFLARE_ACCOUNT_ID, getDeploymentTarget } from "./check-resource-bindings.mjs";
const operation = (actionType, requests) => ({ dimensions: { actionType }, sum: { requests } });
const sample = (bucketName, payloadSize, metadataSize = 0) => ({ dimensions: { bucketName }, max: { payloadSize, metadataSize } });
const privateBucket = () => ({ info: { storage_class: "Standard" }, managed: { enabled: false }, custom: { domains: [] }, lifecycle: { rules: [{ enabled: true, abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: 604800 } } }] }, sippy: { enabled: false } });

test("aggregates operation totals across the account, keeping deletes free", () => {
  const result = summarizeR2Usage([operation("PutObject", 400_000), operation("PutObject", 400_001), operation("GetObject", 5), operation("DeleteObject", 20)], []);
  assert.equal(result.classA, 800_001);
  assert.equal(result.classB, 5);
  assert.equal(result.free, 20);
  assert.equal(result.warnings.length, 1);
});
test("storage sums per-bucket peaks including metadata and deleted buckets", () => {
  const result = summarizeR2Usage([], [sample("flag-proofs", 4e9, 100), sample("flag-proofs", 2e9), sample("flag-proofs-dev", 3e9), sample("deleted", 1e9)]);
  assert.equal(result.storageBytesUpperBound, 8e9 + 100);
  assert.equal(result.warnings.length, 1);
});
test("unknown operation types are surfaced rather than assumed free", () => {
  const result = summarizeR2Usage([operation("FuturePaidOperation", 1)], []);
  assert.equal(result.unknownOperations.length, 1);
  assert.equal(result.conservativeClassA, 1);
  assert.equal(result.conservativeClassB, 1);
  assert.equal(result.warnings.length, 1);
});
test("missing, invalid, or potentially truncated analytics fails closed", () => {
  for (const data of [undefined, null, Array(10_000).fill(operation("GetObject", 1))]) assert.throws(() => summarizeR2Usage(data, []));
  for (const value of [-1, NaN, undefined, "0"]) assert.throws(() => summarizeR2Usage([operation("GetObject", value)], []));
  assert.throws(() => summarizeR2Usage([], [sample(undefined, 1)]));
});
test("private Standard buckets may retain multipart-abort cleanup", () => {
  assert.deepEqual(checkBucketSafety(privateBucket()), []);
});
test("rejects public access, unknown visibility, imports, and billable storage class", () => {
  for (const changed of [{ info: { storage_class: "InfrequentAccess" } }, { managed: { enabled: true } }, { managed: {} }, { custom: { domains: [{}] } }, { sippy: { enabled: true } }]) {
    assert.ok(checkBucketSafety({ ...privateBucket(), ...changed }).length);
  }
});
test("rejects automatic storage transitions and deletion that bypasses holds", () => {
  for (const rule of [{ enabled: true, storageClassTransitions: [{}] }, { enabled: true, deleteObjectsTransition: {} }]) {
    assert.ok(checkBucketSafety({ ...privateBucket(), lifecycle: { rules: [rule] } }).length);
  }
  assert.equal(checkBucketSafety({ ...privateBucket(), lifecycle: { rules: [{ enabled: false, deleteObjectsTransition: {} }] } }).length, 0);
});

const available = (result, resultInfo) => ({ ok: true, status: 200, result, resultInfo });
const subscription = () => ({ state: "Provisioned", currency: "USD", price: 0,
  rate_plan: { id: "free", scope: "account", sets: ["workers"], public_name: "Workers Free" } });
const usagePolicy = () => ({ alert_type: "billing_usage_alert", enabled: true,
  filters: { product: ["unverified-product-id"], limit: ["80"] },
  mechanisms: { email: [{ id: "operator@example.invalid" }] } });

test("HTTP200 and empty subscriptions/policies never establish free tier or budget alerts", () => {
  const result = inspectBillingConfiguration(available([]), available([]));
  assert.equal(result.billing.subscriptionCount, 0);
  assert.equal(result.billing.workersPlan, "unknown");
  assert.equal(result.billing.freePlanVerified, false);
  assert.equal(result.notifications.policyCount, 0);
  assert.equal(result.notifications.budgetAlertConfigured, null);
  assert.equal(result.notifications.budgetAlertVerified, false);
  assert.equal(result.warnings.length, 2);
});

test("known generic subscription fields do not authorize a Workers scope/name/sets guess", () => {
  const result = inspectSubscriptions(available([subscription()]));
  assert.equal(result.status, "observed");
  assert.equal(result.observations[0].fieldsValid, true);
  assert.equal(result.observations[0].priceUsd, 0);
  assert.equal(result.freePlanVerified, false);
  for (const row of [
    { ...subscription(), price: 5, state: "Paid" },
    { ...subscription(), state: "Cancelled" },
    { ...subscription(), rate_plan: { id: "free", scope: "zone", public_name: "Workers Free" } },
  ]) assert.equal(inspectSubscriptions(available([row])).freePlanVerified, false);
});

test("missing/unknown billing fields and partial pagination remain unknown", () => {
  for (const result of [null, {}, [null], [{}], [{ ...subscription(), price: "0" }],
    [{ ...subscription(), currency: "other" }], [{ ...subscription(), state: "future-state" }],
    [{ ...subscription(), rate_plan: { id: "workers_free_guessed" } }]]) {
    const billing = inspectSubscriptions(available(result));
    assert.equal(billing.status, "unknown");
    assert.equal(billing.freePlanVerified, false);
  }
  for (const resultInfo of [{ total_count: 2 }, { total_count: 1, page: 2 }, { total_count: "1" }, {}]) {
    assert.equal(inspectSubscriptions(available([subscription()], resultInfo)).status, "unknown");
  }
  assert.equal(inspectSubscriptions(available([subscription()], { total_count: 1, page: 1 })).status, "observed");
});

test("403, other API errors and absent responses keep unavailable explicit", () => {
  for (const response of [undefined, { ok: false, status: 403, result: [] }, { ok: false, status: 200 }]) {
    const result = inspectBillingConfiguration(response, response);
    assert.equal(result.billing.status, "unavailable");
    assert.equal(result.notifications.status, "unavailable");
    assert.equal(result.billing.freePlanVerified, false);
    assert.equal(result.notifications.budgetAlertVerified, false);
  }
});

test("usage notification validates enabled state, delivery and actual filter presence without claiming budget acceptance", () => {
  const result = inspectNotificationPolicies(available([usagePolicy()]));
  assert.equal(result.status, "observed");
  assert.equal(result.observations[0].usageNotificationFieldsPresent, true);
  assert.equal(result.observations[0].emailRecipientCount, 1);
  assert.equal(result.budgetAlertVerified, false);
  assert.equal(result.budgetAlertStatus, "unknown");
  for (const changed of [
    { enabled: false }, { enabled: "true" }, { alert_type: "budget_alert" },
    { filters: {} }, { filters: { product: [], limit: ["80"] } },
    { filters: { product: ["r2"], limit: [] } }, { filters: { product: ["r2"], limit: [80] } },
    { mechanisms: {} }, { mechanisms: { email: [] } },
    { mechanisms: { email: [{ id: "not-an-address" }] } },
  ]) {
    const probe = inspectNotificationPolicies(available([{ ...usagePolicy(), ...changed }]));
    assert.equal(probe.observations[0].usageNotificationFieldsPresent, false);
    assert.equal(probe.budgetAlertVerified, false);
  }
});

test("sanitized billing diagnostics omit raw names, addresses, IDs and unknown fields", () => {
  const secret = "private-operator@example.invalid";
  const result = inspectBillingConfiguration(available([{ ...subscription(), id: secret, unknown: secret,
    rate_plan: { id: secret, scope: secret, sets: [secret], public_name: secret } }]), available([
    { ...usagePolicy(), name: secret, id: secret, description: secret, filters: { product: [secret], limit: [secret] },
      mechanisms: { email: [{ id: secret }], webhooks: [{ id: secret }] } },
  ]));
  assert.doesNotMatch(JSON.stringify(result), /private-operator/);
  assert.equal(result.billing.observations[0].planId, "unknown");
  assert.equal(result.notifications.observations[0].emailRecipientCount, 1);
});

// Run the actual auditor with no account calls; only config/auth/fetch are mocked.
function runAuditor(billingResponse, alertResponse, bindingsMissing = false) {
  const configs = Object.fromEntries(["", "dev"].map(environment => {
    const target = getDeploymentTarget(environment);
    return [environment, { name: target.worker, account_id: CLOUDFLARE_ACCOUNT_ID,
      vars: { BETTER_AUTH_URL: target.authUrl },
      d1_databases: [{ binding: "DB", database_name: target.database, database_id: target.databaseId }],
      r2_buckets: [{ binding: "PROOFS", bucket_name: target.bucket }] }];
  }));
  const scriptUrl = new URL("./audit-r2.mjs", import.meta.url).href;
  const preload = `
    import { registerHooks } from "node:module";
    const configs = ${JSON.stringify(configs)};
    const source = ${JSON.stringify(`export const unstable_readConfig = ({env}) => (${JSON.stringify(configs)})[env];`)};
    registerHooks({ resolve(name, context, next) {
      if (context.parentURL === ${JSON.stringify(scriptUrl)} && name === "wrangler") return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
      return next(name, context);
    }});
    globalThis.fetch = async (url, options = {}) => {
      if (!url.startsWith("https://api.cloudflare.com/")) throw new Error("Unexpected host");
      const path = new URL(url).pathname;
      if (path.endsWith("/graphql")) {
        if (options.method !== "POST" || JSON.parse(options.body).query.includes("mutation")) throw new Error("Only analytics query allowed");
        return Response.json({ data: { viewer: { accounts: [{ r2OperationsAdaptiveGroups: [], r2StorageAdaptiveGroups: [] }] } } });
      }
      if (options.method && options.method !== "GET") throw new Error("Metadata must be GET");
      if (path.endsWith("/subscriptions") || path.endsWith("/alerting/v3/policies")) {
        const fixture = path.endsWith("/subscriptions") ? ${JSON.stringify(billingResponse)} : ${JSON.stringify(alertResponse)};
        if (fixture.networkError) throw new Error("sensitive-provider-error");
        return new Response(fixture.body ?? JSON.stringify({ success: fixture.ok, result: fixture.result, result_info: fixture.resultInfo }), { status: fixture.status });
      }
      let result;
      if (path.includes("/r2/buckets/")) {
        if (path.endsWith("/domains/managed") || path.endsWith("/sippy")) result = { enabled: false };
        else if (path.endsWith("/domains/custom")) result = { domains: [] };
        else if (path.endsWith("/lifecycle")) result = { rules: [] };
        else result = { storage_class: "Standard" };
      } else {
        const config = Object.values(configs).find(config => path.includes("/workers/scripts/" + config.name + "/"));
        if (!config) throw new Error("Unexpected Worker");
        if (path.endsWith("/deployments")) result = { deployments: [{ created_on: "2026-10-27T00:00:00Z", versions: [{ version_id: "test-version", percentage: 100 }] }] };
        else if (path.endsWith("/versions/test-version")) result = { resources: { bindings: ${bindingsMissing} ? [] : [
          { name: "DB", type: "d1", database_id: config.d1_databases[0].database_id },
          { name: "PROOFS", type: "r2_bucket", bucket_name: config.r2_buckets[0].bucket_name },
          { name: "BETTER_AUTH_URL", type: "plain_text", text: config.vars.BETTER_AUTH_URL },
        ] } };
        else throw new Error("Unexpected metadata request");
      }
      return Response.json({ success: true, result });
    };
  `;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(scriptUrl)], {
    encoding: "utf8", windowsHide: true, timeout: 10_000,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "synthetic-test-token", CLOUDFLARE_ENV: "dev" },
  });
}

test("actual auditor keeps exit2 and explicit gates after successful empty or populated config reads", () => {
  for (const [subscriptions, policies] of [[[], []], [[subscription()], [usagePolicy()]]]) {
    const run = runAuditor(available(subscriptions), available(policies));
    assert.equal(run.status, 2, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.billingVerificationAvailable, true);
    assert.equal(output.notificationPolicyApiAvailable, true);
    assert.equal(output.budgetAlertVerificationAvailable, false);
    assert.equal(output.freePlanVerified, false);
    assert.equal(output.budgetAlertVerified, false);
    assert.equal(output.errors.length, 0);
    assert.equal(output.warnings.length, 2);
    assert.equal(output.workers.length, 2);
  }
});

test("actual auditor preserves resource failure exit1 and sanitized unavailable/invalid config diagnostics", () => {
  for (const fixture of [
    { ok: false, status: 403, result: { secret: "private-operator" } },
    { ok: true, status: 200, body: "<html>private-operator</html>" },
    { ok: true, status: 200, result: { private: "private-operator" } },
    { status: 200, networkError: true },
  ]) {
    const run = runAuditor(fixture, fixture);
    assert.equal(run.status, 2, run.stderr);
    assert.doesNotMatch(run.stdout + run.stderr, /private-operator|sensitive-provider-error/);
    const output = JSON.parse(run.stdout);
    assert.equal(output.budgetAlertVerified, false);
    assert.notEqual(output.billing.status, "observed");
  }
  const failed = runAuditor(available([]), available([]), true);
  assert.equal(failed.status, 1, failed.stderr);
  assert.ok(JSON.parse(failed.stdout).errors.length > 0);
});
