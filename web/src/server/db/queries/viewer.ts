import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db";
import { policyAcceptance, user, type Policy, type Role } from "@/server/db/schema";
import { missingPolicies, POLICY_VERSIONS } from "@/lib/policies";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  banned: boolean;
  missingPolicies: Policy[];
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
  return { ...row, missingPolicies: missingPolicies(row.role, accepted) };
}

export function isOnboarded(viewer: Viewer) {
  return viewer.role !== null && viewer.missingPolicies.length === 0;
}

// Role is chosen once, only as freelancer or client, and only while still null (AB-12).
export async function chooseRole(db: Db, userId: string, role: "freelancer" | "client") {
  const updated = await db
    .update(user)
    .set({ role, updatedAt: new Date().toISOString() })
    .where(and(eq(user.id, userId), isNull(user.role)))
    .returning({ id: user.id });
  return updated.length === 1;
}

export async function recordAcceptances(db: Db, userId: string, policies: Policy[]) {
  if (policies.length === 0) return;
  await db.insert(policyAcceptance).values(
    policies.map((policy) => ({
      id: crypto.randomUUID(),
      userId,
      policy,
      version: POLICY_VERSIONS[policy],
    })),
  );
}
