import type { Db } from "@/server/db";

export async function hasLifecycleSchema(db: Db): Promise<boolean> {
  const row = await db.$client.prepare("SELECT count(*) AS present FROM pragma_table_info('user') WHERE name='deactivated_at'")
    .first<{ present: number }>();
  return row?.present === 1;
}
