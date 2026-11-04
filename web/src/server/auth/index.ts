import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";
import { getDb } from "@/server/db";
import { createAuth } from "./config";

// Reuse configuration within a React server render, never a viewer or session
// result. Each getSession call and subsequent SQL guard remains fresh.
export const getAuth = cache(async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  return createAuth(env as CloudflareEnv & Record<string, string | undefined>, await getDb());
});
