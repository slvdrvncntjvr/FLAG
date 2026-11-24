import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { getViewer } from "@/server/auth/guards";
import { isOnboarded } from "@/server/db/queries/viewer";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { inviteAuthPath, inviteReturnPath } from "@/lib/invite-return";

export const metadata: Metadata = { title: "Before you continue" };

export default async function Onboarding({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = inviteReturnPath((await searchParams).returnTo);
  const viewer = await getViewer();
  if (!viewer) redirect(inviteAuthPath("sign-in", returnTo));
  if (isOnboarded(viewer)) redirect(returnTo);
  return (
    <PageShell mainClassName="register-narrow">
      <RegisterPageHeading title={viewer.role === null ? "Open your account" : "Before you continue"}>
        {viewer.role === null ? (
          <p>Choose a role. This cannot be changed later.</p>
        ) : (
          <p>The privacy notice or terms changed. Review and accept them again.</p>
        )}
      </RegisterPageHeading>
      <OnboardingForm role={viewer.role} returnTo={returnTo} />
    </PageShell>
  );
}
