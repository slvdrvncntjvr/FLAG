import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { createAuthRateLimiter } from "@/server/auth/rate-limit";

const db = env.MIGRATION_DB;
const through8 = env.TEST_MIGRATIONS.filter(m => m.name < "0009");
const through9 = env.TEST_MIGRATIONS.filter(m => m.name <= "0009_private_log_intake.sql");
const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args).run();

async function snapshot() {
  const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const row of schema.filter(s => s.type === "table")) {
    rows[String(row.name)] = (await db.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}"`).all()).results
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { schema, rows };
}

async function engagement(id: string, client = "c") {
  if (client !== "c") await db.batch([
    db.prepare("INSERT INTO user(id,name,email,role) VALUES(?, 'Synthetic Client',?,'client')").bind(client, `${client}@example.invalid`),
    db.prepare("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES(?,?,'Synthetic Client','individual')").bind(client, client),
  ]);
  await db.batch([
    db.prepare("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,'f','Synthetic project','Synthetic client','2026-01-01',?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))").bind(id, `hash-${id}`),
    db.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'client_consent','2026-10-12')").bind(`consent-${id}`, client),
    db.prepare("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)").bind(id, `consent-${id}`),
  ]);
}

async function fixture(migrate = true) {
  // Installed plugin's supported reset isolates this file's synthetic local
  // bindings. No configured Wrangler resource or remote database is reachable.
  await reset();
  await applyD1Migrations(db, through8);
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,role) VALUES('f','Synthetic Freelancer','f@example.invalid','freelancer'),('c','Synthetic Client','c@example.invalid','client')"),
    db.prepare("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('f','Synthetic Freelancer','verified')"),
    db.prepare("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES('c','c','Synthetic Client','individual')"),
    db.prepare("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('legacy-bucket',2,2000000000000)"),
    db.prepare("INSERT INTO account(id,user_id,provider_id,account_id) VALUES('old-account','c','credential','synthetic')"),
    db.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES('old-session','c','synthetic-token','2027-01-01T00:00:00.000Z')"),
  ]);
  await engagement("e");
  await run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date) VALUES('l','FL-1042','e','f','c','completed',date('now','+8 hours'))");
  await run("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by) VALUES('r','l',1,'initial',5,'positive','The synthetic project was delivered and the invoice was paid.','2026-01-01','2026-01-02','f')");
  await run("INSERT INTO log_tag(revision_id,tag) VALUES('r','Late Payment')");
  if (migrate) await applyD1Migrations(db, through9);
}

async function proof(id = "p") {
  await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256) VALUES(?,'l','filer','f',?,'invoice','application/pdf',10,?)", id, `logs/l/${id}`, "a".repeat(64));
}
async function ready() {
  await proof();
  await run("UPDATE proof_file SET status='attached',revision_id='r' WHERE id='p'");
  await run("INSERT INTO moderation_case(id,kind,subject_id) VALUES('case','log','l')");
}
const submitSql = "UPDATE engagement_log SET status='pending',first_submitted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),submitted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'";

describe("0009 private intake local migration", () => {
  it("preserves every populated value and prior schema object, keeps legacy activity NULL, FKs and exact no-op", async () => {
    await fixture(false);
    await proof("legacy-proof");
    const before = await snapshot();
    expect(through8).toHaveLength(9);
    expect(through9).toHaveLength(10);
    await applyD1Migrations(db, through9);
    const after = await snapshot();
    for (const object of before.schema) {
      if (object.type === "table" && ["engagement_log", "proof_file"].includes(String(object.name))) continue;
      expect(after.schema).toContainEqual(object);
    }
    for (const [name, rows] of Object.entries(before.rows)) {
      if (name === "d1_migrations") {
        expect(after.rows[name]).toEqual(expect.arrayContaining(rows));
        expect(after.rows[name]).toHaveLength(rows.length + 1);
      } else if (name === "engagement_log") {
        expect(after.rows[name]).toEqual(rows.map(row => ({ ...row, draft_updated_at: null })));
      } else if (name === "proof_file") {
        expect(after.rows[name]).toEqual(rows.map(row => ({ ...row, purge_attempts: 0, purge_inflight: 0 })));
      } else expect(after.rows[name]).toEqual(rows);
    }
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    await applyD1Migrations(db, through9);
    expect(await snapshot()).toEqual(after);
  });

  it("permits only monotonic claimed-purge attempts and freezes submitted byte metadata", async () => {
    await fixture();
    await proof();
    expect(await db.prepare("SELECT purge_attempts FROM proof_file WHERE id='p'").first()).toEqual({ purge_attempts: 0 });
    await expect(run("UPDATE proof_file SET purge_attempts=1 WHERE id='p'")).rejects.toThrow(/maintenance only/);
    await run("UPDATE proof_file SET status='pending_purge' WHERE id='p'");
    await run("UPDATE proof_file SET purge_attempts=purge_attempts+1,purge_inflight=1 WHERE id='p'");
    await expect(run("UPDATE proof_file SET purge_attempts=0 WHERE id='p'")).rejects.toThrow(/maintenance only/);
    await expect(run("UPDATE proof_file SET purge_attempts=purge_attempts+2 WHERE id='p'")).rejects.toThrow(/maintenance only/);
    await expect(run("UPDATE proof_file SET status='purged',purge_attempts=2 WHERE id='p'")).rejects.toThrow(/maintenance only/);
    await expect(run("UPDATE proof_file SET status='purged' WHERE id='p'")).rejects.toThrow(/active purge/);
    await run("UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id='p'");
    expect(await db.prepare("SELECT purge_attempts FROM proof_file WHERE id='p'").first()).toEqual({ purge_attempts: 1 });
    await expect(run("UPDATE proof_file SET purge_attempts=2 WHERE id='p'")).rejects.toThrow(/maintenance only/);
    await expect(run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,purge_attempts) VALUES('forged','l','filer','f','logs/l/forged','invoice','application/pdf',10,?,1)", "a".repeat(64))).rejects.toThrow(/start at zero/);
    await fixture();
    await ready();
    await run(submitSql);
    await expect(run("UPDATE proof_file SET purge_attempts=1 WHERE id='p'")).rejects.toThrow();
  });

  it("rolls back ALTER and prior statements if a new trigger name collides", async () => {
    await fixture(false);
    await run("CREATE TRIGGER log_private_insert BEFORE INSERT ON engagement_log BEGIN SELECT 1; END");
    const before = await snapshot();
    await expect(applyD1Migrations(db, through9)).rejects.toThrow(/already exists/);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["pending", "published", "ask_changes", "hidden", "rejected"])("denies raw INSERT in %s state", async status => {
    await fixture();
    await engagement("other");
    await expect(run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date,status) VALUES('other','FL-1043','other','f','c','completed',date('now'),?)", status)).rejects.toThrow(/start as draft/);
  });

  it("requires attached proof, initial content/tags and open case before pending", async () => {
    await fixture();
    await expect(run(submitSql)).rejects.toThrow(/proof required/);
    await proof();
    await expect(run(submitSql)).rejects.toThrow(/proof required/);
    await run("UPDATE proof_file SET status='attached',revision_id='r' WHERE id='p'");
    await expect(run(submitSql)).rejects.toThrow(/open log moderation case/);
    await run("INSERT INTO moderation_case(id,kind,subject_id) VALUES('case','log','l')");
    await run("DELETE FROM log_tag WHERE revision_id='r'");
    await expect(run(submitSql)).rejects.toThrow(/complete initial revision/);
    await run("INSERT INTO log_tag(revision_id,tag) VALUES('r','Late Payment')");
    await run(submitSql);
    expect(await db.prepare("SELECT status,current_revision_id,published_at,expires_at FROM engagement_log WHERE id='l'").first())
      .toEqual({ status: "pending", current_revision_id: null, published_at: null, expires_at: null });
  });

  it.each(["unverified", "suspended"])("rejects raw submission after verification becomes %s", async status => {
    await fixture(); await ready();
    await run("UPDATE freelancer_profile SET status=? WHERE user_id='f'", status);
    await expect(run(submitSql)).rejects.toThrow(/verified freelancer/);
  });

  it("rejects revoked account, nonaccepted engagement and future anchor even with complete proof", async () => {
    await fixture(); await ready();
    await run("UPDATE user SET banned=1 WHERE id='f'");
    await expect(run(submitSql)).rejects.toThrow(/verified freelancer/);
    await run("UPDATE user SET banned=0 WHERE id='f'");
    // Fixture anchor is fixed after first creation; direct changes cannot reset a clock.
    await expect(run("UPDATE engagement_log SET anchor_date=date('now','-15 days') WHERE id='l'")).rejects.toThrow(/anchor are immutable/);
    await expect(run("UPDATE engagement SET status='declined' WHERE id='e'")).rejects.toThrow(/Invitation is closed/);
  });

  it("uses inclusive Manila calendar days and rejects stale/future initial filing", async () => {
    await fixture(false);
    await run("UPDATE engagement_log SET anchor_date=date('now','+8 hours','-15 days') WHERE id='l'");
    await applyD1Migrations(db, through9); await ready(); await run(submitSql);
    expect(await db.prepare("SELECT date('2026-04-16T15:59:59Z','+8 hours')<=date('2026-04-01','+15 days') AS ontime,date('2026-04-16T16:00:00Z','+8 hours')>date('2026-04-01','+15 days') AS late").first())
      .toEqual({ ontime: 1, late: 1 });
  });

  it.each([-16, 1])("rejects anchor with day offset %s", async offset => {
    await fixture(false);
    await run("UPDATE engagement_log SET anchor_date=date('now','+8 hours',?) WHERE id='l'", `${offset} days`);
    await applyD1Migrations(db, through9); await ready();
    await expect(run(submitSql)).rejects.toThrow(/outside filing window/);
  });

  it("freezes parent publication/anchor and all submitted proof/revision/tag mutations", async () => {
    await fixture(); await ready(); await run(submitSql);
    for (const sql of [
      "UPDATE engagement_log SET status='published' WHERE id='l'",
      "UPDATE engagement_log SET first_submitted_at='2026-01-01T00:00:00Z' WHERE id='l'",
      "UPDATE engagement_log SET current_revision_id='r' WHERE id='l'",
      "DELETE FROM engagement_log WHERE id='l'",
      "UPDATE log_revision SET rating=1,outcome='negative' WHERE id='r'",
      "DELETE FROM log_revision WHERE id='r'",
      "INSERT INTO log_tag(revision_id,tag) VALUES('r','Professional')",
      "UPDATE log_tag SET tag='Professional' WHERE revision_id='r'",
      "DELETE FROM log_tag WHERE revision_id='r'",
      "UPDATE proof_file SET status='pending_purge' WHERE id='p'",
      "DELETE FROM proof_file WHERE id='p'",
    ]) await expect(run(sql)).rejects.toThrow(/frozen|not supported|cannot be deleted|purged before/);
    await expect(proof("new")).rejects.toThrow(/editable draft/);
  });

  it("allows complete draft edits but rejects byte metadata and cross-revision rebind", async () => {
    await fixture(); await proof();
    await run("UPDATE log_revision SET rating=2,outcome='negative',facts='The synthetic client missed the first agreed payment.' WHERE id='r'");
    await run("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'");
    await expect(run("UPDATE proof_file SET sha256=? WHERE id='p'", "b".repeat(64))).rejects.toThrow(/byte metadata is immutable/);
    await expect(run("UPDATE proof_file SET revision_id='r' WHERE id='p'")).rejects.toThrow(/binding is immutable/);
  });

  it("enforces five live proofs even for concurrent reservations", async () => {
    await fixture();
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, n) => proof(`p${n}`)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(5);
    expect(await db.prepare("SELECT count(*) AS count FROM proof_file").first()).toEqual({ count: 5 });
  });

  it.each([3, 10])("backs the %s-log quota with a serialized submission predicate", async count => {
    await fixture(false);
    for (let n = 0; n < count; n++) {
      const client = count === 3 ? "c" : `c${n}`;
      await engagement(`e${n}`, client);
      await run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date,status,first_submitted_at,submitted_at) VALUES(?,?,?,'f',?,'completed',date('now'),'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))", `l${n}`, `FL-${2000 + n}`, `e${n}`, client);
    }
    await applyD1Migrations(db, through9); await ready();
    await expect(run(submitSql)).rejects.toThrow(/quota reached/);
    expect(await db.prepare("SELECT first_submitted_at FROM engagement_log WHERE id='l'").first()).toEqual({ first_submitted_at: null });
  });

  it("rolls back proof binding, case and audit if final pending predicate fails", async () => {
    await fixture(); await proof();
    await run("UPDATE freelancer_profile SET status='suspended' WHERE user_id='f'");
    await expect(db.batch([
      db.prepare("UPDATE proof_file SET status='attached',revision_id='r' WHERE id='p'"),
      db.prepare("INSERT INTO moderation_case(id,kind,subject_id) VALUES('case','log','l')"),
      db.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES('audit','f','log_submitted','log','l')"),
      db.prepare(submitSql),
    ])).rejects.toThrow(/verified freelancer/);
    expect(await db.prepare("SELECT status,revision_id FROM proof_file WHERE id='p'").first()).toEqual({ status: "uploading", revision_id: null });
    expect(await db.prepare("SELECT count(*) AS count FROM moderation_case").first()).toEqual({ count: 0 });
    expect(await db.prepare("SELECT count(*) AS count FROM audit_event").first()).toEqual({ count: 0 });
  });

  it("detects removal of the proof backstop in an isolated synthetic database", async () => {
    await fixture();
    const assertion = () => expect(run(submitSql)).rejects.toThrow(/proof required/);
    await assertion();
    await run("DROP TRIGGER log_requires_proof");
    // Mutation proof: the same negative assertion now fails because the raw
    // bypass succeeds. The next fixture resets every local test binding.
    await expect(assertion()).rejects.toThrow(/resolved.*instead of rejecting/);
    expect(await db.prepare("SELECT status FROM engagement_log WHERE id='l'").first()).toEqual({ status: "pending" });
  });

  it("blocks held cleanup; pending purge freezes activity but purged tombstone permits recovery", async () => {
    await fixture(); await proof();
    await run("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'");
    await expect(run("UPDATE proof_file SET status='pending_purge' WHERE id='p'")).rejects.toThrow(/held proof/);
    await expect(run("DELETE FROM engagement_log WHERE id='l'")).rejects.toThrow(/held log/);
    await run("UPDATE engagement_log SET hold_released_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'");
    await run("UPDATE proof_file SET status='pending_purge' WHERE id='p'");
    await expect(run("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'")).rejects.toThrow(/cleanup is in progress/);
    await expect(proof("p2")).rejects.toThrow(/cleanup in progress/);
    await run("UPDATE proof_file SET status='purged' WHERE id='p'");
    await run("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='l'");
    await proof("p2");
    expect(await db.prepare("SELECT status FROM proof_file WHERE id='p'").first()).toEqual({ status: "purged" });
  });

  it("preserves permanent monotonic highwater through actual auth cleanup and denies reuse", async () => {
    await fixture();
    await run("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('log-reference-sequence',1042,9007199254740991)");
    await run("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('expired-upload',20,1)");
    const limiter = createAuthRateLimiter(createDb(db), "synthetic-secret", () => Date.now());
    expect((await limiter.consume("synthetic", { window: 60, max: 2 })).allowed).toBe(true);
    expect(await db.prepare("SELECT count FROM auth_rate_limit WHERE key='log-reference-sequence'").first()).toEqual({ count: 1042 });
    expect(await db.prepare("SELECT count FROM auth_rate_limit WHERE key='expired-upload'").first()).toBeNull();
    await expect(run("DELETE FROM auth_rate_limit WHERE key='log-reference-sequence'")).rejects.toThrow(/permanent/);
    await expect(run("UPDATE auth_rate_limit SET count=1041 WHERE key='log-reference-sequence'")).rejects.toThrow(/cannot decrease/);
    await expect(run("UPDATE auth_rate_limit SET expires_at=1 WHERE key='log-reference-sequence'")).rejects.toThrow(/cannot decrease/);
    await run("UPDATE auth_rate_limit SET count=count+1 WHERE key='log-reference-sequence'");
  });
});
