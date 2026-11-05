import { isOnboarded, type Viewer } from "@/server/db/queries/viewer";

export class AccessError extends Error {
  constructor(public readonly code: "unauthenticated" | "onboarding_required" | "forbidden") {
    super(code);
  }
}

// INV-8: live profile status and current policies, loaded by requireVerifiedFreelancer.
// Feature writes must repeat these predicates inside their atomic boundary.
export function assertVerifiedFreelancer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new AccessError("unauthenticated");
  if (viewer.banned) throw new AccessError("forbidden");
  if (!isOnboarded(viewer)) throw new AccessError("onboarding_required");
  if (viewer.role !== "freelancer" || viewer.freelancerStatus !== "verified") throw new AccessError("forbidden");
}
