import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { viewerOrRedirect } from "@/server/auth/guards";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

export default async function ModerationLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "moderator") notFound();
  return <PageShell aside={<div className="flex min-w-0 flex-wrap items-center justify-end gap-3 pl-4"><Link href="/home" className="text-sm underline">Account home</Link><SignOutButton /></div>}>
    <nav className="mb-6 text-sm"><Link href="/moderation/verification" className="underline">Verification queue</Link></nav>
    {children}
  </PageShell>;
}
