import type { Db } from "@/server/db";

export const clock = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const adminGate = "EXISTS(SELECT 1 FROM pilot_live_staff WHERE id=? AND role='admin')";
export const responsibleGate = `responsible_id=? AND ${adminGate}`;
export type PrivacyRequest = {
  id: string; subject_user_id: string | null; responsible_id: string | null; kind: string;
  received_at: string; due_at: string; identity_verified_at: string | null; status: string;
  scope: string; assessment: string | null; outcome: string | null; assessed_at: string | null;
  deactivated_at: string | null; closed_at: string | null;
};
export async function currentAdmin(db: Db, actorId: string | null) {
  return !!actorId && !!await db.$client.prepare("SELECT id FROM pilot_live_staff WHERE id=? AND role='admin'").bind(actorId).first();
}
export async function getPrivacyRequest(db: Db, actorId: string, id: string) {
  return db.$client.prepare(`SELECT * FROM privacy_request WHERE id=? AND ${adminGate}`).bind(id, actorId).first<PrivacyRequest>();
}
export async function privacyDashboard(db: Db, actorId: string) {
  if (!await currentAdmin(db, actorId)) return null;
  const [requests, tasks, holds, backups, unassessed, due, writers, proofWriters] = await Promise.all([
    db.$client.prepare("SELECT * FROM privacy_request ORDER BY closed_at IS NOT NULL,due_at,id LIMIT 100").all<PrivacyRequest>(),
    db.$client.prepare("SELECT * FROM maintenance_task WHERE status IN ('planned','claimed','blocked') ORDER BY due_at,attempts,id LIMIT 100").all(),
    db.$client.prepare(`SELECT * FROM retention_hold WHERE released_at IS NULL AND expires_at>${clock} ORDER BY review_due_at LIMIT 100`).all(),
    db.$client.prepare("SELECT * FROM backup_disposition WHERE status!='verified' ORDER BY due_at LIMIT 100").all(),
    db.$client.prepare("SELECT target_type,count(*) AS count FROM pilot_maintenance_target WHERE purge_due_at IS NULL AND close_due_at IS NULL GROUP BY target_type").all(),
    db.$client.prepare(`SELECT target_type,count(*) AS count FROM pilot_maintenance_target WHERE purge_due_at<=${clock} OR close_due_at<=${clock} GROUP BY target_type`).all(),
    db.$client.prepare("SELECT id,privacy_request_id,created_at,expires_at FROM export_delivery WHERE write_inflight=1 ORDER BY created_at LIMIT 100").all(),
    db.$client.prepare("SELECT id,log_id,uploaded_at FROM proof_file WHERE write_inflight=1 ORDER BY uploaded_at LIMIT 100").all(),
  ]);
  return { requests: requests.results, tasks: tasks.results, holds: holds.results, backups: backups.results, unassessed: unassessed.results, due: due.results, writers: writers.results, proofWriters: proofWriters.results };
}
export function auditPrivacy(db: Db, actor: string, requestId: string, action: "privacy_recorded" | "privacy_assigned" | "privacy_verified" | "privacy_assessed" | "privacy_executed" | "privacy_outcome") {
  return db.$client.prepare(`INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) SELECT ?,?,?,'privacy_request',? WHERE changes()=1`)
    .bind(crypto.randomUUID(), actor, action, requestId);
}
