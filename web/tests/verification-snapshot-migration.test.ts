import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import snapshot from "../drizzle/meta/0007_snapshot.json";

const db = env.MIGRATION_DB;
async function state() {
  const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const rows: Record<string, unknown[]> = {};
  for (const item of schema.filter(item => item.type === "table")) {
    const name = String(item.name);
    rows[name] = (await db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { schema, rows };
}
async function assertSnapshotColumns(database: D1Database) {
  const columns = (await database.prepare("PRAGMA table_info(verification_case)").all<{ name: string; type: string; notnull: number; pk: number; dflt_value: string | null }>()).results;
  expect(Object.fromEntries(columns.map(column => [column.name, {
    name: column.name, type: column.type.toLowerCase(), notNull: !!column.notnull, primaryKey: !!column.pk, default: column.dflt_value,
  }]))).toEqual(Object.fromEntries(Object.values(snapshot.tables.verification_case.columns).map(column => [column.name, {
    // SQLite PRAGMA removes the expression's outer parentheses.
    name: column.name, type: column.type, notNull: column.notNull, primaryKey: column.primaryKey, default: "default" in column ? String(column.default).replace(/^\((.*)\)$/, "$1") : null,
  }])));
  expect((await database.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
}

it("0007 adds nullable snapshot evidence without rebuilding, backfilling or changing any prior row/trigger", async () => {
  const migrations = env.TEST_MIGRATIONS.filter(migration => migration.name <= "0007_verification_submitted_profile.sql");
  expect(migrations).toHaveLength(8);
  await applyD1Migrations(db, migrations.slice(0, 7));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,role) VALUES ('reviewer','Reviewer','reviewer@example.invalid','moderator')"),
    ...["open", "rejected", "approved"].map(id => db.prepare("INSERT INTO user(id,name,email,role) VALUES (?,?,?,'freelancer')").bind(id, `Current ${id}`, `${id}@example.invalid`)),
    ...["open", "rejected", "approved"].map(id => db.prepare("INSERT INTO freelancer_profile(user_id,display_name,city,status) VALUES (?,?,?,?)").bind(id, `Current ${id}`, "Current City", id === "open" ? "pending" : id === "approved" ? "verified" : "rejected")),
    ...["open", "rejected", "approved"].map(id => db.prepare("INSERT INTO portfolio_link(id,freelancer_id,url,label) VALUES (?,?,?,'Current work')").bind(`link-${id}`, id, `https://example.com/${id}`)),
    db.prepare("INSERT INTO verification_case(id,freelancer_id,created_at) VALUES ('open','open','2026-10-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO verification_case(id,freelancer_id,decision,reason,decided_at,created_at) VALUES ('rejected','rejected','reject','Original grounds','2026-10-03T00:00:00.000Z','2026-10-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO verification_case(id,freelancer_id,reviewer_id,id_kind,result,name_match,inspected_at,decision,reason,decided_at,created_at) VALUES ('approved','approved','reviewer','passport','pass',1,'2026-10-02T00:00:00.000Z','approve','Original approval','2026-10-03T00:00:00.000Z','2026-10-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO moderation_case(id,kind,subject_id) VALUES ('review-open','verification','open')"),
    db.prepare("INSERT INTO moderation_case(id,kind,subject_id,status,decision,reason,decided_by,decided_at) VALUES ('review-rejected','verification','rejected','decided','reject','Original grounds','reviewer','2026-10-03T00:00:00.000Z')"),
    db.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES ('event','reviewer','verification_decided','verification_case','rejected')"),
    db.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES ('session','open','synthetic-session','2027-01-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES ('receipt','open','privacy','original-version')"),
  ]);
  // A failure after ALTER must roll back the column and migration ledger too.
  await db.prepare("CREATE TRIGGER verification_submitted_profile_frozen BEFORE UPDATE ON verification_case BEGIN SELECT 1; END").run();
  const collision = await state();
  await expect(applyD1Migrations(db, migrations)).rejects.toThrow(/already exists/);
  expect(await state()).toEqual(collision);
  await db.prepare("DROP TRIGGER verification_submitted_profile_frozen").run();
  const before = await state();
  expect(before.schema.filter(item => item.type === "trigger")).toHaveLength(13);
  await applyD1Migrations(db, migrations);
  const after = await state();
  for (const item of before.schema.filter(item => item.name !== "verification_case")) expect(after.schema).toContainEqual(item);
  expect(after.schema.filter(item => item.type === "trigger")).toHaveLength(14);
  for (const [table, rows] of Object.entries(before.rows)) {
    if (table === "d1_migrations") {
      expect(after.rows[table]).toEqual(expect.arrayContaining(rows));
      expect(after.rows[table]).toHaveLength(rows.length + 1);
    } else if (table === "verification_case") {
      expect(after.rows[table]).toEqual(rows.map(row => ({ ...(row as object), submitted_profile: null })));
    } else expect(after.rows[table]).toEqual(rows);
  }
  expect(after.schema.some(item => String(item.name).startsWith("__new"))).toBe(false);
  await assertSnapshotColumns(db);
  // Legacy NULLs cannot be backfilled from today's profile, even undecided.
  await expect(db.prepare("UPDATE verification_case SET submitted_profile='{}' WHERE id='open'").run()).rejects.toThrow(/immutable/);
  await expect(db.prepare("UPDATE verification_case SET reason='Rewritten' WHERE id='rejected'").run()).rejects.toThrow(/immutable/);
  await expect(db.prepare("UPDATE audit_event SET action='rewritten' WHERE id='event'").run()).rejects.toThrow(/append-only/);
  await applyD1Migrations(db, migrations);
  expect(await state()).toEqual(after);
}, 20_000);

it("the fresh full migration chain matches the Drizzle column snapshot and installs both independent immutability guards", async () => {
  await assertSnapshotColumns(env.DB);
  const triggers = (await env.DB.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='verification_case' ORDER BY name").all()).results;
  expect(triggers.map(trigger => trigger.name)).toEqual(["verification_case_frozen_delete", "verification_case_frozen_update", "verification_submitted_profile_frozen"]);
  expect(triggers.find(trigger => trigger.name === "verification_submitted_profile_frozen")?.sql).toContain("NEW.submitted_profile IS NOT OLD.submitted_profile");
});
