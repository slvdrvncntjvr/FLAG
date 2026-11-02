import { createDb, type Db } from "@/server/db";
import { claimMaintenanceTask, completeTask, completeTaskStatement, issueDueTasks, type MaintenanceTask } from "@/server/db/queries/lifecycle";
import { clock } from "@/server/db/queries/privacy";
import { objectMatches, purgeClaimedProof, retryableCompensations, type ProofRecord } from "@/features/logs/proof-storage";
import { targetTypes } from "@/features/privacy/schema";
import { otpSubjectPredicate } from "./otp-identifiers";

type Budget = { r2Deletes: number; limit: number };
const exact = `EXISTS(SELECT 1 FROM pilot_maintenance_eligible e WHERE e.id=? AND e.status='claimed' AND e.attempts=? AND e.claimed_at=?)`;
const args = (t: MaintenanceTask) => [t.id, t.attempts, t.claimed_at];
async function guarded(db: Db, t: MaintenanceTask, sql: string, values: (string | number | null)[] = []) {
  return db.$client.prepare(`${sql} AND ${exact}`).bind(...values, ...args(t)).run();
}
async function changed(db: Db, t: MaintenanceTask, sql: string, values: (string | number | null)[] = []) {
  const result = await guarded(db, t, sql, values);
  // D1 includes receipt-trigger writes in meta.changes. The exact primary-key
  // predicate affects one target; only zero means that guarded target lost.
  if (result.meta.changes < 1) throw new Error("authorization_or_target_changed");
  return result;
}
async function purgeArtifact(db: Db, bucket: R2Bucket, t: MaintenanceTask, budget: Budget) {
  const row = await db.$client.prepare("SELECT object_key,write_inflight FROM export_delivery WHERE id=?").bind(t.target_id).first<{ object_key: string | null; write_inflight: number }>();
  if (row?.write_inflight) throw new Error("export_writer_unsettled");
  if (row?.object_key) {
    if (budget.r2Deletes >= budget.limit) throw new Error("batch_limit");
    await changed(db, t, "UPDATE export_delivery SET token_hash=NULL WHERE id=?", [t.target_id]);
    budget.r2Deletes++;
    await bucket.delete(row.object_key);
    if (await bucket.head(row.object_key)) throw new Error("object_still_present");
    // Clearing bytes changes the target's clock to its separate receipt purpose.
    // Commit that switch with this exact artifact task's completion.
    const r = await db.$client.batch([
      db.$client.prepare(`UPDATE export_delivery SET object_key=NULL,token_hash=NULL,purged_at=${clock} WHERE id=? AND ${exact}`).bind(t.target_id, ...args(t)),
      completeTaskStatement(db, t),
    ]);
    if (r[0].meta.changes !== 1) throw new Error("artifact_receipt_not_updated");
    return true;
  }
  return false;
}
async function purgeProof(db: Db, bucket: R2Bucket, t: MaintenanceTask, budget: Budget) {
  const p = await db.$client.prepare("SELECT * FROM proof_file WHERE id=?").bind(t.target_id).first<ProofRecord>();
  if (!p) return;
  if (p.write_inflight) throw new Error("proof_writer_unsettled");
  // A retained shared revision owns the bytes independently of the origin.
  const retained = await db.$client.prepare(`SELECT 1 FROM revision_proof rp JOIN log_revision r ON r.id=rp.revision_id
    WHERE rp.proof_id=? AND NOT EXISTS(SELECT 1 FROM pilot_unheld_target x WHERE x.target_type='log_revision' AND x.target_id=r.id AND x.purge_due_at<=${clock})
    AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible e WHERE e.target_type='log_revision' AND e.target_id=r.id AND e.operation='purge' AND e.status='claimed')`).bind(p.id).first();
  if (retained || budget.r2Deletes >= budget.limit) throw new Error("retained_or_limit");
  await changed(db, t, "UPDATE proof_file SET status='pending_purge' WHERE id=? AND purge_inflight=0", [p.id]);
  const claim = await db.$client.prepare(`UPDATE proof_file SET purge_inflight=1,purge_attempts=purge_attempts+1
    WHERE id=? AND status='pending_purge' AND purge_inflight=0 AND ${exact} RETURNING *`).bind(p.id, ...args(t)).first<ProofRecord>();
  if (!claim) throw new Error("proof_claim_lost");
  try {
    const head = await bucket.head(p.object_key);
    if (head && !objectMatches(head, p)) throw new Error("byte_identity_mismatch");
    if (!await db.$client.prepare(`SELECT 1 WHERE ${exact}`).bind(...args(t)).first()) throw new Error("authorization_changed");
    budget.r2Deletes++;
    await bucket.delete(p.object_key);
    if (await bucket.head(p.object_key)) throw new Error("object_still_present");
    await changed(db, t, "UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id=? AND purge_inflight=1 AND purge_attempts=?", [p.id, claim.purge_attempts]);
    await db.$client.batch([
      db.$client.prepare(`DELETE FROM revision_proof WHERE proof_id=? AND ${exact}`).bind(p.id, ...args(t)),
      db.$client.prepare(`UPDATE proof_review SET proof_id=NULL WHERE proof_id=? AND ${exact}`).bind(p.id, ...args(t)),
      db.$client.prepare(`DELETE FROM proof_file WHERE id=? AND status='purged' AND purge_inflight=0 AND ${exact}`).bind(p.id, ...args(t)),
    ]);
    if (await db.$client.prepare("SELECT 1 FROM proof_file WHERE id=?").bind(p.id).first()) throw new Error("proof_metadata_remains");
  } finally {
    // Only this settled attempt releases its own fence. Crashed invocations remain exclusive.
    await db.$client.prepare(`UPDATE proof_file SET purge_inflight=0 WHERE id=? AND status='pending_purge' AND purge_inflight=1 AND purge_attempts=?
      AND EXISTS(SELECT 1 FROM maintenance_task m WHERE m.id=? AND m.status='claimed' AND m.target_type='proof_file' AND m.target_id=proof_file.id AND m.operation='purge' AND m.attempts=? AND m.claimed_at=?)`)
      .bind(p.id, claim.purge_attempts, ...args(t)).run();
  }
}
async function prepareParent(db: Db, t: MaintenanceTask) {
  // Keep historical clocks and receipt bodies fixed while breaking nullable live FKs.
  await guarded(db, t, "UPDATE engagement_log SET status=CASE WHEN published_at IS NOT NULL THEN 'expired' ELSE status END,current_revision_id=NULL WHERE id=?", [t.target_id]);
  await guarded(db, t, `UPDATE correction_request SET status='closed',closed_at=${clock} WHERE log_id=? AND status IN ('draft','submitted','ask_changes')`, [t.target_id]);
  await guarded(db, t, `UPDATE moderation_case SET status='closed',closed_at=${clock},closure_kind='erased',claimed_by=NULL,claimed_until=NULL WHERE log_id=? AND closed_at IS NULL`, [t.target_id]);
  await guarded(db, t, "UPDATE correction_request SET log_id=NULL WHERE log_id=? AND closed_at IS NOT NULL", [t.target_id]);
  await guarded(db, t, "UPDATE moderation_case SET log_id=NULL WHERE log_id=? AND closed_at IS NOT NULL", [t.target_id]);
}
async function runTask(db: Db, bucket: R2Bucket, t: MaintenanceTask, budget: Budget) {
  if (t.operation === "close_abandoned") {
    if (t.target_type === "moderation_case") await changed(db, t, `UPDATE moderation_case SET status='closed',closed_at=${clock},closure_kind='abandoned',claimed_by=NULL,claimed_until=NULL WHERE id=? AND closed_at IS NULL`, [t.target_id]);
    else if (t.target_type === "correction_request") await changed(db, t, `UPDATE correction_request SET status='abandoned',closed_at=${clock} WHERE id=? AND closed_at IS NULL`, [t.target_id]);
    else throw new Error("unsupported_operation");
  } else if (t.operation === "retire_policy") {
    if (t.target_type === "policy_acceptance") await changed(db, t, `UPDATE policy_acceptance SET retired_at=${clock} WHERE id=? AND retired_at IS NULL`, [t.target_id]);
    else if (t.target_type === "engagement") await changed(db, t, `UPDATE engagement SET purpose_ended_at=${clock} WHERE id=? AND purpose_ended_at IS NULL AND NOT EXISTS(SELECT 1 FROM engagement_log WHERE engagement_id=engagement.id)`, [t.target_id]);
    else throw new Error("unsupported_operation");
  } else if (t.operation === "redact_identity") {
    if (t.target_type === "user") {
      // Account deactivation precedes scrubbing, so every existing auth guard fails closed.
      const revoked = await db.$client.batch([
        db.$client.prepare(`UPDATE user SET deactivated_at=coalesce(deactivated_at,${clock}),updated_at=${clock} WHERE id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`DELETE FROM session WHERE user_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`DELETE FROM account WHERE user_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`DELETE FROM auth_verification WHERE EXISTS(SELECT 1 FROM user u WHERE u.id=? AND ${otpSubjectPredicate("auth_verification.identifier", "u.email")}) AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`UPDATE engagement SET status='cancelled' WHERE status='invited' AND (freelancer_id=? OR client_id IN (SELECT id FROM client_profile WHERE user_id=?)) AND ${exact}`).bind(t.target_id, t.target_id, ...args(t)),
      ]);
      if (revoked[0].meta.changes < 1) throw new Error("closure_authorization_changed");
      await guarded(db, t, `UPDATE privacy_request SET deactivated_at=(SELECT deactivated_at FROM user WHERE id=?) WHERE id=? AND status='executing'`, [t.target_id, t.privacy_request_id]);
      await guarded(db, t, "UPDATE audit_event SET actor_id=NULL WHERE actor_id=?", [t.target_id]);
      await changed(db, t, `UPDATE user SET name='Closed account',email=?||'@closed.invalid',email_verified=0,image=NULL,phone_number=NULL,phone_number_verified=0,ban_reason=NULL WHERE id=?`, [t.target_id, t.target_id]);
    } else if (t.target_type === "engagement_log") {
      await changed(db, t, "UPDATE engagement_log SET status='withdrawn',name_retention_until=NULL WHERE id=? AND status IN ('published','hidden')", [t.target_id]);
    } else if (t.target_type === "freelancer_profile") await changed(db, t, "UPDATE freelancer_profile SET display_name='Closed account',city=NULL WHERE user_id=?", [t.target_id]);
    else if (t.target_type === "client_profile") await changed(db, t, "UPDATE client_profile SET display_name='Closed account',city=NULL,registration_no=NULL WHERE id=?", [t.target_id]);
    else if (t.target_type === "verification_case") await changed(db, t, "UPDATE verification_case SET submitted_profile=NULL WHERE id=?", [t.target_id]);
    else if (t.target_type === "portfolio_link") await changed(db, t, "UPDATE portfolio_link SET url='https://closed.invalid',label=NULL WHERE id=?", [t.target_id]);
    else throw new Error("unsupported_operation");
  } else if (t.operation === "purge") {
    if (t.target_type === "proof_file") {
      await purgeProof(db, bucket, t, budget);
      await completeTask(db, t);
      return;
    }
    if (t.target_type === "export_delivery" && await purgeArtifact(db, bucket, t, budget)) return;
    if (t.target_type === "engagement_log") await prepareParent(db, t);
    if (t.target_type === "log_revision") {
      await db.$client.batch([
        db.$client.prepare(`DELETE FROM revision_proof WHERE revision_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`UPDATE review_round SET revision_id=NULL WHERE revision_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`UPDATE correction_request SET base_revision_id=NULL WHERE base_revision_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`UPDATE proof_file SET revision_id=NULL WHERE revision_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
        db.$client.prepare(`DELETE FROM log_tag WHERE revision_id=? AND ${exact}`).bind(t.target_id, ...args(t)),
      ]);
    }
    if (t.target_type === "correction_request") await guarded(db, t, "UPDATE moderation_case SET correction_request_id=NULL WHERE correction_request_id=? AND closed_at IS NOT NULL", [t.target_id]);
    if (t.target_type === "moderation_case") {
      // Case-linked audit and round receipts have their own exact tasks; wait
      // rather than cascading or truncating independent held history.
      const children = await db.$client.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM review_round WHERE case_id=?) OR EXISTS(SELECT 1 FROM audit_event WHERE moderation_case_id=?)").bind(t.target_id, t.target_id).first();
      if (children) throw new Error("retained_case_history");
    }
    if (t.target_type === "user") {
      // Do not invoke USER cascades; shell deletion waits for explicit child erasure.
      const children = await db.$client.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM session WHERE user_id=?) OR EXISTS(SELECT 1 FROM account WHERE user_id=?) OR EXISTS(SELECT 1 FROM policy_acceptance WHERE user_id=?) OR EXISTS(SELECT 1 FROM freelancer_profile WHERE user_id=?) OR EXISTS(SELECT 1 FROM client_profile WHERE user_id=?)`).bind(...Array(5).fill(t.target_id)).first();
      if (children) throw new Error("retained_dependencies");
      await guarded(db, t, "UPDATE privacy_request SET subject_user_id=NULL WHERE subject_user_id=? AND status IN ('completed','deferred','denied')", [t.target_id]);
    }
    if (!targetTypes.includes(t.target_type as typeof targetTypes[number])) throw new Error("unsupported_target");
    const key = t.target_type === "freelancer_profile" ? "user_id" : t.target_type === "engagement_consent" ? "engagement_id" : "id";
    await changed(db, t, `DELETE FROM ${t.target_type} WHERE ${key}=?`, [t.target_id]);
  } else throw new Error("unsupported_operation");
  await completeTask(db, t);
}

export async function runMaintenance(env: Pick<CloudflareEnv, "DB" | "PROOFS">, scheduledTime = Date.now(), requestedLimit = 25, requestedDeleteLimit = 25) {
  if (!Number.isFinite(scheduledTime)) throw new RangeError("Invalid schedule time");
  const db = createDb(env.DB), budget: Budget = { r2Deletes: 0, limit: Number.isFinite(requestedDeleteLimit) ? Math.max(1, Math.min(25, Math.trunc(requestedDeleteLimit))) : 25 };
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(25, Math.trunc(requestedLimit))) : 25;
  // Settled isolated compensation is already authorized; waiting 30 days would
  // strand an otherwise editable draft. Count attempted deletes in the same
  // hourly budget, including failed calls. Never retry an unresolved owner.
  const compensationBucket = new Proxy(env.PROOFS, { get(bucket, key) {
    if (key === "delete") return async (objectKey: string) => {
      if (budget.r2Deletes >= budget.limit) throw new Error("batch_limit");
      budget.r2Deletes++;
      return bucket.delete(objectKey);
    };
    const value = Reflect.get(bucket, key); return typeof value === "function" ? value.bind(bucket) : value;
  } });
  for (const p of await retryableCompensations(db, limit)) {
    if (budget.r2Deletes >= budget.limit) break;
    await purgeClaimedProof(db, compensationBucket, p.id);
  }
  await issueDueTasks(db, limit);
  // A prior invocation explicitly recorded settled failure. Recheck the exact
  // grant and no unresolved proof fence; elapsed time alone never permits this.
  await db.$client.prepare(`UPDATE maintenance_task SET status='planned',claimed_at=NULL WHERE id IN (
    SELECT e.id FROM pilot_maintenance_eligible e WHERE e.status='blocked' AND e.authorization_expires_at>${clock}
    AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE (p.purge_inflight=1 OR p.write_inflight=1) AND (e.target_type='proof_file' AND p.id=e.target_id OR e.target_type='engagement_log' AND p.log_id=e.target_id))
    ORDER BY e.attempts,e.due_at LIMIT ?)` ).bind(limit).run();
  const candidates = await db.$client.prepare(`SELECT id FROM pilot_maintenance_eligible e WHERE status='planned' AND authorization_expires_at>${clock}
    AND NOT EXISTS(SELECT 1 FROM export_delivery d WHERE e.target_type='export_delivery' AND d.id=e.target_id AND d.write_inflight=1)
    AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.purge_inflight=1 AND (e.target_type='proof_file' AND p.id=e.target_id OR e.target_type='engagement_log' AND p.log_id=e.target_id))
    AND (e.target_type!='proof_file' OR e.id IN(SELECT id FROM pilot_maintenance_eligible ranked WHERE status='planned' AND target_type='proof_file'
      AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.id=ranked.target_id AND (p.purge_inflight=1 OR p.write_inflight=1))
      AND authorization_expires_at>${clock} ORDER BY attempts,due_at,target_id,id LIMIT ?))
    ORDER BY attempts,due_at,target_id,id LIMIT ?`).bind(budget.limit - budget.r2Deletes, limit).all<{ id: string }>();
  const tasks: MaintenanceTask[] = [];
  for (const row of candidates.results) {
    try { const task = await claimMaintenanceTask(db, row.id); if (task) tasks.push(task); }
    catch {
      // A new hold/writer/authority race must not strand earlier successful
      // claims. A lost response after commit remains a visible unknown owner;
      // never adopt or complete it without the original returned claim tuple.
    }
  }
  let completed = 0, blocked = 0;
  // Parent pointer detachment needs its own exact claim before revision erasure.
  for (const task of tasks.filter(t => t.target_type === "engagement_log" && t.operation === "purge")) {
    try { await prepareParent(db, task); } catch { /* Execution below records the blocked outcome. */ }
  }
  const priority = (t: MaintenanceTask) => t.operation === "redact_identity" && t.target_type === "engagement_log" ? -1 : t.target_type === "proof_file" ? 0 : t.target_type === "log_revision" ? 1 : t.target_type === "engagement_log" ? 2 : t.target_type === "user" ? 9 : 3;
  tasks.sort((a, b) => priority(a) - priority(b));
  for (const t of tasks) {
    try {
      await runTask(db, env.PROOFS, t, budget);
      const done = await db.$client.prepare("SELECT status FROM maintenance_task WHERE id=?").bind(t.id).first<{ status: string }>();
      if (done?.status === "completed") completed++; else throw new Error("operation_not_completed");
    } catch {
      // Only settled failures become retryable. Never steal a claimed crashed owner.
      await db.$client.prepare("UPDATE maintenance_task SET status='blocked' WHERE id=? AND status='claimed' AND attempts=? AND claimed_at=?").bind(...args(t)).run();
      blocked++;
    }
  }
  const rest = await db.$client.prepare(`SELECT
    (SELECT count(*) FROM maintenance_task WHERE status IN ('planned','claimed','blocked')) +
    (SELECT count(*) FROM pilot_unheld_target x WHERE (x.purge_due_at<=${clock} OR x.close_due_at<=${clock})
      AND NOT EXISTS(SELECT 1 FROM maintenance_task t WHERE t.target_type=x.target_type AND t.target_id=x.target_id AND t.status IN ('planned','claimed','blocked'))) AS count`).first<{ count: number }>();
  return { claimed: tasks.length, completed, blocked, remaining: rest?.count ?? 0, r2Deletes: budget.r2Deletes };
}
