import type { Db } from "@/server/db";
import { clock } from "./privacy";

export type MaintenanceTask = { id: string; target_type: string; target_id: string; operation: string; basis: string; privacy_request_id: string | null; authorized_by: string | null; due_at: string; status: string; attempts: number; claimed_at: string | null };
export type RetentionTarget = { target_type: string; target_id: string; purge_due_at: string | null; close_due_at: string | null; log_id: string | null; hold_type: string };
export async function canRetainTarget(db: Db, targetType: string, targetId: string) {
  return !await db.$client.prepare("SELECT 1 FROM pilot_unheld_target WHERE target_type=? AND target_id=?").bind(targetType, targetId).first();
}
export async function claimMaintenanceTask(db: Db, taskId: string) {
  return db.$client.prepare(`UPDATE maintenance_task SET status='claimed',claimed_at=${clock},attempts=attempts+1
    WHERE id=? AND status='planned' AND authorization_expires_at>${clock}
    AND NOT EXISTS(SELECT 1 FROM export_delivery d WHERE maintenance_task.target_type='export_delivery' AND d.id=maintenance_task.target_id AND d.write_inflight=1)
    AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.write_inflight=1 AND (maintenance_task.target_type='proof_file' AND p.id=maintenance_task.target_id
      OR EXISTS(SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=maintenance_task.target_type AND x.target_id=maintenance_task.target_id AND x.log_id=p.log_id)))
    AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible e WHERE e.id=maintenance_task.id) RETURNING *`).bind(taskId).first<MaintenanceTask>();
}
export async function issueDueTasks(db: Db, limit: number) {
  // An expired unclaimed/settled grant is a retained abandoned receipt, never a
  // fabricated completion. Its independently authorized successor starts afresh.
  await db.$client.prepare(`UPDATE maintenance_task SET status='abandoned',completed_at=${clock},retain_until=(
    strftime('%Y-%m-',${clock},'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',${clock}) AS INTEGER),CAST(strftime('%d',${clock},'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(${clock},11))
    WHERE status IN ('planned','blocked') AND authorization_expires_at<=${clock}`).run();
  const assessed = await db.$client.prepare(`SELECT p.id AS request_id,p.responsible_id,json_extract(a.value,'$.targetType') AS target_type,
    json_extract(a.value,'$.targetId') AS target_id,json_extract(a.value,'$.operation') AS operation,
    json_extract(a.value,'$.basis') AS basis,json_extract(a.value,'$.dueAt') AS due_at
    FROM privacy_request p JOIN pilot_live_staff staff ON staff.id=p.responsible_id AND staff.role='admin',json_each(p.assessment,'$.targets') a
    WHERE p.status IN ('executing','deferred') AND p.identity_verified_at IS NOT NULL AND p.assessed_at IS NOT NULL
    AND json_extract(a.value,'$.dueAt')<=${clock}
    AND NOT EXISTS(SELECT 1 FROM maintenance_task t WHERE t.privacy_request_id=p.id AND t.target_type=json_extract(a.value,'$.targetType') AND t.target_id=json_extract(a.value,'$.targetId') AND t.operation=json_extract(a.value,'$.operation') AND t.status!='abandoned')
    ORDER BY json_extract(a.value,'$.dueAt'),p.id LIMIT ?`).bind(limit).all<{ request_id: string; responsible_id: string; target_type: string; target_id: string; operation: string; basis: string; due_at: string }>();
  for (const t of assessed.results) {
    try {
      await db.$client.prepare(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES(?,?,?,?,?,?,?,?,${clock},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)
        .bind(crypto.randomUUID(), t.request_id, t.responsible_id, t.target_type, t.target_id, t.operation, t.basis, t.due_at).run();
    } catch { /* A held, revoked or competing exact grant remains visible for review. */ }
  }
  const due = await db.$client.prepare(`SELECT x.* FROM pilot_unheld_target x WHERE (x.purge_due_at<=${clock} OR x.close_due_at<=${clock})
    AND NOT EXISTS(SELECT 1 FROM maintenance_task t WHERE t.target_type=x.target_type AND t.target_id=x.target_id AND t.status IN ('planned','claimed','blocked'))
    ORDER BY CASE x.target_type WHEN 'proof_file' THEN 0 WHEN 'proof_review' THEN 1 WHEN 'review_round' THEN 2 WHEN 'log_revision' THEN 3 WHEN 'engagement_log' THEN 4 ELSE 5 END,coalesce(x.close_due_at,x.purge_due_at),x.target_id LIMIT ?`).bind(limit).all<RetentionTarget>();
  for (const x of due.results) {
    const operation = x.close_due_at && x.close_due_at <= new Date().toISOString() ? "close_abandoned" : "purge";
    try {
      await db.$client.prepare(`INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at)
        VALUES(?,?,?,?,'retention_due',?,${clock},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)
        .bind(crypto.randomUUID(), x.target_type, x.target_id, operation, operation === "purge" ? x.purge_due_at : x.close_due_at).run();
    } catch { /* Another invocation may have issued the same exact target. */ }
  }
}
export function completeTaskStatement(db: Db, task: MaintenanceTask) {
  // Most physical DELETEs complete through SQL's exact-target receipt trigger.
  return db.$client.prepare(`UPDATE maintenance_task SET status='completed',completed_at=${clock},retain_until=(
    SELECT strftime('%Y-%m-',${clock},'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',${clock}) AS INTEGER),CAST(strftime('%d',${clock},'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(${clock},11))
    WHERE id=? AND status='claimed' AND attempts=? AND claimed_at=?`).bind(task.id, task.attempts, task.claimed_at);
}
export async function completeTask(db: Db, task: MaintenanceTask) {
  await completeTaskStatement(db, task).run();
}
