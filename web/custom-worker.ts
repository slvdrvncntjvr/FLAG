// The adapter generates this module during the existing OpenNext build.
import handler from "./.open-next/worker.js";
import { runMaintenance } from "./src/features/lifecycle/maintenance";
import { privateResourcePreflight } from "./src/lib/private-http";

export default {
  fetch(request, env, ctx) {
    return privateResourcePreflight(request) ?? handler.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    // Await all work; no request data or tokens are emitted to platform logs.
    await runMaintenance(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Preserve the installed adapter's generated exports for optional cache bindings.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
