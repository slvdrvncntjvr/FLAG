import { isOnboarded, type Viewer } from "@/server/db/queries/viewer";

export class AccessError extends Error {
  constructor(public readonly code: "unauthenticated" | "onboarding_required" | "forbidden") {
    super(code);
  }
}

// INV-8: a freelancer must be onboarded and verified. Verification status (PRD-F1) arrives with
// FREELANCER_PROFILE in Week 3-4; until then nobody passes, so nothing can be filed.
export function assertVerifiedFreelancer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new AccessError("unauthenticated");
  if (!isOnboarded(viewer)) throw new AccessError("onboarding_required");
  if (viewer.role !== "freelancer") throw new AccessError("forbidden");
  throw new AccessError("forbidden");
}
