import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { checkCiTarget, getCliEnvironment } from "./scripts/check-ci-target.mjs";

// Also covers direct adapter commands delegated from Cloudflare's default Wrangler deploy.
const selectedEnvironment = getCliEnvironment();
checkCiTarget(selectedEnvironment);
if (process.env.WORKERS_CI === "1" || process.env.WRANGLER_CI_OVERRIDE_NAME) {
  process.env.CLOUDFLARE_ENV = selectedEnvironment ?? "";
}

// No incremental cache yet: every page reads per-viewer data (SDD §5).
export default defineCloudflareConfig({});
