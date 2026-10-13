import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { isOnboarded, loadViewer, type Viewer } from "@/server/db/queries/viewer";
import { getAuth } from ".";
import { AccessError, assertVerifiedFreelancer } from "./guards-core";

export { AccessError };

// Returns null for signed-out visitors and suspended accounts.
export async function getViewer(): Promise<Viewer | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const viewer = await loadViewer(await getDb(), session.user.id);
  return viewer && !viewer.banned ? viewer : null;
}

// For server actions: throws instead of redirecting.
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AccessError("unauthenticated");
  return viewer;
}

export async function requireOnboardedViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!isOnboarded(viewer)) throw new AccessError("onboarding_required");
  return viewer;
}

// First statement of createEngagement, submitLog, and submitFilerUpdate (BUILD §5, INV-8).
export async function requireVerifiedFreelancer(): Promise<Viewer> {
  const viewer = await getViewer();
  assertVerifiedFreelancer(viewer);
  return viewer;
}

// For layouts and pages (INV-7, AB-13).
export async function viewerOrRedirect(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (!isOnboarded(viewer)) redirect("/onboarding");
  return viewer;
}
