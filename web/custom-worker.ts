import handler from "./.open-next/worker.js";
import { runMaintenance } from "./src/features/lifecycle/maintenance";
import { privateResourcePreflight } from "./src/lib/private-http";
import { proofUploadHttp } from "./src/server/proof-upload-http";

export default {
  async fetch(request, env, ctx) {
    return privateResourcePreflight(request) ?? await proofUploadHttp(request, env) ?? handler.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    await runMaintenance(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
