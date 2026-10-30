import type { Db } from "@/server/db";
import { actorPredicate, auditAfterChange, eventGate, leasePredicate, nowSql, reviewArgs, reviewPredicate, statement } from "@/server/db/queries/moderation";
import { failure, type ReviewResult } from "@/features/verification/schema";
import { claimInput, decisionInput, inspectionInput, leaseInput } from "./schema";

export async function claimVerification(db: Db, actorId: string | null, input: unknown): Promise<ReviewResult<{ claimUntil: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = claimInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const { caseId } = parsed.data, eventId = crypto.randomUUID();
  try {
    const result = await db.$client.batch([
      statement(db, `UPDATE moderation_case SET status = 'claimed', claimed_by = ?, claimed_until = strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes') WHERE id = ? AND status = 'open' AND ${reviewPredicate()}`, [actorId, caseId, ...reviewArgs(actorId)]),
      auditAfterChange(db, eventId, actorId, "moderation_claimed", "moderation_case", caseId),
      statement(db, `UPDATE moderation_case SET claimed_by = ?, claimed_until = strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes') WHERE id = ? AND status = 'claimed' AND claimed_until <= ${nowSql} AND ${reviewPredicate()}`, [actorId, caseId, ...reviewArgs(actorId)]),
      auditAfterChange(db, eventId, actorId, "moderation_reclaimed", "moderation_case", caseId),
      statement(db, `SELECT claimed_until FROM moderation_case WHERE id = ? AND ${eventGate()}`, [caseId, eventId]),
    ]);
    const row = result[4].results[0] as { claimed_until: string } | undefined;
    return row ? { ok: true, claimUntil: row.claimed_until } : failure("conflict");
  } catch { return failure("unavailable"); }
}

export async function releaseVerification(db: Db, actorId: string | null, input: unknown): Promise<ReviewResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = leaseInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const { caseId, expectedClaimUntil } = parsed.data;
  try {
    const result = await db.$client.batch([
      statement(db, `UPDATE moderation_case SET status = 'open', claimed_by = NULL, claimed_until = NULL WHERE id = ? AND ${leasePredicate()}`, [caseId, ...reviewArgs(actorId), actorId, expectedClaimUntil]),
      auditAfterChange(db, crypto.randomUUID(), actorId, "moderation_released", "moderation_case", caseId),
    ]);
    return result[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("unavailable"); }
}

export async function inspectVerification(db: Db, actorId: string | null, input: unknown): Promise<ReviewResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = inspectionInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const { caseId, expectedClaimUntil, idKind, result, nameMatch } = parsed.data;
  try {
    const rows = await db.$client.batch([
      statement(db, `UPDATE verification_case SET reviewer_id = ?, id_kind = ?, result = ?, name_match = ?, inspected_at = ${nowSql}
        WHERE decided_at IS NULL AND id IN (SELECT subject_id FROM moderation_case WHERE id = ? AND ${leasePredicate()})`,
      [actorId, idKind, result, nameMatch ? 1 : 0, caseId, ...reviewArgs(actorId), actorId, expectedClaimUntil]),
      statement(db, `INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) SELECT ?,?,'verification_inspected','verification_case',subject_id FROM moderation_case WHERE id = ? AND changes() = 1`, [crypto.randomUUID(), actorId, caseId]),
    ]);
    return rows[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("unavailable"); }
}

export async function decideVerification(db: Db, actorId: string | null, input: unknown): Promise<ReviewResult> {
  if (!actorId) return failure("unauthenticated");
  const parsed = decisionInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const { caseId, expectedClaimUntil, decision, reason } = parsed.data, eventId = crypto.randomUUID();
  const subject = actorPredicate("freelancer", "verification_case.freelancer_id");
  try {
    const result = await db.$client.batch([
      statement(db, `UPDATE verification_case SET decision = ?, reason = ?, decided_at = ${nowSql}
        WHERE decided_at IS NULL AND (reviewer_id IS NULL OR reviewer_id = ?)
        AND id IN (SELECT subject_id FROM moderation_case WHERE id = ? AND ${leasePredicate()})
        AND (? = 'reject' OR (result = 'pass' AND name_match = 1 AND reviewer_id = ?
          AND EXISTS (SELECT 1 FROM freelancer_profile fp JOIN user owner ON owner.id = fp.user_id
            WHERE fp.user_id = verification_case.freelancer_id AND fp.status = 'pending' AND length(trim(owner.name)) > 0 AND owner.name = fp.display_name
            AND EXISTS (SELECT 1 FROM portfolio_link pl WHERE pl.freelancer_id = fp.user_id))
          AND ${subject.text}))`,
      [decision, reason, actorId, caseId, ...reviewArgs(actorId), actorId, expectedClaimUntil, decision, actorId, ...subject.args(actorId)]),
      statement(db, `INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,created_at)
        SELECT ?,?,'verification_decided','verification_case',vc.id,vc.decided_at FROM verification_case vc JOIN moderation_case mc ON mc.subject_id = vc.id AND mc.kind = 'verification'
        WHERE mc.id = ? AND changes() = 1`, [eventId, actorId, caseId]),
      statement(db, `UPDATE moderation_case SET status = 'decided', claimed_by = NULL, claimed_until = NULL,
        decision = ?, reason = ?, decided_by = ?, decided_at = (SELECT created_at FROM audit_event WHERE id = ?)
        WHERE id = ? AND ${eventGate()}`, [decision, reason, actorId, eventId, caseId, eventId]),
      statement(db, `UPDATE freelancer_profile SET status = CASE WHEN status = 'suspended' THEN 'suspended' ELSE ? END, verified_at = CASE WHEN ? = 'approve' THEN (SELECT created_at FROM audit_event WHERE id = ?) ELSE NULL END
        WHERE user_id = (SELECT vc.freelancer_id FROM verification_case vc JOIN moderation_case mc ON mc.subject_id = vc.id AND mc.kind = 'verification' WHERE mc.id = ?) AND ${eventGate()}`,
      [decision === "approve" ? "verified" : "rejected", decision, eventId, caseId, eventId]),
    ]);
    return result[0].meta.changes === 1 ? { ok: true } : failure("conflict");
  } catch { return failure("unavailable"); }
}
