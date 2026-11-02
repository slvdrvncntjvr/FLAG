import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { addActor } from "./private-intake-fixtures";

// Only local isolated synthetic fixtures may travel in time. Restore the exact
// production guard before invoking any behavior under test.
export async function ageSyntheticDrafts(ids: string[], value: string) {
  const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_log_update'").first<{ sql: string }>();
  if (!guard) throw new Error("Synthetic clock requires the production log guard");
  await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
  try {
    for (const id of ids) await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=? WHERE id=?").bind(value, id).run();
  } finally { await env.DB.prepare(guard.sql).run(); }
  expect((await env.DB.prepare("SELECT sql FROM sqlite_master WHERE name='pilot_log_update'").first<{ sql: string }>())?.sql).toBe(guard.sql);
}

export async function finiteSyntheticHold(targetId: string, targetType: "log" | "proof" | "revision" = "log") {
  const owner = await addActor("admin"), id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at)
    VALUES(?,?,?,'legal',?,'Finite synthetic evidence purpose',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))`)
    .bind(id, targetType, targetId, owner).run();
  return id;
}

export async function legacySyntheticHold(logId: string, kind: string | null, placed: string | null, released: string | null) {
  const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_log_update'").first<{ sql: string }>();
  if (!guard) throw new Error("Synthetic legacy fixture requires production guard");
  await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
  try { await env.DB.prepare("UPDATE engagement_log SET hold_kind=?,hold_placed_at=?,hold_released_at=? WHERE id=?").bind(kind, placed, released, logId).run(); }
  finally { await env.DB.prepare(guard.sql).run(); }
  expect((await env.DB.prepare("SELECT sql FROM sqlite_master WHERE name='pilot_log_update'").first<{ sql: string }>())?.sql).toBe(guard.sql);
}
