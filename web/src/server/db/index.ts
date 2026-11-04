import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// React shares only this client/schema setup within one server render. Every
// request resolves its own binding; queries and their authority stay live.
// Outside a React render (actions, handlers, maintenance), cache is a passthrough.
export const getDb = cache(async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return createDb(env.DB);
});
