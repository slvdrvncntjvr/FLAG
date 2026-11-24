import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";
import { getDb, type Db } from "@/server/db";
import { createAuth } from "./config";

export const getAuth = cache(async function getAuth(db?: Db) {
  const { env } = await getCloudflareContext({ async: true });
  return createAuth(env as CloudflareEnv & Record<string, string | undefined>, db ?? await getDb());
});
