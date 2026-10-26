import type { Db } from "@/server/db";
import { POLICY_VERSIONS } from "@/lib/policies";

export const nowSql = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// Only fixed server-owned identifiers are interpolated into SQL; every value is bound.
export function actorPredicate(role: "freelancer" | "moderator", actorIdSql: "?" | "verification_case.freelancer_id" = "?") {
  const policies = role === "freelancer" ? ["privacy", "terms", "freelancer_ack"] as const : ["privacy", "terms"] as const;
  return {
    text: `EXISTS (SELECT 1 FROM user actor WHERE actor.id = ${actorIdSql} AND actor.role = '${role}' AND actor.banned = 0 ${policies.map(() => "AND EXISTS (SELECT 1 FROM policy_acceptance pa WHERE pa.user_id = actor.id AND pa.policy = ? AND pa.version = ?)").join(" ")})`,
    args: (actorId: string) => [...(actorIdSql === "?" ? [actorId] : []), ...policies.flatMap((p) => [p, POLICY_VERSIONS[p]])],
  };
}
export function statement(db: Db, text: string, args: (string | number | null)[] = []) {
  return db.$client.prepare(text).bind(...args);
}
export function eventGate() { return "EXISTS (SELECT 1 FROM audit_event WHERE id = ?)"; }
export const REVIEW_AUDIT_ACTIONS = ["verification_requested", "moderation_claimed", "moderation_reclaimed", "moderation_released", "verification_inspected", "verification_decided"] as const;
export function auditAfterChange(db: Db, eventId: string, actorId: string, action: (typeof REVIEW_AUDIT_ACTIONS)[number], type: "verification_case" | "moderation_case", subjectId: string) {
  return statement(db, `INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) SELECT ?,?,?,?,? WHERE changes() = 1`, [eventId, actorId, action, type, subjectId]);
}
export const moderatorPredicate = actorPredicate("moderator");
// Future kinds remain inactive: each later handler must add its own conflict rules.
export function reviewPredicate() {
  return `kind = 'verification' AND ${moderatorPredicate.text}
    AND EXISTS (SELECT 1 FROM verification_case vc JOIN freelancer_profile fp ON fp.user_id = vc.freelancer_id
      WHERE vc.id = moderation_case.subject_id AND vc.decided_at IS NULL AND vc.freelancer_id != ? AND fp.status IN ('pending','suspended'))`;
}
export function leasePredicate() {
  return `${reviewPredicate()} AND status = 'claimed' AND claimed_by = ? AND claimed_until = ? AND claimed_until > ${nowSql}`;
}
export function reviewArgs(actorId: string) { return [...moderatorPredicate.args(actorId), actorId]; }
