import type { Db } from "@/server/db";
import { POLICY_VERSIONS } from "@/lib/policies";
import { engagementActor, inviteNow, liveInvite } from "@/server/db/queries/engagements";
import { acceptInput, createInput, failed, hashInvite, idInput, INVITE_DAY_LIMIT, INVITE_TTL_DAYS, INVITE_WEEK_LIMIT, newInviteToken, tokenInput, type EngagementResult } from "./schema";

export async function createInvitation(db: Db, actorId: string | null, input: unknown): Promise<EngagementResult<{ invitePath: string }>> {
  if (!actorId) return failed("Sign in to continue.");
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return failed("Check the title, client name and start date. Do not include ID details.");
  const token = newInviteToken(), hash = await hashInvite(token), actor = engagementActor("freelancer", actorId);
  try {
    const result = await db.$client.prepare(`INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at)
      SELECT ?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now',?) WHERE ${actor.text}
      AND EXISTS(SELECT 1 FROM freelancer_profile WHERE user_id=? AND status='verified')
      AND (SELECT count(*) FROM engagement WHERE freelancer_id=? AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')) < ?
      AND (SELECT count(*) FROM engagement WHERE freelancer_id=? AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')) < ?`)
      .bind(crypto.randomUUID(), actorId, parsed.data.title, parsed.data.clientNameHint, parsed.data.startedOn, hash, `+${INVITE_TTL_DAYS} days`,
        ...actor.args, actorId, actorId, INVITE_DAY_LIMIT, actorId, INVITE_WEEK_LIMIT).run();
    return result.meta.changes === 1 ? { ok: true, invitePath: `/invite/${token}` }
      : failed("Only verified freelancers with current acknowledgments can invite. The limit is 10 per day and 30 per week.");
  } catch { return failed("Could not create the invitation. Try again."); }
}

export async function acceptInvitation(db: Db, actorId: string | null, hash: string, input: unknown): Promise<EngagementResult> {
  if (!actorId) return failed("Sign in to continue.");
  const parsed = acceptInput.safeParse(input);
  if (!parsed.success || !tokenInput.safeParse(hash).success) return failed("Confirm consent and profile association, and check the profile fields.");
  const f = parsed.data, gate = liveInvite(hash, actorId), acceptanceId = crypto.randomUUID();
  const eligible = `EXISTS(SELECT 1 FROM engagement WHERE ${gate.text})`;
  try {
    const results = await db.$client.batch([
      // All predicates are rechecked inside the batch. A losing client creates no profile.
      db.$client.prepare(`INSERT INTO client_profile(id,user_id,display_name,kind,city,registration_no)
        SELECT ?,?,?,?,?,? WHERE ${eligible} AND ? IS NOT NULL AND ? IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM client_profile WHERE user_id=?)`)
        .bind(crypto.randomUUID(), actorId, f.displayName ?? null, f.kind ?? null, f.city ?? null, f.registrationNo ?? null,
          ...gate.args, f.displayName ?? null, f.kind ?? null, actorId),
      db.$client.prepare(`INSERT INTO policy_acceptance(id,user_id,policy,version)
        SELECT ?,?,'client_consent',? WHERE ${eligible} AND EXISTS(SELECT 1 FROM client_profile WHERE user_id=?)`)
        .bind(acceptanceId, actorId, POLICY_VERSIONS.client_consent, ...gate.args, actorId),
      // Always attempt the receipt for a known hash. If time advances beyond
      // expiry between statements, a skipped policy insert must ABORT rather
      // than commit the earlier profile insert. Validation rejects missing,
      // stale, replayed or expired consent and rolls the entire batch back.
      db.$client.prepare(`INSERT INTO engagement_consent(engagement_id,policy_acceptance_id)
        SELECT id,(SELECT id FROM policy_acceptance WHERE id=? AND user_id=? AND policy='client_consent' AND version=?)
        FROM engagement WHERE invite_token_hash=?`)
        .bind(acceptanceId, actorId, POLICY_VERSIONS.client_consent, hash),
    ]);
    return results[2].meta.changes >= 1 ? { ok: true } : failed();
  } catch { return failed("Could not accept this invitation. Reload and try again."); }
}

export async function declineInvitation(db: Db, actorId: string | null, hash: string): Promise<EngagementResult> {
  if (!actorId || !tokenInput.safeParse(hash).success) return failed();
  const gate = liveInvite(hash, actorId);
  try {
    const result = await db.$client.prepare(`UPDATE engagement SET status='declined',declined_at=${inviteNow} WHERE ${gate.text}`).bind(...gate.args).run();
    if (result.meta.changes === 1) return { ok: true };
    return failed();
  } catch { return failed(); }
}

export async function cancelInvitation(db: Db, actorId: string | null, id: unknown): Promise<EngagementResult> {
  if (!actorId || !idInput.safeParse(id).success) return failed();
  const actor = engagementActor("freelancer", actorId);
  try {
    const result = await db.$client.prepare(`UPDATE engagement SET status='cancelled' WHERE id=? AND freelancer_id=?
      AND status='invited' AND invite_expires_at>${inviteNow} AND ${actor.text}`).bind(id as string, actorId, ...actor.args).run();
    return result.meta.changes === 1 ? { ok: true } : failed();
  } catch { return failed(); }
}
