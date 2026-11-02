// OpenNext 1.20.12 generates this module only during build. Keep clean-checkout
// typechecking possible while checking our wrapper against the platform contract.
declare module "*/.open-next/worker.js" {
  const handler: { fetch: ExportedHandlerFetchHandler<CloudflareEnv> };
  export default handler;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
