import { env } from "cloudflare:workers";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import type { Role } from "@/server/db/schema";
import { seedEngagement, seedLog } from "./helpers";

// Foundation tests need current authority; keep seedLog policy-free for stale-policy tests.
export async function acceptCurrentPolicies(userId: string, role: Role) {
  await env.DB.batch(requiredPolicies(role).map(policy => env.DB.prepare(
    "INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)",
  ).bind(crypto.randomUUID(), userId, policy, POLICY_VERSIONS[policy])));
}

async function acknowledgeParties<T extends { freelancerId: string; clientUserId: string }>(fixture: T) {
  await acceptCurrentPolicies(fixture.freelancerId, "freelancer");
  await acceptCurrentPolicies(fixture.clientUserId, "client");
  return fixture;
}

export async function seedCurrentEngagement() {
  return acknowledgeParties(await seedEngagement());
}

export async function seedCurrentLog() {
  return acknowledgeParties(await seedLog());
}
