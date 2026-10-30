import { unstable_readConfig } from "wrangler";
import { checkCiTarget, getCliEnvironment } from "./check-ci-target.mjs";
import { checkResourceBindings } from "./check-resource-bindings.mjs";

// Preserve the npm scripts' positional `dev` while accepting Wrangler flags.
const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith("-")) args.splice(0, 1, "--env", args[0]);
const environment = getCliEnvironment(args);
checkCiTarget(environment);
const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
checkResourceBindings(config, environment);
console.log(`Deployment configuration checked: ${config.name} / ${config.d1_databases.find(binding => binding.binding === "DB").database_name} / ${config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name}`);
