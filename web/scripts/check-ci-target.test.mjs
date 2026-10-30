import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { checkCiTarget, getCliEnvironment } from "./check-ci-target.mjs";
import { unstable_readConfig } from "wrangler";
import { checkDeployedBindings, checkResourceBindings } from "./check-resource-bindings.mjs";

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
    { d1_databases: [{ ...config.d1_databases[0], database_id: "e196d1b5-82e7-45bf-b1c5-725fa1faf184" }] },
    { d1_databases: [{ ...config.d1_databases[0], database_id: undefined }] },
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

function runScript(args, vars = {}) {
  return spawnSync(process.execPath, args, {
    env: { ...process.env, WORKERS_CI: "", WORKERS_CI_BRANCH: "", WRANGLER_CI_OVERRIDE_NAME: "", CLOUDFLARE_ENV: "", ...vars },
    encoding: "utf8", timeout: 30_000, windowsHide: true,
  });
}

test("custom-build entry point checks CLI environment before inherited environment", () => {
  const wrong = runScript(["scripts/check-wrangler-build.mjs", "--env", "dev"], production);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /selected environment targets flag-dev/);
  const correct = runScript(["scripts/check-wrangler-build.mjs", "--env=dev"], { ...dev, CLOUDFLARE_ENV: "" });
  assert.equal(correct.status, 0, correct.stderr);
});

test("Wrangler's selected config passes its environment to the custom-build child", () => {
  const productionConfig = unstable_readConfig({ config: "wrangler.jsonc", env: "" });
  const devConfig = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  // Wrangler launches this command without forwarding its own --env argument.
  for (const [config, vars, status] of [
    [productionConfig, { ...production, CLOUDFLARE_ENV: "dev" }, 0],
    [devConfig, { ...dev, CLOUDFLARE_ENV: "" }, 0],
    [devConfig, production, 1],
    [productionConfig, dev, 1],
  ]) {
    const result = runScript(config.build.command.split(" ").slice(1), vars);
    if (status === 0) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0);
  }
});

test("deploy preflight uses CLOUDFLARE_ENV and checks the actual dev configuration", () => {
  const result = runScript(["scripts/check-deploy.mjs"], { ...dev, CLOUDFLARE_ENV: "dev" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /flag-dev \/ flag-db-dev \/ flag-proofs-dev/);
  const wrong = runScript(["scripts/check-deploy.mjs"], { ...production, CLOUDFLARE_ENV: "dev" });
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /selected environment targets flag-dev/);
});

test("deploy preflight preserves positional dev and explicit default environment overrides", () => {
  for (const args of [["dev"], ["--env=dev"]]) {
    const result = runScript(["scripts/check-deploy.mjs", ...args], dev);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /flag-dev \/ flag-db-dev \/ flag-proofs-dev/);
  }
  const result = runScript(["scripts/check-deploy.mjs", "--env="], { ...production, CLOUDFLARE_ENV: "dev" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /flag \/ flag-db \/ flag-proofs/);
});

test("rejects missing environment flag values and unsupported environments outside CI", () => {
  for (const args of [["--env"], ["-e"], ["--env", "--dry-run"]]) {
    assert.throws(() => getCliEnvironment(args, { CLOUDFLARE_ENV: "dev" }), /requires a value/);
  }
  assert.throws(() => checkCiTarget("preview", {}), /Unsupported/);
});

function liveBindings(config) {
  return [
    { name: "DB", type: "d1", id: config.d1_databases.find(binding => binding.binding === "DB").database_id },
    { name: "PROOFS", type: "r2_bucket", bucket_name: config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name },
    { name: "BETTER_AUTH_URL", type: "plain_text", text: config.vars.BETTER_AUTH_URL },
  ];
}

test("live binding checks accept both environments and Cloudflare database ID metadata forms", () => {
  for (const environment of ["", "dev"]) {
    const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
    const bindings = liveBindings(config);
    assert.deepEqual(checkDeployedBindings(config, bindings), []);
    bindings[0].database_id = bindings[0].id;
    delete bindings[0].id;
    assert.deepEqual(checkDeployedBindings(config, bindings), []);
  }
});

test("live checks reject missing, swapped, or incorrectly typed proof buckets", () => {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  const bindings = liveBindings(config);
  for (const proofs of [undefined, { name: "PROOFS", type: "r2_bucket", bucket_name: "flag-proofs" },
    { name: "PROOFS", type: "plain_text", bucket_name: "flag-proofs-dev" }]) {
    const changed = bindings.filter(binding => binding.name !== "PROOFS");
    if (proofs) changed.push(proofs);
    assert.match(checkDeployedBindings(config, changed).join("; "), /PROOFS/);
  }
});

test("live checks reject unavailable, duplicate, or mismatched DB/auth metadata", () => {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: "dev" });
  const bindings = liveBindings(config);
  for (const data of [undefined, null, {}, []]) assert.ok(checkDeployedBindings(config, data).length);
  for (const binding of bindings) {
    assert.ok(checkDeployedBindings(config, [...bindings, binding]).length);
    assert.ok(checkDeployedBindings(config, bindings.filter(candidate => candidate !== binding)).length);
    assert.ok(checkDeployedBindings(config, bindings.map(candidate => candidate === binding ? { ...candidate, type: "plain_text_wrong" } : candidate)).length);
  }
  assert.ok(checkDeployedBindings(config, [{ ...bindings[0], id: "production-db" }, ...bindings.slice(1)]).length);
  assert.ok(checkDeployedBindings(config, [...bindings.slice(0, 2), { ...bindings[2], text: "https://flag.factsfirst.workers.dev" }]).length);
});
