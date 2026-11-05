import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getViewer } from "@/server/auth/guards";
import { SignInForm } from "@/features/onboarding/sign-in-form";
import { INVITE_RETURN_PATH, inviteAuthPath, inviteReturnPath } from "@/lib/invite-return";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = inviteReturnPath((await searchParams).returnTo);
  if (await getViewer()) redirect(returnTo === INVITE_RETURN_PATH ? inviteAuthPath("onboarding", returnTo) : "/home");
  return (
    <PageShell>
      <h1 className="font-serif text-2xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted">New accounts are created on first sign-in.</p>
      <SignInForm returnTo={returnTo} />
    </PageShell>
  );
}
