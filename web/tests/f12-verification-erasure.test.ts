import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { claimMaintenanceTask, issueDueTasks } from "@/server/db/queries/lifecycle";
import { claimVerification, inspectVerification, decideVerification } from "@/features/moderation/handlers";
import { assessPrivacyRequest, recordPrivacyRequest, recordPrivacyOutcome, placeRetentionHold, releaseRetentionHold } from "@/features/privacy/handlers";
import type { Assessment } from "@/features/privacy/schema";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { POLICY_VERSIONS } from "@/lib/policies";
import { addActor } from "./private-intake-fixtures";

const db = createDb(env.DB), iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
const q = (sql: string, ...args: (string | number | null)[]) => env.DB.prepare(sql).bind(...args);
type State = "executing" | "deferred";
type Target = Assessment["targets"][number];
const purge = (targetType: Target["targetType"], targetId: string, dueAt: string): Target => ({ targetType, targetId, operation: "purge", basis: "assessed_erasure", dueAt });

async function reviewed(caseFirst = true) {
  const subject = await addActor("freelancer"), reviewer = await addActor("moderator"), admin = await addActor("admin");
  await q("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'freelancer_ack',?)", crypto.randomUUID(), subject, POLICY_VERSIONS.freelancer_ack).run();
  await q("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES(?,'Synthetic user','pending')", subject).run();
  const suffix = crypto.randomUUID(), caseId = `${caseFirst ? "a" : "z"}-case-${suffix}`, verificationId = `${caseFirst ? "z" : "a"}-verification-${suffix}`;
  const submitted = JSON.stringify({ name: "Synthetic user", city: "Manila", portfolioLinks: [{ url: "https://example.com/synthetic" }] });
  await q("INSERT INTO verification_case(id,freelancer_id,submitted_profile) VALUES(?,?,?)", verificationId, subject, submitted).run();
  await q("INSERT INTO moderation_case(id,kind,subject_id,verification_subject_user_id) VALUES(?,'verification',?,?)", caseId, verificationId, subject).run();
  const claim = await claimVerification(db, reviewer, { caseId });
  if (!claim.ok) throw new Error("synthetic_claim");
  const lease = { caseId, expectedClaimUntil: claim.claimUntil };
  expect(await inspectVerification(db, reviewer, { ...lease, idKind: "passport", result: "pass", nameMatch: true })).toEqual({ ok: true });
  expect(await decideVerification(db, reviewer, { ...lease, decision: "reject", reason: "Synthetic independently assessed verification review" })).toEqual({ ok: true });
  const caseRow = await q("SELECT * FROM moderation_case WHERE id=?", caseId).first();
  const verificationRow = await q("SELECT * FROM verification_case WHERE id=?", verificationId).first();
  const audits = (await q("SELECT * FROM audit_event WHERE moderation_case_id=? ORDER BY id", caseId).all()).results;
  expect(audits).toHaveLength(3); expect(subject).not.toBe(reviewer); expect(subject).not.toBe(admin);
  const naturalDue = addTwelveMonthsUtc(String(caseRow!.closed_at));
  expect(naturalDue > iso()).toBe(true);
  return { subject, reviewer, admin, caseId, verificationId, caseRow, verificationRow, audits, naturalDue };
}
async function plan(subject: string, admin: string, targets: Target[], state: State = "executing") {
  const recorded = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!recorded.ok || !recorded.id) throw new Error("synthetic_privacy_request");
  const assessment: Assessment = { targets, identity: { method: "non_id_control", evidenceReference: "synthetic-subject-control", verifiedSubjectId: subject, verifiedAt: iso(-1000) }, categories: [{ category: "history", disposition: "remove", basis: "Individually assessed earlier verification erasure", until: iso(86400000) }], backups: "inventoried" };
  expect(await assessPrivacyRequest(db, admin, recorded.id, assessment)).toEqual({ ok: true });
  if (state === "executing") await q("UPDATE privacy_request SET status='executing' WHERE id=?", recorded.id).run();
  else expect(await recordPrivacyOutcome(db, admin, recorded.id, "deferred", "Finite assessed history work remains", iso(86400000))).toEqual({ ok: true });
  return { id: recorded.id, targets, state, receipt: await q("SELECT * FROM privacy_request WHERE id=?", recorded.id).first() };
}
function historyTargets(f: Awaited<ReturnType<typeof reviewed>>) {
  const due = iso(-1);
  return [purge("verification_case", f.verificationId, due), ...f.audits.map(a => purge("audit_event", String(a.id), due)), purge("moderation_case", f.caseId, due)];
}
async function drain(p: Awaited<ReturnType<typeof plan>>, limit: number) {
  for (let i = 0; i < 12; i++) {
    const r = await runMaintenance(env, Date.now(), limit);
    expect(r.claimed).toBeLessThanOrEqual(limit); expect(r.blocked).toBe(0);
    const receipts = (await q("SELECT * FROM maintenance_task WHERE privacy_request_id=?", p.id).all()).results;
    if (receipts.length === p.targets.length && receipts.every(t => t.status === "completed")) return;
  }
  throw new Error("exact_assessed_work_did_not_finish");
}
async function completed(f: Awaited<ReturnType<typeof reviewed>>, p: Awaited<ReturnType<typeof plan>>) {
  expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.verificationId).first()).toBeNull();
  expect(await q("SELECT 1 FROM moderation_case WHERE id=?", f.caseId).first()).toBeNull();
  expect((await q("SELECT id FROM audit_event WHERE moderation_case_id=?", f.caseId).all()).results).toEqual([]);
  const receipts = (await q("SELECT * FROM maintenance_task WHERE privacy_request_id=?", p.id).all()).results;
  expect(receipts).toHaveLength(p.targets.length);
  for (const target of p.targets) expect(receipts).toEqual(expect.arrayContaining([expect.objectContaining({ target_type: target.targetType, target_id: target.targetId, operation: target.operation, basis: target.basis, due_at: target.dueAt, status: "completed", authorized_by: f.admin })]));
  if (p.state === "executing") expect(await recordPrivacyOutcome(db, f.admin, p.id, "completed", "All independently assessed verification history confirmed absent")).toEqual({ ok: true });
  else {
    expect(await q("SELECT * FROM privacy_request WHERE id=?", p.id).first()).toEqual(p.receipt);
    expect(await recordPrivacyOutcome(db, f.admin, p.id, "completed", "Do not rewrite a deferred receipt")).toMatchObject({ ok: false });
  }
  expect((await q("PRAGMA foreign_key_check").all()).results).toEqual([]);
}

describe("PRD-F12 assessed verification history retains exact subject authority", () => {
  for (const state of ["executing", "deferred"] as const) for (const limit of [1, 25]) for (const caseFirst of [true, false]) {
    it(`${state}, batch ${limit}, ${caseFirst ? "case" : "request"} ID first erases all exact targets before natural expiry`, async () => {
      const f = await reviewed(caseFirst), unrelated = await reviewed(!caseFirst), p = await plan(f.subject, f.admin, historyTargets(f), state);
      const otherCase = await q("SELECT * FROM moderation_case WHERE id=?", unrelated.caseId).first();
      expect(await recordPrivacyOutcome(db, f.admin, p.id, "completed", "No premature completion")).toMatchObject({ ok: false });
      await drain(p, limit); await completed(f, p);
      expect(await q("SELECT * FROM moderation_case WHERE id=?", unrelated.caseId).first()).toEqual(otherCase);
      expect(await q("SELECT * FROM verification_case WHERE id=?", unrelated.verificationId).first()).toEqual(unrelated.verificationRow);
      expect(await q("SELECT 1 FROM user WHERE id=?", f.subject).first()).not.toBeNull();
    });
  }

  it("keeps an already-claimed reviewer audit grant exact after request deletion and still checks live staff", async () => {
    const f = await reviewed(), p = await plan(f.subject, f.admin, historyTargets(f));
    await issueDueTasks(db, 25);
    const rows = (await q("SELECT id,target_type,target_id FROM maintenance_task WHERE privacy_request_id=?", p.id).all()).results;
    const v = rows.find(t => t.target_type === "verification_case")!, a = rows.find(t => t.target_type === "audit_event")!;
    const requestTask = await claimMaintenanceTask(db, String(v.id)), auditTask = await claimMaintenanceTask(db, String(a.id));
    expect(requestTask).not.toBeNull(); expect(auditTask).not.toBeNull();
    await q("DELETE FROM verification_case WHERE id=?", f.verificationId).run();
    expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", auditTask!.id).first()).toEqual({ id: auditTask!.id });
    expect(await q("SELECT * FROM moderation_case WHERE id=?", f.caseId).first()).toEqual(f.caseRow);
    await q("UPDATE user SET banned=1 WHERE id=?", f.admin).run();
    expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", auditTask!.id).first()).toBeNull();
    await expect(q("DELETE FROM audit_event WHERE id=?", auditTask!.target_id).run()).rejects.toThrow(/exact claimed purge/);
    await q("UPDATE user SET banned=0 WHERE id=?", f.admin).run();
    expect(await q("SELECT id,attempts,claimed_at FROM pilot_maintenance_eligible WHERE id=?", auditTask!.id).first()).toEqual({ id: auditTask!.id, attempts: auditTask!.attempts, claimed_at: auditTask!.claimed_at });
    await q("DELETE FROM audit_event WHERE id=?", auditTask!.target_id).run();
    await drain(p, 1); await completed(f, p);
  });

  for (const held of ["audit", "case", "verification"] as const) {
    it(`preserves independent ${held} hold and the exact later erasure authority across batches`, async () => {
      const f = await reviewed(false), p = await plan(f.subject, f.admin, historyTargets(f), "deferred");
      const targetId = held === "audit" ? String(f.audits[0].id) : held === "case" ? f.caseId : f.verificationId;
      expect(await placeRetentionHold(db, f.admin, { targetType: held === "audit" ? "audit" : "case", targetId, kind: "legal", reason: "Finite independent synthetic history purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
      for (let i = 0; i < 6; i++) await runMaintenance(env, Date.now(), 1);
      expect(await q("SELECT * FROM moderation_case WHERE id=?", f.caseId).first()).toEqual(f.caseRow);
      if (held === "audit") {
        expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.verificationId).first()).toBeNull();
        expect(await q("SELECT * FROM audit_event WHERE id=?", targetId).first()).toEqual(f.audits[0]);
        expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id=? AND subject_user_id=?", targetId, f.subject).first()).not.toBeNull();
      } else if (held === "case") expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.verificationId).first()).toBeNull();
      else expect(await q("SELECT * FROM verification_case WHERE id=?", f.verificationId).first()).toEqual(f.verificationRow);
      const hold = await q("SELECT id FROM retention_hold WHERE target_id=?", targetId).first<{ id: string }>();
      expect(await releaseRetentionHold(db, f.admin, hold!.id)).toEqual({ ok: true });
      await drain(p, 1); await completed(f, p);
    });
  }

  for (const failedTarget of ["verification_case", "audit_event", "moderation_case"] as const) {
    it(`rolls back an injected ${failedTarget} failure and retries unchanged exact assessed work`, async () => {
      const f = await reviewed(), p = await plan(f.subject, f.admin, historyTargets(f));
      const trigger = `CREATE TRIGGER synthetic_assessed_failure AFTER DELETE ON ${failedTarget} BEGIN SELECT RAISE(ABORT,'injected assessed history failure'); END`;
      await q(trigger).run();
      try {
        let blocked = 0;
        for (let i = 0; i < 6 && !blocked; i++) blocked += (await runMaintenance(env, Date.now(), 1)).blocked;
        expect(blocked).toBe(1);
      } finally { await q("DROP TRIGGER synthetic_assessed_failure").run(); }
      expect(await q("SELECT * FROM moderation_case WHERE id=?", f.caseId).first()).toEqual(f.caseRow);
      const blocked = await q("SELECT * FROM maintenance_task WHERE privacy_request_id=? AND status='blocked'", p.id).first();
      expect(blocked).toMatchObject({ target_type: failedTarget, attempts: 1, completed_at: null });
      expect(await q("SELECT id FROM pilot_maintenance_eligible WHERE id=?", String(blocked!.id)).first()).toEqual({ id: blocked!.id });
      await drain(p, 1); await completed(f, p);
      expect(await q("SELECT status,attempts FROM maintenance_task WHERE id=?", String(blocked!.id)).first()).toEqual({ status: "completed", attempts: 2 });
    });
  }

  it("rejects forged owner fields and matching assessment JSON for an unrelated subject after request deletion", async () => {
    const f = await reviewed(), other = await addActor("freelancer"), p = await plan(f.subject, f.admin, historyTargets(f));
    await issueDueTasks(db, 1);
    const issued = await q("SELECT id FROM maintenance_task WHERE privacy_request_id=? AND target_type='verification_case'", p.id).first<{ id: string }>();
    await claimMaintenanceTask(db, issued!.id); await q("DELETE FROM verification_case WHERE id=?", f.verificationId).run();
    await expect(q("UPDATE moderation_case SET verification_subject_user_id=? WHERE id=?", other, f.caseId).run()).rejects.toThrow(/immutable/);
    await expect(q("UPDATE moderation_case SET verification_subject_user_id=NULL WHERE id=?", f.caseId).run()).rejects.toThrow(/immutable/);
    const forged = await recordPrivacyRequest(db, f.admin, { subjectUserId: other, responsibleId: f.admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
    if (!forged.ok || !forged.id) throw new Error("synthetic_unrelated_request");
    const target = purge("audit_event", String(f.audits[0].id), iso(-1));
    await q("UPDATE privacy_request SET status='executing',scope=?,assessment=?,identity_verified_at=?,assessed_at=? WHERE id=?", JSON.stringify({ targets: [target] }), JSON.stringify({ targets: [target] }), iso(-1), iso(-1), forged.id).run();
    await expect(q("INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES(?,?,?,'audit_event',?,'purge','assessed_erasure',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))", crypto.randomUUID(), forged.id, f.admin, target.targetId, target.dueAt).run()).rejects.toThrow(/unassessed/);
    // Retire this deliberately malformed direct-SQL attack fixture so it cannot
    // occupy an issuance slot ahead of the legitimate request's final case.
    await q("UPDATE privacy_request SET status='denied',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),outcome='Wrong subject has no assessed authority' WHERE id=?", forged.id).run();
    await drain(p, 1); await completed(f, p);
  });

  it("requires the exact owner at new case insertion and never allows owner replacement or detachment", async () => {
    const f = await reviewed(), other = await addActor("freelancer"), verificationId = crypto.randomUUID(), caseId = crypto.randomUUID();
    await q("INSERT INTO verification_case(id,freelancer_id) VALUES(?,?)", verificationId, f.subject).run();
    for (const forged of [other, null]) await expect(q("INSERT INTO moderation_case(id,kind,subject_id,verification_subject_user_id) VALUES(?,'verification',?,?)", caseId, verificationId, forged).run()).rejects.toThrow(/exact verification subject/);
    await q("INSERT INTO moderation_case(id,kind,subject_id,verification_subject_user_id) VALUES(?,'verification',?,?)", caseId, verificationId, f.subject).run();
    for (const forged of [other, null]) await expect(q("UPDATE moderation_case SET verification_subject_user_id=? WHERE id=?", forged, caseId).run()).rejects.toThrow(/immutable/);
    await expect(q("DELETE FROM moderation_case WHERE id=?", caseId).run()).rejects.toThrow();
    expect(await q("SELECT verification_subject_user_id FROM moderation_case WHERE id=?", caseId).first()).toEqual({ verification_subject_user_id: f.subject });
  });

  it("keeps a deactivated dependency-free user shell under the retained case FK until authorized case erasure", async () => {
    const f = await reviewed(), p = await plan(f.subject, f.admin, historyTargets(f));
    expect(await placeRetentionHold(db, f.admin, { targetType: "case", targetId: f.caseId, kind: "legal", reason: "Finite independently retained case purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    for (let i = 0; i < 3; i++) await runMaintenance(env);
    expect(await q("SELECT 1 FROM verification_case WHERE id=?", f.verificationId).first()).toBeNull();
    expect((await q("SELECT 1 FROM audit_event WHERE moderation_case_id=?", f.caseId).all()).results).toEqual([]);
    const policies = (await q("SELECT id FROM policy_acceptance WHERE user_id=?", f.subject).all()).results;
    const due = iso(-1);
    const clear = await plan(f.subject, f.admin, [...policies.map(row => purge("policy_acceptance", String(row.id), due)), purge("freelancer_profile", f.subject, due), { targetType: "user", targetId: f.subject, operation: "redact_identity", basis: "assessed_erasure", dueAt: due }]);
    await drain(clear, 25);
    expect(await q("SELECT deactivated_at FROM user WHERE id=?", f.subject).first()).toMatchObject({ deactivated_at: expect.any(String) });
    expect((await q("SELECT 1 FROM freelancer_profile WHERE user_id=? UNION ALL SELECT 1 FROM policy_acceptance WHERE user_id=?", f.subject, f.subject).all()).results).toEqual([]);
    const shell = await plan(f.subject, f.admin, [purge("user", f.subject, iso(-1))]);
    expect(await runMaintenance(env)).toMatchObject({ completed: 0, blocked: 1 });
    expect(await q("SELECT verification_subject_user_id FROM moderation_case WHERE id=?", f.caseId).first()).toEqual({ verification_subject_user_id: f.subject });
    expect(await q("SELECT 1 FROM user WHERE id=?", f.subject).first()).not.toBeNull();
    for (const request of [p.id, clear.id, shell.id]) expect(await q("SELECT subject_user_id FROM privacy_request WHERE id=?", request).first()).toEqual({ subject_user_id: f.subject });
    const fk = (await q("PRAGMA foreign_key_list(moderation_case)").all()).results;
    expect(fk).toEqual(expect.arrayContaining([expect.objectContaining({ from: "verification_subject_user_id", table: "user", to: "id", on_delete: "RESTRICT" })]));
    const hold = await q("SELECT id FROM retention_hold WHERE target_id=?", f.caseId).first<{ id: string }>();
    expect(await releaseRetentionHold(db, f.admin, hold!.id)).toEqual({ ok: true });
    expect(await runMaintenance(env)).toMatchObject({ completed: 2, blocked: 0 });
    expect(await q("SELECT 1 FROM user WHERE id=?", f.subject).first()).toBeNull();
    await completed(f, p);
    expect(await recordPrivacyOutcome(db, f.admin, clear.id, "completed", "Assessed identity and profile work completed")).toEqual({ ok: true });
    expect(await recordPrivacyOutcome(db, f.admin, shell.id, "completed", "Final shell confirmed absent after retained case erased")).toEqual({ ok: true });
  });
});
