import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

// This binding is created only by the local Vitest configuration. It is never
// the application DB, a Wrangler resource, or a caller-selected database.
const db = env.MIGRATION_DB;
const stamp = "2026-10-01T00:00:00.000Z";
const inspected = "2026-10-02T00:00:00.000Z";
const decided = "2026-10-03T00:00:00.000Z";

async function snapshot() {
  const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const data: Record<string, unknown[]> = {};
  for (const row of schema) {
    if (row.type !== "table") continue;
    const name = String(row.name);
    const rows = (await db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results;
    data[name] = rows.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { schema, data };
}

async function healthy() {
  expect((await db.prepare("PRAGMA foreign_keys").first())?.foreign_keys).toBe(1);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  // D1 rejects integrity_check (SQLITE_AUTH). Exact row/schema comparison and
  // FK checks here complement the separate native SQLite integrity rehearsal.
}

async function seed() {
  await db.batch([
    ...["approved", "pending", "rejected", "invalid", "reviewer", "client"].map(id => db.prepare("INSERT INTO user(id,name,email,role) VALUES (?,?,?,?)")
      .bind(id, `Synthetic ${id}`, `${id}@example.invalid`, id === "reviewer" ? "moderator" : id === "client" ? "client" : "freelancer")),
    ...["approved", "pending", "rejected", "invalid"].map(id => db.prepare("INSERT INTO freelancer_profile(user_id,display_name,status,verified_at) VALUES (?,?,?,?)")
      .bind(id, `Synthetic ${id}`, id === "approved" ? "verified" : id === "pending" ? "pending" : "rejected", id === "approved" ? decided : null)),
    db.prepare("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES ('client-profile','client','Synthetic client','individual')"),
    db.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES ('session','approved','synthetic-session-token','2027-01-01T00:00:00.000Z')"),
    db.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES ('receipt','approved','privacy','2026-10-14')"),
    db.prepare("INSERT INTO portfolio_link(id,freelancer_id,url,label) VALUES ('portfolio','approved','https://example.invalid/work','Synthetic work')"),
    db.prepare("INSERT INTO engagement(id,freelancer_id,client_id,title,client_name_hint,started_on,status,invite_token_hash,invite_expires_at,accepted_at) VALUES ('engagement','approved','client-profile','Synthetic project','Synthetic client','2026-10-01','accepted','synthetic-invite-hash',?,?)").bind(decided, stamp),
    db.prepare("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date) VALUES ('log','FL-synthetic','engagement','approved','client-profile','completed','2026-10-01')"),
    db.prepare("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by) VALUES ('revision','log',1,'initial',4,'positive','The synthetic project was completed and paid as agreed.','2026-10-01','2026-10-01','approved')"),
    db.prepare("UPDATE engagement_log SET current_revision_id='revision' WHERE id='log'"),
    db.prepare("INSERT INTO proof_file(id,log_id,revision_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256) VALUES ('proof','log','revision','filer','approved','synthetic-proof','invoice','application/pdf',32,'synthetic-digest')"),
    ...["approved", "pending", "rejected", "invalid"].map(id => db.prepare("INSERT INTO verification_case(id,freelancer_id,reviewer_id,method,id_kind,result,name_match,inspected_at,decision,reason,decided_at,created_at) VALUES (?,?,'reviewer','live_manual','passport','pass',1,?,?,?,?,?)")
      .bind(`case-${id}`, id, inspected, id === "pending" ? null : id === "approved" ? "approve" : "reject", id === "pending" ? null : id === "invalid" ? "" : "Synthetic review grounds", id === "pending" ? null : decided, stamp)),
  ]);
}

it("preserves populated D1 evidence, rolls back unsafe 0005/invalid 0006, and backfills valid 0006 without invented history", async () => {
  // This regression owns the published 0000–0006 boundary; additive later
  // migrations have dedicated preservation tests with their own row shapes.
  const migrations = env.TEST_MIGRATIONS.filter(migration => migration.name <= "0006_verification_review.sql");
  expect(migrations.map(migration => migration.name)).toContain("0006_verification_review.sql");
  await applyD1Migrations(db, migrations.slice(0, 5));
  await seed();
  await healthy();

  // The published migration cannot disable FKs inside a D1 batch. Its unsafe
  // populated-table rebuild must fail atomically, including its ledger entry.
  const populated = await snapshot();
  await expect(applyD1Migrations(db, migrations.slice(0, 6))).rejects.toThrow(/FOREIGN KEY/i);
  expect(await snapshot()).toEqual(populated);
  await healthy();

  // Only this test's synthetic log graph is removed to model today's empty-log
  // production precondition. This is not a remediation procedure for real data.
  await db.batch([
    db.prepare("DELETE FROM proof_file WHERE id='proof'"),
    db.prepare("UPDATE engagement_log SET current_revision_id=NULL WHERE id='log'"),
    db.prepare("DELETE FROM log_revision WHERE id='revision'"),
    db.prepare("DELETE FROM engagement_log WHERE id='log'"),
  ]);
  const before0005 = await snapshot();
  await applyD1Migrations(db, migrations.slice(0, 6));
  const after0005 = await snapshot();
  for (const [table, rows] of Object.entries(before0005.data)) {
    if (table !== "d1_migrations") expect(after0005.data[table]).toEqual(rows);
  }
  await healthy();

  // Legacy rows admitted by 0002 can violate the new evidence contract. Abort
  // rather than erase them, fabricate reasons, or record a partial migration.
  const invalidLegacy = await snapshot();
  await expect(applyD1Migrations(db, migrations)).rejects.toThrow(/CHECK constraint/i);
  expect(await snapshot()).toEqual(invalidLegacy);
  await healthy();

  // Explicit synthetic fixture remediation, not an application migration rule.
  await db.prepare("UPDATE verification_case SET reason='Synthetic corrected review grounds' WHERE id='case-invalid'").run();
  const before0006 = await snapshot();
  await applyD1Migrations(db, migrations);
  const after = await snapshot();
  for (const [table, rows] of Object.entries(before0006.data)) {
    if (table !== "d1_migrations") expect(after.data[table]).toEqual(rows);
  }
  expect(await db.prepare("SELECT subject_id,status,decision,decided_by FROM moderation_case ORDER BY subject_id").all().then(result => result.results)).toEqual([
    { subject_id: "case-approved", status: "decided", decision: "approve", decided_by: "reviewer" },
    { subject_id: "case-invalid", status: "decided", decision: "reject", decided_by: "reviewer" },
    { subject_id: "case-pending", status: "open", decision: null, decided_by: null },
    { subject_id: "case-rejected", status: "decided", decision: "reject", decided_by: "reviewer" },
  ]);
  expect(after.data.audit_event).toEqual([]);
  expect(after.data.d1_migrations).toHaveLength(7);
  await healthy();
  const migrated = await snapshot();
  await applyD1Migrations(db, migrations);
  expect(await snapshot()).toEqual(migrated);
}, 20_000);
