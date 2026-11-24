import Link from "next/link";
import { notFound } from "next/navigation";
import { moderationNavigation, PageShell } from "@/components/page-shell";
import { viewerOrRedirect } from "@/server/auth/guards";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

export default async function ModerationLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "moderator") notFound();
  return <PageShell navigation={moderationNavigation} aside={<div className="flex min-w-0 flex-wrap items-center gap-3 text-xs"><Link href="/home" className="text-accent underline underline-offset-2">Account home</Link><SignOutButton /></div>}>
    <nav aria-label="Moderation queues" className="register-ledger mb-6 flex flex-wrap gap-x-5 gap-y-2 py-3 text-sm font-semibold text-accent"><Link href="/moderation/verification" className="underline underline-offset-4">Verification queue</Link><Link href="/moderation/logs" className="underline underline-offset-4">Logs and updates</Link><Link href="/moderation/corrections" className="underline underline-offset-4">Private corrections</Link></nav>
    {children}
  </PageShell>;
}
