import type { Policy, Role } from "@/server/db/schema";

// Bump a version to make every user accept that policy again (PRD-F8, QAD S-12).
export const POLICY_VERSIONS = {
  privacy: "2026-10-12",
  terms: "2026-10-12",
  freelancer_ack: "2026-10-12",
  client_consent: "2026-10-12",
} as const satisfies Record<Policy, string>;

// client_consent is recorded per engagement at invite acceptance (PRD-F9), not at onboarding.
export function requiredPolicies(role: Role | null): Policy[] {
  return role === "freelancer" ? ["privacy", "terms", "freelancer_ack"] : ["privacy", "terms"];
}

export type Acceptance = { policy: Policy; version: string };

export function missingPolicies(role: Role | null, accepted: Acceptance[]): Policy[] {
  return requiredPolicies(role).filter(
    (p) => !accepted.some((a) => a.policy === p && a.version === POLICY_VERSIONS[p]),
  );
}

// The three statements every freelancer confirms (PRD-F8).
export const FREELANCER_STATEMENTS = [
  "Every log I file needs proof. A log without proof is not accepted.",
  "FLAG is not legal advice and does not resolve disputes or collect payment.",
  "A false or misleading log is removed, and my account can be suspended.",
] as const;
