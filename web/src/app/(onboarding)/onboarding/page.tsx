import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getViewer } from "@/server/auth/guards";
import { isOnboarded } from "@/server/db/queries/viewer";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { inviteAuthPath, inviteReturnPath } from "@/lib/invite-return";
import styles from "./illustration.module.css";

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
      <h1 className="text-center font-serif text-[1.375rem] leading-tight">
        {viewer.role === null ? "Open your account" : "Before you continue"}
      </h1>
      {viewer.role === null ? (
        <>
          <p className="mt-2 text-center text-sm">Choose a role. This cannot be changed later.</p>
          <div className={`${styles.illustration} mt-4`} aria-hidden="true" />
        </>
      ) : (
        <p className="mt-2 text-center text-sm text-muted">The privacy notice or terms changed. Review and accept them again.</p>
      )}
      <OnboardingForm role={viewer.role} returnTo={returnTo} />
    </PageShell>
  );
}
