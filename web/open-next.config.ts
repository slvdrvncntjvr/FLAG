import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache yet: every page reads per-viewer data (SDD §5).
export default defineCloudflareConfig({});
