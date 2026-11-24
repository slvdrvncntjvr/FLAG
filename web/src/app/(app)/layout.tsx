import Link from "next/link";
import { moderationNavigation, PageShell, privacyNavigation, profileLink } from "@/components/page-shell";
import type { RegisterNavItem } from "@/components/register-navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { SignOutButton } from "@/features/onboarding/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerOrRedirect();
  const navigation: RegisterNavItem[] = viewer.role === "moderator" ? moderationNavigation
    : viewer.role === "admin" ? privacyNavigation
    : viewer.role === "client" ? [
      { href: "/engagements", label: "Engagements", icon: "engagements", paths: ["/engagements", "/logs"] },
      { href: "/clients", label: "My record", icon: "record" },
      profileLink,
    ] : [
      { href: "/clients", label: "Search", icon: "search" },
      { href: "/engagements", label: "Engagements", icon: "engagements", paths: ["/engagements", "/logs"] },
      { ...profileLink, paths: ["/home", "/verification"] },
    ];
  return (
    <PageShell
      navigation={navigation}
      aside={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Link href="/home" className="min-w-0 break-all text-muted underline-offset-4 hover:underline">
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
