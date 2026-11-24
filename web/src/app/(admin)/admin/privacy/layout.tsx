import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { PageShell, privacyNavigation } from "@/components/page-shell";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

export const metadata = { title: "Privacy processing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PrivacyLayout({ children }: { children: React.ReactNode }) {
  if ((await viewerOrRedirect()).role !== "admin") notFound();
  return <PageShell navigation={privacyNavigation} aside={<div className="register-account-summary"><SignOutButton /></div>}>{children}</PageShell>;
}
