import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";
import { getDb, type Db } from "@/server/db";
import { createAuth } from "./config";

// Reuse configuration within a React server render, never a viewer or session
// result. Each getSession call and subsequent SQL guard remains fresh.
// Route handlers can supply their own request-local client to share setup.
export const getAuth = cache(async function getAuth(db?: Db) {
  const { env } = await getCloudflareContext({ async: true });
  return createAuth(env as CloudflareEnv & Record<string, string | undefined>, db ?? await getDb());
});
