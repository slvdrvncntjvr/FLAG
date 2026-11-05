import type { Db } from "@/server/db";
import { adminGate, auditPrivacy, clock, currentAdmin, getPrivacyRequest, responsibleGate } from "@/server/db/queries/privacy";
import { assessment, backupInput, failure, holdInput, id, recordInput, type Assessment, type PrivacyResult } from "./schema";
import { hasNoVerificationReason } from "@/features/verification/privacy";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";

const terminal = "status NOT IN ('completed','deferred','denied')";
export async function recordPrivacyRequest(db: Db, actor: string | null, input: unknown): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const parsed = recordInput.safeParse(input); if (!parsed.success) return failure("invalid_input");
  const p = parsed.data, now = new Date().toISOString();
  if (p.receivedAt > now || p.dueAt < p.receivedAt || p.kind === "closure" && Date.parse(p.dueAt) > Date.parse(p.receivedAt) + 30 * 86400000) return failure("invalid_input");
  const requestId = crypto.randomUUID();
  try {
    const result = await db.$client.batch([
      db.$client.prepare(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope)
        SELECT ?,?,?,?,?,?,? WHERE ${adminGate}`).bind(requestId, p.subjectUserId, p.responsibleId, p.kind, p.receivedAt, p.dueAt, JSON.stringify({ targets: [], ...(p.priorRequestId ? { priorRequestId: p.priorRequestId } : {}) }), actor),
      auditPrivacy(db, actor, requestId, "privacy_recorded"),
    ]);
    return result[0].meta.changes === 1 ? { ok: true, id: requestId } : failure("forbidden");
  } catch { return failure("conflict"); }
}
export async function assignPrivacyRequest(db: Db, actor: string | null, requestId: string, responsibleId: string): Promise<PrivacyResult> {
  if (!actor || !id.safeParse(requestId).success || !id.safeParse(responsibleId).success) return failure("invalid_input");
  try {
    const r = await db.$client.batch([
      db.$client.prepare(`UPDATE privacy_request SET responsible_id=? WHERE id=? AND ${terminal} AND ${adminGate}`).bind(responsibleId, requestId, actor),
      auditPrivacy(db, actor, requestId, "privacy_assigned"),
    ]);
    return r[0].meta.changes === 1 ? { ok: true } : failure("forbidden");
  } catch { return failure("conflict"); }
}
export async function assessPrivacyRequest(db: Db, actor: string | null, requestId: string, input: unknown): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const parsed = assessment.safeParse(input); if (!parsed.success) return failure("invalid_input");
  const a = parsed.data, now = new Date().toISOString();
  const p = await getPrivacyRequest(db, actor, requestId);
  if (!p || p.responsible_id !== actor || p.subject_user_id !== a.identity.verifiedSubjectId || a.identity.verifiedAt > now || Date.parse(a.identity.verifiedAt) < Date.now() - 86400000) return failure("conflict");
  if (a.categories.some(c => c.until <= now) || new Set(a.targets.map(t => `${t.targetType}:${t.targetId}:${t.operation}`)).size !== a.targets.length) return failure("invalid_input");
  if (a.export?.authKind === "assessed_capability" && (!a.export.secureHandover || a.export.handoverChannel !== "independently_verified_private_channel")) return failure("invalid_input");
  if (p.kind === "closure" && !a.targets.some(t => t.targetType === "user" && t.targetId === p.subject_user_id && t.operation === "redact_identity" && t.basis === "account_closure" && t.dueAt <= now)) return failure("invalid_input");
  if (p.kind === "closure") {
    const identity = a.categories.find(c => c.category === "identity");
    if (!identity) return failure("invalid_input");
    // The assessed shell purpose has a real finite physical-erasure action,
    // even if dependent evidence later blocks it for explicit investigation.
    if (!a.targets.some(t => t.targetType === "user" && t.targetId === p.subject_user_id && t.operation === "purge")) a.targets.push({ targetType: "user", targetId: p.subject_user_id!, operation: "purge", dueAt: identity.until, basis: "account_closure" });
    const closure = a.targets.find(t => t.targetType === "user" && t.targetId === p.subject_user_id && t.operation === "redact_identity")!;
    const policies = await db.$client.prepare("SELECT id FROM policy_acceptance WHERE user_id=? AND retired_at IS NULL LIMIT 101").bind(p.subject_user_id).all<{ id: string }>();
    for (const policy of policies.results) if (!a.targets.some(t => t.targetType === "policy_acceptance" && t.targetId === policy.id && t.operation === "retire_policy")) a.targets.push({ targetType: "policy_acceptance", targetId: policy.id, operation: "retire_policy", dueAt: closure.dueAt, basis: "account_closure" });
    const consent = a.categories.find(c => c.category === "consent");
    if (consent && consent.until < addTwelveMonthsUtc(now)) for (const policy of policies.results) {
      if (!a.targets.some(t => t.targetType === "policy_acceptance" && t.targetId === policy.id && t.operation === "purge")) a.targets.push({ targetType: "policy_acceptance", targetId: policy.id, operation: "purge", dueAt: consent.until, basis: "account_closure" });
    }
    // Private profile/portfolio shells have no natural expiry. Materialize their
    // individually assessed identity deadline into exact executable work.
    const shells = await db.$client.prepare(`SELECT x.target_type,x.target_id FROM pilot_maintenance_target x WHERE x.target_type IN ('freelancer_profile','client_profile','portfolio_link')
      AND EXISTS(SELECT 1 FROM pilot_privacy_subject_target s WHERE s.target_type=x.target_type AND s.target_id=x.target_id AND s.subject_user_id=?) LIMIT 101`).bind(p.subject_user_id).all<{ target_type: "freelancer_profile" | "client_profile" | "portfolio_link"; target_id: string }>();
    for (const shell of shells.results) if (!a.targets.some(t => t.targetType === shell.target_type && t.targetId === shell.target_id && t.operation === "purge")) a.targets.push({ targetType: shell.target_type, targetId: shell.target_id, operation: "purge", dueAt: identity.until, basis: "account_closure" });
    if (a.targets.length > 100) return failure("invalid_input");
  }
  // Staff must enumerate actual objects, never a category-wide implicit privilege.
  for (const t of a.targets) {
    if (!await db.$client.prepare(`SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=? AND x.target_id=?
      AND EXISTS(SELECT 1 FROM pilot_privacy_subject_target s WHERE s.target_type=x.target_type AND s.target_id=x.target_id AND s.subject_user_id=?)`).bind(t.targetType, t.targetId, p.subject_user_id).first()) return failure("invalid_input");
  }
  try {
    const r = await db.$client.batch([
      db.$client.prepare(`UPDATE privacy_request SET status='assessing',scope=?,assessment=?,identity_verified_at=?,assessed_at=${clock}
        WHERE id=? AND ${terminal} AND ${responsibleGate}`)
        .bind(JSON.stringify({ ...(JSON.parse(p.scope).priorRequestId ? { priorRequestId: JSON.parse(p.scope).priorRequestId } : {}), targets: a.targets.map(({ targetType, targetId, operation, dueAt }) => ({ targetType, targetId, operation, dueAt })) }), JSON.stringify(a), a.identity.verifiedAt, requestId, actor, actor),
      auditPrivacy(db, actor, requestId, "privacy_assessed"),
    ]);
    return r[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("conflict"); }
}
export async function executePrivacyRequest(db: Db, env: Pick<CloudflareEnv, "DB" | "PROOFS">, actor: string | null, requestId: string): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const p = await getPrivacyRequest(db, actor, requestId);
  const parsed = assessment.safeParse(p?.assessment ? JSON.parse(p.assessment) : null);
  if (!p || p.responsible_id !== actor || !parsed.success || !p.identity_verified_at || p.status !== "deferred" && Date.parse(p.identity_verified_at) < Date.now() - 86400000) return failure("conflict");
  try {
    const r = await db.$client.batch([
      // A deferred receipt is immutable. Retry its unchanged finite assessment
      // without reopening it or resetting its original history deadline.
      p.status === "deferred"
        ? db.$client.prepare(`SELECT id FROM privacy_request WHERE id=? AND status='deferred' AND assessment=? AND ${responsibleGate}`).bind(requestId, p.assessment, actor, actor)
        : db.$client.prepare(`UPDATE privacy_request SET status='executing' WHERE id=? AND status IN ('assessing','executing') AND ${responsibleGate}`).bind(requestId, actor, actor),
      p.status === "deferred"
        ? db.$client.prepare(`INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,retain_until) SELECT ?,?,'privacy_executed','privacy_request',id,
            (strftime('%Y-%m-',closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',closed_at) AS INTEGER),CAST(strftime('%d',closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(closed_at,11))
            FROM privacy_request WHERE id=? AND status='deferred' AND assessment=? AND ${responsibleGate}`).bind(crypto.randomUUID(), actor, requestId, p.assessment, actor, actor)
        : auditPrivacy(db, actor, requestId, "privacy_executed"),
    ]);
    if (p.status === "deferred" ? !r[0].results.length : !r[0].meta.changes) return failure("conflict");
    const heldAtIssue: Assessment["targets"] = [];
    for (const t of parsed.data.targets.filter(t => t.dueAt <= new Date().toISOString())) {
      // Keep a verification case's close anchor until the independently
      // authorized subject purge has actually finished, including batch limits.
      if (t.targetType === "moderation_case" && t.operation === "purge" && await db.$client.prepare(
        "SELECT 1 FROM moderation_case c JOIN verification_case v ON c.kind='verification' AND v.id=c.subject_id WHERE c.id=?",
      ).bind(t.targetId).first()) continue;
      const existing = await db.$client.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=? AND target_type=? AND target_id=? AND operation=? AND status!='abandoned'").bind(p.id, t.targetType, t.targetId, t.operation).first();
      if (existing) continue;
      try {
        await db.$client.prepare(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at)
          VALUES(?,?,?,?,?,?,?,?,${clock},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`).bind(crypto.randomUUID(), p.id, actor, t.targetType, t.targetId, t.operation, t.basis, t.dueAt).run();
      } catch {
        // A hold may already exist or win the issuance race. Keep its exact
        // assessment pending while allowing other eligible actions to run.
        const held = await db.$client.prepare(`SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=? AND x.target_id=?
          AND NOT EXISTS(SELECT 1 FROM pilot_unheld_target u WHERE u.target_type=x.target_type AND u.target_id=x.target_id)`)
          .bind(t.targetType, t.targetId).first();
        if (!held) throw new Error("assessed_task_issue_failed");
        heldAtIssue.push(t);
      }
    }
    const result = await runMaintenance(env);
    let held = 0;
    for (const t of heldAtIssue) {
      // A concurrently released hold may have allowed the shared runner to
      // issue or finish this action. Do not count it again as unqueued work.
      if (await db.$client.prepare(`SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=? AND x.target_id=?
        AND NOT EXISTS(SELECT 1 FROM maintenance_task m WHERE m.privacy_request_id=? AND m.target_type=x.target_type AND m.target_id=x.target_id
          AND m.operation=? AND m.basis=? AND m.due_at=? AND m.status IN ('planned','claimed','blocked','completed'))`)
        .bind(t.targetType, t.targetId, p.id, t.operation, t.basis, t.dueAt).first()) held++;
    }
    return { ok: true, message: `${result.completed} tasks completed; ${result.blocked} blocked; ${held} held; ${result.remaining + held} remain.` };
  } catch { return failure("unavailable"); }
}
export async function recordPrivacyOutcome(db: Db, actor: string | null, requestId: string, status: "completed" | "deferred" | "denied", reason: string, followUpAt?: string, deliveryReceiptReference?: string): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  if (!reason.trim() || reason.length > 500 || !hasNoVerificationReason(reason)) return failure("invalid_input");
  const p = await getPrivacyRequest(db, actor, requestId);
  const a = assessment.safeParse(p?.assessment ? JSON.parse(p.assessment) : null);
  if (!p || !a.success || p.responsible_id !== actor) return failure("conflict");
  if (status === "completed") {
    if (p.kind === "deletion" && !a.data.targets.some(t => ["purge", "redact_identity"].includes(t.operation))) return failure("conflict");
    if ((p.kind === "deletion" || p.kind === "closure") && a.data.backups !== "inventoried") return failure("conflict");
    for (const t of a.data.targets) {
      if (!await db.$client.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=? AND target_type=? AND target_id=? AND operation=? AND status='completed'").bind(requestId, t.targetType, t.targetId, t.operation).first()) return failure("conflict");
    }
    if (p.kind === "export" || a.data.export) {
      // downloaded_at fences an attempted one-use handover. An interrupted
      // response is not evidence that the subject actually received the data.
      if (!deliveryReceiptReference || !id.safeParse(deliveryReceiptReference).success || !hasNoVerificationReason(deliveryReceiptReference)) return failure("invalid_input");
      if (!await db.$client.prepare("SELECT 1 FROM export_delivery WHERE privacy_request_id=? AND downloaded_at IS NOT NULL AND purged_at IS NOT NULL").bind(requestId).first()) return failure("conflict");
    }
  } else if (!followUpAt || !Number.isFinite(Date.parse(followUpAt)) || followUpAt <= new Date().toISOString()) return failure("invalid_input");
  try {
    const r = await db.$client.batch([
      db.$client.prepare(`UPDATE privacy_request SET status=?,outcome=?,closed_at=${clock} WHERE id=? AND ${terminal} AND ${responsibleGate}`)
        .bind(status, JSON.stringify({ reason, followUpAt: followUpAt ?? null, ...(status === "completed" && deliveryReceiptReference ? { deliveryReceiptReference } : {}) }), requestId, actor, actor),
      auditPrivacy(db, actor, requestId, "privacy_outcome"),
      db.$client.prepare(`UPDATE audit_event SET retain_until=(strftime('%Y-%m-',${clock},'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',${clock}) AS INTEGER),CAST(strftime('%d',${clock},'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(${clock},11))
        WHERE subject_type='privacy_request' AND subject_id=? AND retain_until IS NULL AND changes()=1`).bind(requestId),
    ]);
    return r[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("conflict"); }
}
export async function placeRetentionHold(db: Db, actor: string | null, input: unknown): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const p = holdInput.safeParse(input); if (!p.success) return failure("invalid_input");
  const h = p.data, now = new Date().toISOString();
  if (h.reviewDueAt < now || h.expiresAt < h.reviewDueAt) return failure("invalid_input");
  try {
    await db.$client.prepare(`INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at) SELECT ?,?,?,?,?,?,${clock},?,? WHERE ${adminGate}`)
      .bind(crypto.randomUUID(), h.targetType, h.targetId, h.kind, actor, h.reason, h.reviewDueAt, h.expiresAt, actor).run();
    return { ok: true };
  } catch { return failure("conflict"); }
}
export async function releaseRetentionHold(db: Db, actor: string | null, holdId: string): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const r = await db.$client.prepare(`UPDATE retention_hold SET released_at=${clock} WHERE id=? AND responsible_id=? AND released_at IS NULL AND ${adminGate}`).bind(holdId, actor, actor).run();
  return r.meta.changes === 1 ? { ok: true } : failure("conflict");
}

// These record actual operator evidence; they do not assert provider retention
// or execute a remote backup action on the operator's behalf.
export async function recordBackupDisposition(db: Db, actor: string | null, requestId: string, input: unknown): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  const parsed = backupInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const b = parsed.data;
  try {
    const result = await db.$client.prepare(`INSERT INTO backup_disposition(id,privacy_request_id,target_type,target_id,backup_ref,action,basis,due_at)
      SELECT ?,id,?,?,?,?,?,? FROM privacy_request WHERE id=? AND status IN ('assessing','executing','deferred') AND assessment IS NOT NULL AND ${responsibleGate}
      AND ((?='user' AND ?=subject_user_id) OR EXISTS(SELECT 1 FROM json_each(assessment,'$.targets') t WHERE json_extract(t.value,'$.targetType')=? AND json_extract(t.value,'$.targetId')=?))`)
      .bind(crypto.randomUUID(), b.targetType, b.targetId, b.backupRef, b.action, b.basis, b.dueAt, requestId, actor, actor, b.targetType, b.targetId, b.targetType, b.targetId).run();
    return result.meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("conflict"); }
}
export async function verifyBackupDisposition(db: Db, actor: string | null, backupId: string, evidenceReference: string): Promise<PrivacyResult> {
  if (!actor || !await currentAdmin(db, actor)) return failure("forbidden");
  if (!id.safeParse(evidenceReference).success || !hasNoVerificationReason(evidenceReference)) return failure("invalid_input");
  try {
    const r = await db.$client.batch([
      db.$client.prepare(`UPDATE backup_disposition SET status='verified',verified_at=${clock} WHERE id=? AND status='pending'
        AND (action!='expire' OR due_at<=${clock}) AND EXISTS(SELECT 1 FROM privacy_request p WHERE p.id=backup_disposition.privacy_request_id AND p.responsible_id=? AND p.status IN ('assessing','executing','deferred')) AND ${adminGate}`).bind(backupId, actor, actor),
      db.$client.prepare(`INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,retain_until) SELECT ?,?,'backup_verified','backup_disposition',?,
        (strftime('%Y-%m-',${clock},'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',${clock}) AS INTEGER),CAST(strftime('%d',${clock},'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(${clock},11)) WHERE changes()=1`).bind(`backup-${evidenceReference}-${crypto.randomUUID()}`, actor, backupId),
    ]);
    return r[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("conflict"); }
}
