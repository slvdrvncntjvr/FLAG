import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { freelancerProfile, policyAcceptance, user, type FreelancerStatus, type Policy, type Role } from "@/server/db/schema";
import { missingPolicies, POLICY_VERSIONS } from "@/lib/policies";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  banned: boolean;
  missingPolicies: Policy[];
  freelancerStatus: FreelancerStatus | null;
};

export async function loadViewer(db: Db, userId: string): Promise<Viewer | null> {
  const row = await db.query.user.findFirst({
    columns: { id: true, name: true, email: true, role: true, banned: true },
    where: eq(user.id, userId),
  });
  if (!row) return null;
  const accepted = await db
    .select({ policy: policyAcceptance.policy, version: policyAcceptance.version })
    .from(policyAcceptance)
    .where(eq(policyAcceptance.userId, userId));
  const profile = await db.query.freelancerProfile.findFirst({ columns: { status: true }, where: eq(freelancerProfile.userId, userId) });
  return { ...row, freelancerStatus: profile?.status ?? null, missingPolicies: missingPolicies(row.role, accepted) };
}

export function isOnboarded(viewer: Viewer) {
  return viewer.role !== null && viewer.missingPolicies.length === 0;
}

// D1 batches are transactional. A failed policy insert rolls back the role change.
// Conditional inserts also make concurrent duplicate submissions idempotent.
export async function commitOnboarding(db: Db, userId: string, role: Role, policies: Policy[]) {
  const choose = db.update(user).set({ role, updatedAt: new Date().toISOString() })
    .where(and(eq(user.id, userId), isNull(user.role), eq(user.banned, false)));
  const acceptances = policies.map((policy) => db.insert(policyAcceptance).select(
    db.select({
      id: sql<string>`${crypto.randomUUID()}`.as("id"),
      userId: user.id,
      policy: sql<Policy>`${policy}`.as("policy"),
      version: sql<string>`${POLICY_VERSIONS[policy]}`.as("version"),
      acceptedAt: sql<string>`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`.as("accepted_at"),
    }).from(user).where(and(
      eq(user.id, userId), eq(user.banned, false), eq(user.role, role),
      notExists(db.select({ id: policyAcceptance.id }).from(policyAcceptance).where(and(
        eq(policyAcceptance.userId, userId), eq(policyAcceptance.policy, policy),
        eq(policyAcceptance.version, POLICY_VERSIONS[policy]),
      ))),
    )),
  ));
  await db.batch([choose, ...acceptances]);
}
