import { and, desc, eq, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { clientProfile, engagement, engagementConsent, freelancerProfile, policyAcceptance } from "@/server/db/schema";
import { POLICY_VERSIONS } from "@/lib/policies";
import { isOnboarded, loadViewer } from "./viewer";
import { tokenInput } from "@/features/engagements/schema";

export const inviteNow = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// Values are always bound. Only fixed server identifiers appear in SQL text.
export function engagementActor(role: "freelancer" | "client", actorId: string) {
  const policies = role === "freelancer" ? ["privacy", "terms", "freelancer_ack"] as const : ["privacy", "terms"] as const;
  return {
    text: `EXISTS (SELECT 1 FROM user actor WHERE actor.id=? AND actor.role='${role}' AND actor.banned=0
      ${policies.map(() => "AND EXISTS (SELECT 1 FROM policy_acceptance p WHERE p.user_id=actor.id AND p.policy=? AND p.version=?)").join(" ")})`,
    args: [actorId, ...policies.flatMap(p => [p, POLICY_VERSIONS[p]])],
  };
}
export function liveInvite(hash: string, actorId: string) {
  const actor = engagementActor("client", actorId);
  return {
    text: `invite_token_hash=? AND status='invited' AND invite_expires_at>${inviteNow}
      AND freelancer_id!=? AND client_id IS NULL AND accepted_at IS NULL AND declined_at IS NULL AND ${actor.text}`,
    args: [hash, actorId, ...actor.args],
  };
}

// Public capability read: this deliberately selects only the two disclosed facts.
export async function loadInviteLanding(db: Db, hash: string) {
  if (!tokenInput.safeParse(hash).success) return null;
  const [row] = await db.select({ inviter: freelancerProfile.displayName, title: engagement.title,
    expiresAt: engagement.inviteExpiresAt, status: engagement.status,
    expired: sql<number>`${engagement.inviteExpiresAt} <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`.mapWith(Boolean),
  }).from(engagement).innerJoin(freelancerProfile, eq(engagement.freelancerId, freelancerProfile.userId))
    .where(eq(engagement.inviteTokenHash, hash)).limit(1);
  if (!row || row.status !== "invited") return null;
  return row.expired ? { expired: true as const } : { expired: false as const, inviter: row.inviter, title: row.title, expiresAt: row.expiresAt };
}

export async function loadInviteForClient(db: Db, actorId: string, hash: string) {
  if (!tokenInput.safeParse(hash).success) return null;
  const viewer = await loadViewer(db, actorId);
  if (!viewer || viewer.banned || viewer.role !== "client" || !isOnboarded(viewer)) return null;
  const [invite] = await db.select({ title: engagement.title, inviter: freelancerProfile.displayName })
    .from(engagement).innerJoin(freelancerProfile, eq(freelancerProfile.userId, engagement.freelancerId))
    .where(and(eq(engagement.inviteTokenHash, hash), eq(engagement.status, "invited"),
      sql`${engagement.inviteExpiresAt}>strftime('%Y-%m-%dT%H:%M:%fZ','now')`, sql`${engagement.freelancerId}!=${actorId}`)).limit(1);
  if (!invite) return null;
  const profile = await db.query.clientProfile.findFirst({ where: eq(clientProfile.userId, actorId) });
  return { ...invite, profile: profile ?? null };
}

export async function loadOwnEngagements(db: Db, actorId: string | null) {
  if (!actorId) return [];
  const viewer = await loadViewer(db, actorId);
  if (!viewer || viewer.banned || !isOnboarded(viewer) || !["freelancer", "client"].includes(viewer.role ?? "")) return [];
  return db.select({ id: engagement.id, title: engagement.title, startedOn: engagement.startedOn,
    status: sql<string>`CASE WHEN ${engagement.status}='invited' AND ${engagement.inviteExpiresAt}<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE ${engagement.status} END`,
    // A missing legacy receipt is explicitly unknown; never inferred from status.
    consentVersion: policyAcceptance.version, consentAt: policyAcceptance.acceptedAt,
  }).from(engagement).leftJoin(clientProfile, eq(engagement.clientId, clientProfile.id))
    .leftJoin(engagementConsent, eq(engagementConsent.engagementId, engagement.id))
    .leftJoin(policyAcceptance, eq(policyAcceptance.id, engagementConsent.policyAcceptanceId))
    .where(or(eq(engagement.freelancerId, actorId), eq(clientProfile.userId, actorId)))
    .orderBy(desc(engagement.createdAt), engagement.id).limit(100);
}
