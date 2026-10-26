import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { auditEvent, freelancerProfile, moderationCase, portfolioLink, user, verificationCase } from "@/server/db/schema";
import { isOnboarded, loadViewer } from "./viewer";
import { verificationQueueAge } from "@/features/moderation/queue-age";

async function isReviewer(db: Db, actorId: string | null) {
  if (!actorId) return false;
  const viewer = await loadViewer(db, actorId);
  return !!viewer && !viewer.banned && viewer.role === "moderator" && isOnboarded(viewer);
}
const reviewColumns = {
  request: verificationCase, review: moderationCase,
  profile: { userId: freelancerProfile.userId, displayName: freelancerProfile.displayName, city: freelancerProfile.city, status: freelancerProfile.status },
  ownerName: user.name,
  serverNow: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  claimActive: sql<number>`${moderationCase.status} = 'claimed' AND ${moderationCase.claimedUntil} IS NOT NULL AND ${moderationCase.claimedUntil} > strftime('%Y-%m-%dT%H:%M:%fZ','now')`.mapWith(Boolean),
};
function reviewQuery(db: Db) {
  return db.select(reviewColumns).from(moderationCase)
    .innerJoin(verificationCase, eq(moderationCase.subjectId, verificationCase.id))
    .innerJoin(freelancerProfile, eq(verificationCase.freelancerId, freelancerProfile.userId))
    .innerJoin(user, eq(user.id, freelancerProfile.userId));
}
export async function loadVerificationStatus(db: Db, actorId: string | null) {
  if (!actorId) return null;
  const viewer = await loadViewer(db, actorId);
  if (!viewer || viewer.banned || viewer.role !== "freelancer") return null;
  const profile = await db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, actorId) });
  const links = await db.select().from(portfolioLink).where(eq(portfolioLink.freelancerId, actorId));
  const [latest] = await reviewQuery(db).where(and(eq(moderationCase.kind, "verification"), eq(verificationCase.freelancerId, actorId)))
    .orderBy(desc(verificationCase.createdAt), desc(verificationCase.id)).limit(1);
  return { profile: profile ?? null, portfolioLinks: links, latest: latest ?? null };
}
export async function loadVerificationQueue(db: Db, actorId: string | null) {
  if (!await isReviewer(db, actorId)) return [];
  const rows = await reviewQuery(db).where(and(eq(moderationCase.kind, "verification"), isNull(verificationCase.decidedAt), ne(verificationCase.freelancerId, actorId!)))
    .orderBy(verificationCase.createdAt, verificationCase.id);
  return rows.map(row => ({ ...row, ...verificationQueueAge(row.request.createdAt, row.serverNow) }));
}
export async function loadVerificationReview(db: Db, actorId: string | null, caseId: string) {
  if (!await isReviewer(db, actorId)) return null;
  const [row] = await reviewQuery(db).where(and(eq(moderationCase.id, caseId), eq(moderationCase.kind, "verification"), ne(verificationCase.freelancerId, actorId!))).limit(1);
  if (!row) return null;
  const links = await db.select().from(portfolioLink).where(eq(portfolioLink.freelancerId, row.request.freelancerId));
  const history = await db.select().from(auditEvent).where(or(
    and(eq(auditEvent.subjectType, "verification_case"), eq(auditEvent.subjectId, row.request.id)),
    and(eq(auditEvent.subjectType, "moderation_case"), eq(auditEvent.subjectId, row.review.id)),
  )).orderBy(auditEvent.createdAt, auditEvent.id);
  return { ...row, portfolioLinks: links, history };
}
