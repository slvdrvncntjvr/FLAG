import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { checkCiTarget, getCliEnvironment } from "./scripts/check-ci-target.mjs";

const selectedEnvironment = getCliEnvironment();
checkCiTarget(selectedEnvironment);
if (process.env.WORKERS_CI === "1" || process.env.WRANGLER_CI_OVERRIDE_NAME) {
  process.env.CLOUDFLARE_ENV = selectedEnvironment ?? "";
}

export default defineCloudflareConfig({});
