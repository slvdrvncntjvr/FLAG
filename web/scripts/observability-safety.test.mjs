import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { unstable_readConfig } from "wrangler";
import { checkResourceBindings } from "./check-resource-bindings.mjs";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8"));
assert.equal(parsed.error, undefined, "Wrangler source must remain valid JSONC");

function assertSafeObservability(observability) {
  assert.equal(observability?.enabled, true, "Keep application diagnostics enabled");
  assert.equal(observability?.logs?.invocation_logs, false,
    "Disable automatic invocation logs: request paths can contain bearer capabilities");
  assert.equal(observability?.logs?.persist, false,
    "Disable stored logs: custom console records can also carry request URL metadata");
  assert.equal(observability?.traces?.enabled, false,
    "Keep URL-bearing platform traces disabled");
  assert.equal(observability?.traces?.persist, false,
    "Explicitly disable trace persistence in every environment");
  assert.equal(observability?.logs?.enabled, true, "Keep custom logs enabled");
}

for (const environment of ["", "dev"]) {
  const label = environment || "default";

  test(`${label} source explicitly protects capability URLs`, () => {
    const source = environment ? parsed.config.env[environment] : parsed.config;
    // Require an explicit policy in each environment, even when inheritance is safe.
    assertSafeObservability(source.observability);
  });

  test(`${label} Wrangler-resolved observability protects capability URLs`, () => {
    const config = unstable_readConfig({ config: configPath, env: environment },
      { useRedirectIfAvailable: false });
    assertSafeObservability(config.observability);
    assert.deepEqual(config.observability.logs.destinations ?? [], [],
      "A new log export destination needs a privacy review");
    assert.deepEqual(config.observability.traces.destinations ?? [], [],
      "Do not export URL-bearing traces");
    assert.notEqual(config.logpush, true, "Do not enable URL-bearing Workers Logpush");
    assert.deepEqual(config.tail_consumers ?? [], [], "Do not add an unreviewed Tail Worker");
  });

  test(`${label} observability repair preserves the approved target and closed intake`, () => {
    const config = unstable_readConfig({ config: configPath, env: environment },
      { useRedirectIfAvailable: false });
    assert.doesNotThrow(() => checkResourceBindings(config, environment));
    assert.equal(config.compatibility_date, "2026-10-01");
    assert.deepEqual(config.compatibility_flags, ["nodejs_compat", "global_fetch_strictly_public"]);
    assert.equal(config.vars.PRIVATE_INTAKE_ENABLED, "false");
    assert.equal(config.workers_dev, true);
    assert.equal(config.preview_urls, false);
    assert.equal(config.assets.binding, "ASSETS");
    assert.equal(config.d1_databases.find(binding => binding.binding === "DB").migrations_dir, "drizzle");
    assert.equal(config.r2_buckets.find(binding => binding.binding === "PROOFS").remote, false);
  });
}
