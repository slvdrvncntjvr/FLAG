import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

const db = env.MIGRATION_DB;
async function state() {
  const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const rows: Record<string, unknown[]> = {};
  for (const item of schema.filter(s => s.type === "table")) {
    const name = String(item.name);
    rows[name] = (await db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { schema, rows };
}

it("0008 preserves all legacy data/schema, refuses fabricated receipts, rolls back a collision and reapplies as a no-op", async () => {
  const beforeMigrations = env.TEST_MIGRATIONS.filter(m => m.name < "0008");
  const migrations = env.TEST_MIGRATIONS.filter(m => m.name <= "0008_engagement_consent.sql");
  expect(beforeMigrations).toHaveLength(8);
  expect(migrations).toHaveLength(9);
  await applyD1Migrations(db, beforeMigrations);
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,role) VALUES('legacy-f','Legacy Freelancer','legacy-f@example.invalid','freelancer'),('legacy-c','Legacy Client','legacy-c@example.invalid','client')"),
    db.prepare("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('legacy-f','Legacy Freelancer','verified')"),
    db.prepare("INSERT INTO client_profile(id,user_id,display_name,kind,registration_no) VALUES('legacy-profile','legacy-c','Legacy Client','business','Historical registration')"),
    db.prepare("INSERT INTO account(id,user_id,provider_id,account_id) VALUES('legacy-account','legacy-c','credential','legacy-credential')"),
    db.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES('legacy-session','legacy-c','synthetic-local-only','2027-01-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,accepted_at) VALUES('legacy-consent','legacy-c','client_consent','2026-10-12','2026-10-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('synthetic-bucket',2,2000000000000)"),
    ...["invited", "accepted", "declined", "cancelled", "expired"].map(status => db.prepare(`INSERT INTO engagement(id,freelancer_id,client_id,title,client_name_hint,started_on,status,invite_token_hash,invite_expires_at,accepted_at,declined_at,created_at)
      VALUES(?,'legacy-f',?,'Original title','Original private hint','2026-10-01',?,?,'2026-10-15T00:00:00.000Z',?,?,'2026-10-01T00:00:00.000Z')`)
      .bind(`legacy-${status}`, status === "accepted" ? "legacy-profile" : null, status, `legacy-hash-${status}`, status === "accepted" ? "2026-10-02T00:00:00.000Z" : null, status === "declined" ? "2026-10-02T00:00:00.000Z" : null)),
  ]);
  await db.prepare("CREATE TRIGGER engagement_lifecycle BEFORE UPDATE ON engagement BEGIN SELECT 1; END").run();
  const collision = await state();
  await expect(applyD1Migrations(db, migrations)).rejects.toThrow(/already exists/);
  expect(await state()).toEqual(collision);
  await db.prepare("DROP TRIGGER engagement_lifecycle").run();
  const before = await state();
  await applyD1Migrations(db, migrations);
  const after = await state();
  for (const object of before.schema) expect(after.schema).toContainEqual(object);
  for (const [name, rows] of Object.entries(before.rows)) {
    if (name === "d1_migrations") {
      expect(after.rows[name]).toEqual(expect.arrayContaining(rows));
      expect(after.rows[name]).toHaveLength(rows.length + 1);
    } else expect(after.rows[name]).toEqual(rows);
  }
  expect(after.rows.engagement_consent).toEqual([]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  // Neither a legacy accepted row nor an expired invite can acquire invented evidence.
  for (const id of ["legacy-accepted", "legacy-invited"]) await expect(db.prepare("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,'legacy-consent')").bind(id).run()).rejects.toThrow(/Invalid engagement consent/);
  await applyD1Migrations(db, migrations);
  expect(await state()).toEqual(after);
}, 20_000);
