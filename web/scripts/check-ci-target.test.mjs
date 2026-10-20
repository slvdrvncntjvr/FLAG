import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCiTarget, getCliEnvironment } from "./check-ci-target.mjs";
import { unstable_readConfig } from "wrangler";
import { checkResourceBindings } from "./check-resource-bindings.mjs";

const dev = { WORKERS_CI: "1", WORKERS_CI_BRANCH: "dev", WRANGLER_CI_OVERRIDE_NAME: "flag-dev" };
const production = { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", WRANGLER_CI_OVERRIDE_NAME: "flag" };

test("rejects the legacy default deploy to flag-dev even when CI overrides its name", () => {
  assert.throws(() => checkCiTarget(getCliEnvironment(["deploy"], dev), dev), /selected environment targets flag/);
});
test("rejects a production build/deploy triggered by a dev commit", () => {
  assert.throws(() => checkCiTarget(undefined, { ...production, WORKERS_CI_BRANCH: "dev" }), /expected main/);
});
test("rejects selecting the dev environment for the production Worker", () => {
  assert.throws(() => checkCiTarget("dev", production), /selected environment targets flag-dev/);
});
test("accepts the correct dev and production combinations", () => {
  assert.doesNotThrow(() => checkCiTarget("dev", dev));
  assert.doesNotThrow(() => checkCiTarget(undefined, production));
});
test("recognizes adapter environment flags, passthrough flags, and CLI precedence", () => {
  for (const args of [["deploy", "--env", "dev"], ["deploy", "--", "--env", "dev"], ["build", "--env=dev"], ["deploy", "-e", "dev"], ["deploy", "-e=dev"]]) {
    assert.equal(getCliEnvironment(args, {}), "dev");
  }
  assert.equal(getCliEnvironment(["deploy"], { CLOUDFLARE_ENV: "dev" }), "dev");
  assert.equal(getCliEnvironment(["deploy", "--env="], { CLOUDFLARE_ENV: "dev" }), "");
});
test("permits deliberate local manual deploys without Workers Builds variables", () => {
  assert.doesNotThrow(() => checkCiTarget("dev", {}));
  assert.doesNotThrow(() => checkCiTarget(undefined, {}));
});

test("actual Wrangler environments isolate DB, auth, and private proof buckets", () => {
  const productionConfig = unstable_readConfig({ config: "wrangler.jsonc" });
  const devConfig = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  assert.doesNotThrow(() => checkResourceBindings(productionConfig));
  assert.doesNotThrow(() => checkResourceBindings(devConfig, "dev"));
  assert.notEqual(productionConfig.r2_buckets[0].bucket_name, devConfig.r2_buckets[0].bucket_name);
  assert.throws(() => checkResourceBindings(productionConfig, "dev"), /do not match/);
  assert.throws(() => checkResourceBindings(devConfig), /do not match/);
  assert.throws(() => checkResourceBindings(devConfig, "preview"), /Unsupported/);
});

test("rejects missing, swapped, or remotely exposed local proof bindings", () => {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  assert.throws(() => checkResourceBindings({ ...config, r2_buckets: [] }, "dev"), /do not match/);
  assert.throws(() => checkResourceBindings({ ...config, r2_buckets: [{ binding: "PROOFS", bucket_name: "flag-proofs" }] }, "dev"), /do not match/);
  for (const extra of [{ remote: true }, { preview_bucket_name: "flag-proofs" }]) {
    const r2_buckets = config.r2_buckets.map(binding => ({ ...binding, ...extra }));
    assert.throws(() => checkResourceBindings({ ...config, r2_buckets }, "dev"), /local development storage/);
  }
});

test("preserves rejection of Worker, database, and auth URL drift", () => {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  for (const changed of [
    { name: "flag" },
    { vars: { ...config.vars, BETTER_AUTH_URL: "https://flag.factsfirst.workers.dev" } },
    { d1_databases: [] },
    { d1_databases: [{ binding: "DB", database_name: "flag-db" }] },
  ]) {
    assert.throws(() => checkResourceBindings({ ...config, ...changed }, "dev"), /do not match/);
  }
});

test("rejects an absent or different Cloudflare account", () => {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  for (const account_id of [undefined, "another-account"]) {
    assert.throws(() => checkResourceBindings({ ...config, account_id }, "dev"), /approved FLAG account/);
  }
});
