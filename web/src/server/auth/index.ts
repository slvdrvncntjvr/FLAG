import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb } from "@/server/db";
import { createAuth } from "./config";

export async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  return createAuth(env as CloudflareEnv & Record<string, string | undefined>, createDb(env.DB));
}
