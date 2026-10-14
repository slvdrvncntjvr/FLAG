import { checkCiTarget } from "./check-ci-target.mjs";

// Plain `wrangler deploy` bypasses OpenNext config. Run before Wrangler uploads.
// Supported adapter commands propagate their selected environment to this child.
checkCiTarget(process.env.CLOUDFLARE_ENV);
