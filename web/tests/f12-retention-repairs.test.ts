import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { claimMaintenanceTask, issueDueTasks } from "@/server/db/queries/lifecycle";
import { assessPrivacyRequest, recordPrivacyOutcome, recordPrivacyRequest, placeRetentionHold, releaseRetentionHold } from "@/features/privacy/handlers";
import type { Assessment } from "@/features/privacy/schema";
import { addActor } from "./private-intake-fixtures";

const db = createDb(env.DB), iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
const query = (sql: string, ...args: (string | number | null)[]) => env.DB.prepare(sql).bind(...args);

async function shell() {
  const subject = crypto.randomUUID(), admin = await addActor("admin");
  // A synthetic final deactivated shell: no remaining account/profile/consent purposes.
  await query("INSERT INTO user(id,name,email,role,deactivated_at) VALUES(?,'Closed account',?,'client',?)", subject, `${subject}@closed.invalid`, iso(-10000)).run();
  return { subject, admin };
}
async function request(subject: string, admin: string, targets: Assessment["targets"] = []) {
  const recorded = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!recorded.ok || !recorded.id) throw new Error("synthetic_request");
  const a: Assessment = { targets, identity: { method: "non_id_control", evidenceReference: "synthetic-control", verifiedSubjectId: subject, verifiedAt: iso(-1000) }, categories: [{ category: "identity", disposition: "remove", basis: "Synthetic final shell erasure", until: iso(86400000) }], backups: "inventoried" };
  expect(await assessPrivacyRequest(db, admin, recorded.id, a)).toEqual({ ok: true });
  return recorded.id;
}
async function finalTask(state: "executing" | "deferred") {
  const f = await shell(), due = iso(-1000);
  // Create the authorizer before another same-subject request: detachment must
  // be ordered by authority rather than row insertion or lexical request ID.
  const id = await request(f.subject, f.admin, [{ targetType: "user", targetId: f.subject, operation: "purge", basis: "assessed_erasure", dueAt: due }]);
  const sameSubject = await request(f.subject, f.admin);
  if (state === "deferred") expect(await recordPrivacyOutcome(db, f.admin, id, "deferred", "Finite remaining shell erasure", iso(86400000))).toEqual({ ok: true });
  else await query("UPDATE privacy_request SET status='executing' WHERE id=?", id).run();
  await issueDueTasks(db, 25);
  const task = await query("SELECT id FROM maintenance_task WHERE privacy_request_id=?", id).first<{ id: string }>();
  if (!task) throw new Error("synthetic_final_task");
  return { ...f, id, sameSubject, taskId: task.id };
}

describe("PRD-F12 final shell erasure", () => {
  for (const state of ["executing", "deferred"] as const) {
    it(`atomically erases ${state} shell, detaches only its subject and records physical completion`, async () => {
      const f = await finalTask(state), unrelated = await shell();
      const otherRequest = await request(unrelated.subject, unrelated.admin);
      const before = await query("SELECT * FROM privacy_request WHERE id=?", f.id).first();
      const otherBefore = await query("SELECT * FROM privacy_request WHERE id=?", otherRequest).first();
      expect(await recordPrivacyOutcome(db, f.admin, f.id, "completed", "No premature completion")).toMatchObject({ ok: false });
      expect(await runMaintenance(env, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
      expect(await query("SELECT 1 FROM user WHERE id=?", f.subject).first()).toBeNull();
      expect(await query("SELECT subject_user_id FROM privacy_request WHERE id=?", f.sameSubject).first()).toEqual({ subject_user_id: null });
      expect(await query("SELECT * FROM privacy_request WHERE id=?", otherRequest).first()).toEqual(otherBefore);
      const task = await query("SELECT * FROM maintenance_task WHERE id=?", f.taskId).first();
      expect(task).toMatchObject({ status: "completed", attempts: 1, target_id: f.subject, privacy_request_id: f.id });
      if (state === "executing") expect(await recordPrivacyOutcome(db, f.admin, f.id, "completed", "Final shell confirmed absent")).toEqual({ ok: true });
      else expect(await query("SELECT * FROM privacy_request WHERE id=?", f.id).first()).toEqual({ ...before, subject_user_id: null });
      expect((await query("PRAGMA foreign_key_check").all()).results).toEqual([]);
    });
    it(`rolls back every ${state} detachment and receipt when DELETE fails, then retries exact authority`, async () => {
      const f = await finalTask(state);
      const requests = (await query("SELECT * FROM privacy_request WHERE subject_user_id=? ORDER BY id", f.subject).all()).results;
      // Abort after detachment and the normal consumption trigger would run.
      await env.DB.prepare("CREATE TRIGGER synthetic_shell_failure AFTER DELETE ON user BEGIN SELECT RAISE(ABORT,'injected final shell failure'); END").run();
      try { expect(await runMaintenance(env, Date.now(), 1)).toMatchObject({ completed: 0, blocked: 1 }); }
      finally { await env.DB.prepare("DROP TRIGGER synthetic_shell_failure").run(); }
      expect(await query("SELECT 1 FROM user WHERE id=?", f.subject).first()).not.toBeNull();
      expect((await query("SELECT * FROM privacy_request WHERE subject_user_id=? ORDER BY id", f.subject).all()).results).toEqual(requests);
      expect(await query("SELECT status,completed_at,attempts FROM maintenance_task WHERE id=?", f.taskId).first()).toEqual({ status: "blocked", completed_at: null, attempts: 1 });
      expect(await query("SELECT id FROM pilot_maintenance_eligible WHERE id=?", f.taskId).first()).toEqual({ id: f.taskId });
      expect(await runMaintenance(env, Date.now(), 1)).toMatchObject({ completed: 1, blocked: 0 });
      expect(await query("SELECT 1 FROM user WHERE id=?", f.subject).first()).toBeNull();
      expect(await query("SELECT status,attempts FROM maintenance_task WHERE id=?", f.taskId).first()).toEqual({ status: "completed", attempts: 2 });
    });
  }
  it("refuses unclaimed/foreign grants and active holds without detachment", async () => {
    const f = await finalTask("executing"), other = await shell();
    const otherRequest = await request(other.subject, other.admin);
    await expect(query("DELETE FROM user WHERE id=?", f.subject).run()).rejects.toThrow(/claimed purge/);
    expect(await placeRetentionHold(db, f.admin, { targetType: "user", targetId: f.subject, kind: "legal", reason: "Finite synthetic user hold", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    expect(await claimMaintenanceTask(db, f.taskId)).toBeNull();
    expect(await runMaintenance(env, Date.now(), 1)).toMatchObject({ claimed: 0 });
    expect(await query("SELECT subject_user_id FROM privacy_request WHERE id=?", f.id).first()).toEqual({ subject_user_id: f.subject });
    await expect(query("UPDATE privacy_request SET subject_user_id=NULL WHERE id=?", otherRequest).run()).rejects.toThrow(/immutable/);
    const hold = await query("SELECT id FROM retention_hold WHERE target_id=?", f.subject).first<{ id: string }>();
    expect(await releaseRetentionHold(db, f.admin, hold!.id)).toEqual({ ok: true });
    expect(await runMaintenance(env, Date.now(), 1)).toMatchObject({ completed: 1 });
    expect(await query("SELECT 1 FROM user WHERE id=?", other.subject).first()).not.toBeNull();
  });
});
