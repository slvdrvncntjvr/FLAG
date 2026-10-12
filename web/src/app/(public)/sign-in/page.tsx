import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getViewer } from "@/server/auth/guards";
import { SignInForm } from "@/features/onboarding/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn() {
  if (await getViewer()) redirect("/home");
  return (
    <PageShell>
      <h1 className="font-serif text-2xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted">New accounts are created on first sign-in.</p>
      <SignInForm />
    </PageShell>
  );
}
