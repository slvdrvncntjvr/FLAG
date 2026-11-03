import type { Db } from "@/server/db";
import { actorPredicate, auditAfterChange, eventGate, nowSql, statement } from "@/server/db/queries/moderation";
import { failure, verificationInput, type ReviewResult } from "./schema";

export async function submitVerification(db: Db, actorId: string | null, input: unknown): Promise<ReviewResult<{ verificationCaseId: string; moderationCaseId: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = verificationInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const form = parsed.data;
  const verificationCaseId = crypto.randomUUID(), moderationCaseId = crypto.randomUUID(), eventId = crypto.randomUUID();
  const actor = actorPredicate("freelancer");
  // Keep the unique-event winner gate and editable portfolio ordering. Only
  // this atomic batch defers FK validation until its exact case exists at
  // commit; an unresolved FK or any failed write rolls the whole batch back.
  try {
    const results = await db.$client.batch([
      statement(db, "PRAGMA defer_foreign_keys = ON"),
      statement(db, `UPDATE user SET name = ?, updated_at = ${nowSql} WHERE id = ? AND ${actor.text}
        AND NOT EXISTS (SELECT 1 FROM freelancer_profile WHERE user_id = ? AND status IN ('pending','verified','suspended'))
        AND NOT EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = ? AND decided_at IS NULL)`,
      [form.name, actorId, ...actor.args(actorId), actorId, actorId]),
      auditAfterChange(db, eventId, actorId, "verification_requested", "verification_case", verificationCaseId, moderationCaseId),
      statement(db, `INSERT INTO freelancer_profile(user_id,display_name,city,status) SELECT ?,?,?,'pending' WHERE ${eventGate()}
        ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, city = excluded.city, status = 'pending', verified_at = NULL`,
      [actorId, form.name, form.city ?? null, eventId]),
      statement(db, `DELETE FROM portfolio_link WHERE freelancer_id = ? AND ${eventGate()}`, [actorId, eventId]),
      ...form.portfolioLinks.map((link) => statement(db, `INSERT INTO portfolio_link(id,freelancer_id,url,label) SELECT ?,?,?,? WHERE ${eventGate()}`, [crypto.randomUUID(), actorId, link.url, link.label ?? null, eventId])),
      statement(db, `INSERT INTO verification_case(id,freelancer_id,submitted_profile) SELECT ?,?,? WHERE ${eventGate()}`, [verificationCaseId, actorId, JSON.stringify(form), eventId]),
      statement(db, `INSERT INTO moderation_case(id,kind,subject_id,verification_subject_user_id) SELECT ?,'verification',?,? WHERE ${eventGate()}`, [moderationCaseId, verificationCaseId, actorId, eventId]),
    ]);
    return results[1].meta.changes === 1 ? { ok: true, verificationCaseId, moderationCaseId } : failure("conflict");
  } catch { return failure("unavailable"); }
}
