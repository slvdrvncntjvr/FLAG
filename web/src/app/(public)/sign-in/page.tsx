import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { RegisterIcon } from "@/components/register-icon";
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
    <PageShell mainClassName="register-access-page">
      <section className="register-access mx-auto" aria-labelledby="sign-in-title">
        <div className="register-access-intro">
          <p className="register-kicker"><RegisterIcon name="lock" /> Private register</p>
          <h1 id="sign-in-title">{returnTo === INVITE_RETURN_PATH ? "Sign in to respond" : "Sign in to the register"}</h1>
        </div>
        <div className="register-access-form">
          <p className="text-sm leading-relaxed text-muted">We’ll email you a six-digit code. If it’s your first time here, signing in creates your account.</p>
          <SignInForm returnTo={returnTo} />
        </div>
      </section>
    </PageShell>
  );
}
