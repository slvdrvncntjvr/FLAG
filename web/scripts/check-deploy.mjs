import { unstable_readConfig } from "wrangler";
import { checkCiTarget } from "./check-ci-target.mjs";
import { checkResourceBindings } from "./check-resource-bindings.mjs";

const environment = process.argv[2];
if (environment !== undefined && environment !== "dev") throw new Error("Unsupported deployment environment");
checkCiTarget(environment);
const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
const expectedName = environment === "dev" ? "flag-dev" : "flag";
const expectedDatabase = environment === "dev" ? "flag-db-dev" : "flag-db";
if (process.env.WRANGLER_CI_OVERRIDE_NAME && process.env.WRANGLER_CI_OVERRIDE_NAME !== expectedName) {
  throw new Error(`CI targets ${process.env.WRANGLER_CI_OVERRIDE_NAME}; command targets ${expectedName}. Select the correct deploy script.`);
}
checkResourceBindings(config, environment);
console.log(`Deployment configuration checked: ${expectedName} / ${expectedDatabase} / ${config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name}`);
