import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { claimMaintenanceTask, issueDueTasks } from "@/server/db/queries/lifecycle";
import { placeRetentionHold, releaseRetentionHold } from "@/features/privacy/handlers";
import { POLICY_VERSIONS } from "@/lib/policies";

const store = env.MIGRATION_DB, db = createDb(store), all = env.TEST_MIGRATIONS;
const q = (sql: string, ...args: (string | number | null)[]) => store.prepare(sql).bind(...args);
const oldClose = "2020-02-29T12:00:00.000Z", deadline = "2021-02-28T12:00:00.000Z";
const iso = (delta: number) => new Date(Date.now() + delta).toISOString();
const runtime = { DB: store, PROOFS: env.PROOFS };
async function snapshot() {
  return {
    schema: (await q("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results,
    audit: (await q("SELECT * FROM audit_event ORDER BY id").all()).results,
    cases: (await q("SELECT * FROM moderation_case ORDER BY id").all()).results,
    requests: (await q("SELECT * FROM verification_case ORDER BY id").all()).results,
    ledger: (await q("SELECT * FROM d1_migrations ORDER BY id").all()).results,
  };
}
async function seed(caseId = "a-case", requestId = "z-verification", audits = false, unknown = false) {
  await reset();
  await applyD1Migrations(store, all.filter(m => m.name < "0010"));
  await q("INSERT INTO user(id,name,email,role) VALUES('f','Synthetic Filer','f@example.invalid','freelancer'),('g','Other Filer','g@example.invalid','freelancer'),('m','Synthetic Moderator','m@example.invalid','moderator'),('a','Synthetic Admin','a@example.invalid','admin')").run();
  await q("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('f','Synthetic Filer','rejected'),('g','Other Filer','rejected')").run();
  for (const policy of ["privacy", "terms"] as const) await q("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,'a',?,?)", `a-${policy}`, policy, POLICY_VERSIONS[policy]).run();
  for (const [id, subject, close] of [[requestId, "f", oldClose], ["other-verification", "g", iso(-1000)]] as const) {
    await q("INSERT INTO verification_case(id,freelancer_id,decision,reason,decided_at,created_at) VALUES(?,?,'reject','Synthetic reason',?,?)", id, subject, close, "2020-01-01T00:00:00.000Z").run();
    await q("INSERT INTO moderation_case(id,kind,subject_id,status,decision,reason,decided_by,decided_at,created_at) VALUES(?,'verification',?,'decided','reject','Synthetic reason','m',?,?)", id === requestId ? caseId : "other-case", id, close, "2020-01-01T00:00:00.000Z").run();
  }
  if (unknown) {
    await q("INSERT INTO moderation_case(id,kind,subject_id,status,decision,reason,decided_by,decided_at,created_at) VALUES('unknown-case','verification','absent-request','decided','reject','Unknown historical relationship','m',?,'2020-01-01T00:00:00.000Z')", oldClose).run();
    await q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES('unknown-owner-audit','m','verification_inspected','verification_case','absent-request')").run();
  }
  if (audits) {
    for (const action of ["verification_requested", "verification_inspected", "verification_decided", "moderation_claimed", "moderation_reclaimed", "moderation_released"]) {
      const isVerification = action.startsWith("verification_");
      await q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,'m',?,?,?,'2020-02-29T11:00:00.000Z')", action, action, isVerification ? "verification_case" : "moderation_case", isVerification ? requestId : caseId).run();
    }
    for (const [id, action, type, subject] of [
      ["missing", "verification_inspected", "verification_case", "absent-request"],
      ["wrong-type", "verification_inspected", "moderation_case", requestId],
      ["unknown-action", "unrecognized_historical_action", "verification_case", requestId],
      ["other", "verification_decided", "verification_case", "other-verification"],
    ]) await q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,'m',?,?,?,'2020-02-29T11:00:00.000Z')", id, action, type, subject).run();
  }
  await applyD1Migrations(store, all.filter(m => m.name < "0012"));
  return { caseId, requestId };
}
async function healthy() {
  expect((await q("PRAGMA foreign_keys").first())?.foreign_keys).toBe(1);
  expect((await q("PRAGMA foreign_key_check").all()).results).toEqual([]);
}
async function hold(targetId: string) {
  expect(await placeRetentionHold(db, "a", { targetType: "case", targetId, kind: "legal", reason: "Finite independent synthetic purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
  return (await q("SELECT id FROM retention_hold WHERE target_id=?", targetId).first<{ id: string }>())!.id;
}

describe("0012 exact historical audit backfill", () => {
  it("backfills only provable case owners and leaves missing historical identity unknown", async () => {
    await seed(undefined, undefined, false, true);
    await q("INSERT INTO verification_case(id,freelancer_id) VALUES('unique-request','f')").run();
    await q("INSERT INTO moderation_case(id,kind,subject_id) VALUES('unique-case','verification','unique-request')").run();
    await expect(q("INSERT INTO moderation_case(id,kind,subject_id) VALUES('duplicate-case','verification','unique-request')").run()).rejects.toThrow(/UNIQUE/);
    const before = await snapshot();
    await applyD1Migrations(store, all);
    const after = await snapshot();
    expect(after.requests).toEqual(before.requests);
    for (const row of before.cases) expect(after.cases).toEqual(expect.arrayContaining([{ ...row, verification_subject_user_id: before.requests.find(v => row.kind === "verification" && v.id === row.subject_id)?.freelancer_id ?? null }]));
    expect(await q("SELECT verification_subject_user_id FROM moderation_case WHERE id='unknown-case'").first()).toEqual({ verification_subject_user_id: null });
    expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='moderation_case' AND target_id='unknown-case' AND subject_user_id IN ('f','g','m')").first()).toBeNull();
    expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id='unknown-owner-audit' AND subject_user_id IN ('f','g')").first()).toBeNull();
    await expect(q("UPDATE moderation_case SET verification_subject_user_id='f' WHERE id='unknown-case'").run()).rejects.toThrow(/immutable/);
    await healthy();
  });
  it("changes only provable NULL case links, preserving unmatched evidence and original actual close clocks", async () => {
    const f = await seed(undefined, undefined, true);
    await q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id,retain_until) VALUES('already-linked','m','verification_decided','verification_case',?,'other-case','2028-01-01T00:00:00.000Z')", f.requestId).run();
    const before = await snapshot();
    await applyD1Migrations(store, all);
    const after = await snapshot();
    expect(after.cases).toEqual(before.cases.map(c => ({ ...c, verification_subject_user_id: before.requests.find(v => c.kind === "verification" && v.id === c.subject_id)?.freelancer_id ?? null })));
    expect(after.requests).toEqual(before.requests);
    const known = new Set(["verification_requested", "verification_inspected", "verification_decided", "moderation_claimed", "moderation_reclaimed", "moderation_released"]);
    expect(after.audit).toEqual(before.audit.map(e => ({ ...e, moderation_case_id: known.has(String(e.id)) ? f.caseId : e.id === "other" ? "other-case" : e.moderation_case_id })));
    for (const id of known) {
      expect(await q("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='audit_event' AND target_id=?", id).first()).toEqual({ purge_due_at: deadline });
      expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id=? AND subject_user_id='f'", id).first()).not.toBeNull();
      expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id=? AND subject_user_id='g'", id).first()).toBeNull();
    }
    for (const id of ["missing", "wrong-type", "unknown-action"]) expect(await q("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='audit_event' AND target_id=?", id).first()).toEqual({ purge_due_at: null });
    const stable = await snapshot(); await applyD1Migrations(store, all); expect(await snapshot()).toEqual(stable);
    await expect(q("UPDATE audit_event SET moderation_case_id=NULL WHERE id='verification_inspected'").run()).rejects.toThrow(/immutable/);
    await expect(q("DELETE FROM audit_event WHERE id='verification_inspected'").run()).rejects.toThrow(/claimed purge/);
    await healthy();
  });
  it("rolls back failed guard replacement/backfill together with the ledger and restores audit immutability", async () => {
    await seed(undefined, undefined, true); const before = await snapshot();
    const repair = all.find(m => m.name.startsWith("0012"))!;
    await expect(applyD1Migrations(store, [...all.filter(m => m.name < "0012"), { ...repair, queries: [...repair.queries, "INSERT INTO user(id,name,email) VALUES('bad','Synthetic','f@example.invalid')"] }])).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    await expect(q("UPDATE audit_event SET subject_id='forged' WHERE id='verification_inspected'").run()).rejects.toThrow(/immutable/);
    await healthy();
  });
});

describe("PRD-F12 verification close-anchor dependencies", () => {
  for (const [caseId, requestId] of [["a-case", "z-verification"], ["z-case", "a-verification"]]) {
    it(`purges subject before case with batch limit one in lexical order ${caseId}/${requestId}`, async () => {
      await seed(caseId, requestId); await applyD1Migrations(store, all);
      await expect(q("INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('premature','moderation_case',?,'purge','retention_due',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))", caseId, deadline).run()).rejects.toThrow(/verification subject still needs case close anchor/);
      await expect(q("DELETE FROM moderation_case WHERE id=?", caseId).run()).rejects.toThrow();
      expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ claimed: 1, completed: 1, blocked: 0 });
      expect(await q("SELECT 1 FROM verification_case WHERE id=?", requestId).first()).toBeNull();
      expect(await q("SELECT closed_at FROM moderation_case WHERE id=?", caseId).first()).toEqual({ closed_at: oldClose });
      expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
      expect(await q("SELECT 1 FROM moderation_case WHERE id=?", caseId).first()).toBeNull();
      expect(await q("SELECT 1 FROM verification_case WHERE id='other-verification'").first()).not.toBeNull();
      await healthy();
    });
  }
  it("keeps the anchor for an independently held verification subject and progresses after finite hold release", async () => {
    const f = await seed(); await applyD1Migrations(store, all);
    const subjectHold = await hold(f.requestId);
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ claimed: 0 });
    expect(await q("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='verification_case' AND target_id=?", f.requestId).first()).toEqual({ purge_due_at: deadline });
    expect(await q("SELECT 1 FROM moderation_case WHERE id=?", f.caseId).first()).not.toBeNull();
    expect(await releaseRetentionHold(db, "a", subjectHold)).toEqual({ ok: true });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await q("SELECT 1 FROM moderation_case WHERE id=?", f.caseId).first()).toBeNull();
    await healthy();
  });
  it("a case-only hold preserves its own history without extending the verification subject lifetime", async () => {
    const f = await seed(); await applyD1Migrations(store, all);
    const caseHold = await hold(f.caseId);
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.requestId).first()).toBeNull();
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ claimed: 0 });
    expect(await q("SELECT closed_at FROM moderation_case WHERE id=?", f.caseId).first()).toEqual({ closed_at: oldClose });
    expect(await releaseRetentionHold(db, "a", caseHold)).toEqual({ ok: true });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    await healthy();
  });
  it("retains exact claimed eligibility through a failed subject purge and settled retry", async () => {
    const f = await seed(); await applyD1Migrations(store, all); await issueDueTasks(db, 1);
    const issued = await q("SELECT id FROM maintenance_task WHERE target_type='verification_case' AND target_id=?", f.requestId).first<{ id: string }>();
    const task = await claimMaintenanceTask(db, issued!.id);
    expect(task).toMatchObject({ status: "claimed", attempts: 1, due_at: deadline });
    await expect(q("DELETE FROM moderation_case WHERE id=?", f.caseId).run()).rejects.toThrow();
    expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", task!.id).first()).toEqual({ id: task!.id });
    await q("UPDATE maintenance_task SET status='blocked' WHERE id=?", task!.id).run();
    await q("CREATE TRIGGER synthetic_verification_failure AFTER DELETE ON verification_case BEGIN SELECT RAISE(ABORT,'injected subject purge failure'); END").run();
    try { expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 0, blocked: 1 }); }
    finally { await q("DROP TRIGGER synthetic_verification_failure").run(); }
    expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", task!.id).first()).toEqual({ id: task!.id });
    expect(await q("SELECT closed_at FROM moderation_case WHERE id=?", f.caseId).first()).toEqual({ closed_at: oldClose });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
    expect(await q("SELECT status,attempts FROM maintenance_task WHERE id=?", task!.id).first()).toEqual({ status: "completed", attempts: 3 });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    await healthy();
  });
  it("rechecks a pre-repair claimed case task and retries its exact grant only after the subject is erased", async () => {
    const f = await seed();
    await q("INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('old-case-task','moderation_case',?,'purge','retention_due',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))", f.caseId, deadline).run();
    const task = await claimMaintenanceTask(db, "old-case-task");
    expect(task).toMatchObject({ status: "claimed", attempts: 1, due_at: deadline });
    await applyD1Migrations(store, all);
    // The original exact grant remains valid; the additional dependency guard
    // independently refuses destruction until the close anchor is no longer needed.
    expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", task!.id).first()).toEqual({ id: task!.id });
    await expect(q("DELETE FROM moderation_case WHERE id=?", f.caseId).run()).rejects.toThrow();
    expect(await q("SELECT status,claimed_at,attempts FROM maintenance_task WHERE id=?", task!.id).first()).toEqual({ status: "claimed", claimed_at: task!.claimed_at, attempts: 1 });
    // This known original owner explicitly reports settled failure; elapsed
    // time alone never adopts a pre-existing unknown claimed invocation.
    await q("UPDATE maintenance_task SET status='blocked' WHERE id=? AND attempts=? AND claimed_at=?", task!.id, task!.attempts, task!.claimed_at).run();
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
    expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.requestId).first()).toBeNull();
    expect(await q("SELECT id,due_at FROM pilot_maintenance_eligible WHERE id=?", task!.id).first()).toEqual({ id: task!.id, due_at: deadline });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
    expect(await q("SELECT status,attempts,due_at FROM maintenance_task WHERE id=?", task!.id).first()).toEqual({ status: "completed", attempts: 2, due_at: deadline });
    await healthy();
  });
  it("rejects claim of a pre-repair planned case task until its verification dependency is gone", async () => {
    const f = await seed();
    await q("INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('old-planned-case','moderation_case',?,'purge','retention_due',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))", f.caseId, deadline).run();
    await applyD1Migrations(store, all);
    await expect(claimMaintenanceTask(db, "old-planned-case")).rejects.toThrow(/verification subject still needs case close anchor/);
    expect(await q("SELECT status,attempts FROM maintenance_task WHERE id='old-planned-case'").first()).toEqual({ status: "planned", attempts: 0 });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await runMaintenance(runtime, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await q("SELECT status,attempts FROM maintenance_task WHERE id='old-planned-case'").first()).toEqual({ status: "completed", attempts: 1 });
    await healthy();
  });
});
