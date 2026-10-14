import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCiTarget, getCliEnvironment } from "./check-ci-target.mjs";

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
