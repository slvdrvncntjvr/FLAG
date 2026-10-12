import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// Request-scoped: the D1 binding comes from the Worker env on every call.
export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return createDb(env.DB);
}
