import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getViewer } from "@/server/auth/guards";
import { isOnboarded } from "@/server/db/queries/viewer";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";

export const metadata: Metadata = { title: "Before you continue" };

export default async function Onboarding() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (isOnboarded(viewer)) redirect("/home");
  return (
    <PageShell>
      <h1 className="font-serif text-2xl">Before you continue</h1>
      {viewer.role !== null && (
        <p className="mt-2 text-sm text-muted">The privacy notice or terms changed. Review and accept them again.</p>
      )}
      <OnboardingForm role={viewer.role} />
    </PageShell>
  );
}
