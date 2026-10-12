import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { viewerOrRedirect } from "@/server/auth/guards";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

// INV-7: every page in this group needs a signed-in, onboarded viewer.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  return (
    <PageShell
      aside={
        <div className="flex items-center gap-4 text-sm">
          <Link href="/home" className="font-mono text-muted">
            {viewer.email}
          </Link>
          <SignOutButton />
        </div>
      }
    >
      {children}
    </PageShell>
  );
}
