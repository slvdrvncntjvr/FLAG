import type { Policy, Role } from "@/server/db/schema";

export const CONTACT_EMAIL = "slvdrvncntjvr@gmail.com";

export const POLICY_VERSIONS = {
  privacy: "2026-11-02",
  terms: "2026-11-02",
  freelancer_ack: "2026-10-12",
  client_consent: "2026-10-12",
} as const satisfies Record<Policy, string>;

export function requiredPolicies(role: Role | null): Policy[] {
  return role === "freelancer" ? ["privacy", "terms", "freelancer_ack"] : ["privacy", "terms"];
}

export type Acceptance = { policy: Policy; version: string };

export function missingPolicies(role: Role | null, accepted: Acceptance[]): Policy[] {
  return requiredPolicies(role).filter(
    (p) => !accepted.some((a) => a.policy === p && a.version === POLICY_VERSIONS[p]),
  );
}

export const FREELANCER_STATEMENTS = [
  "Every log I file needs proof. A log without proof is not accepted.",
  "FLAG is not legal advice and does not resolve disputes or collect payment.",
  "A false or misleading log is removed, and my account can be suspended.",
] as const;
