import { unstable_readConfig } from "wrangler";
import { checkCiTarget } from "./check-ci-target.mjs";

const environment = process.argv[2];
if (environment !== undefined && environment !== "dev") throw new Error("Unsupported deployment environment");
checkCiTarget(environment);
const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
const expectedName = environment === "dev" ? "flag-dev" : "flag";
const expectedDatabase = environment === "dev" ? "flag-db-dev" : "flag-db";
if (process.env.WRANGLER_CI_OVERRIDE_NAME && process.env.WRANGLER_CI_OVERRIDE_NAME !== expectedName) {
  throw new Error(`CI targets ${process.env.WRANGLER_CI_OVERRIDE_NAME}; command targets ${expectedName}. Select the correct deploy script.`);
}
if (config.name !== expectedName || config.vars.BETTER_AUTH_URL !== `https://${expectedName}.factsfirst.workers.dev` ||
    config.d1_databases.find(database => database.binding === "DB")?.database_name !== expectedDatabase) {
  throw new Error("Worker, database, and authentication URL do not match the selected environment");
}
console.log(`Deployment configuration checked: ${expectedName} / ${expectedDatabase}`);
