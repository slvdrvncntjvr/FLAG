import { notFound } from "next/navigation";
import { moderationNavigation, PageShell } from "@/components/page-shell";
import { viewerOrRedirect } from "@/server/auth/guards";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

export default async function ModerationLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "moderator") notFound();
  return <PageShell navigation={moderationNavigation} aside={<div className="register-account-summary"><SignOutButton /></div>}>{children}</PageShell>;
}
