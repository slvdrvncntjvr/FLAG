import { checkCiTarget, getCliEnvironment } from "./check-ci-target.mjs";

// Plain `wrangler deploy` bypasses OpenNext config. Run before Wrangler uploads.
// Wrangler does not forward its argv to this child: each environment's build
// command must pass its own explicit --env value, including empty for production.
checkCiTarget(getCliEnvironment());
