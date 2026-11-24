import Link from "next/link";
import { RegisterNavigation, type RegisterNavItem } from "./register-navigation";

export const profileLink: RegisterNavItem = { href: "/home", label: "Profile", icon: "profile" };

export const moderationNavigation: RegisterNavItem[] = [
  { href: "/moderation/verification", label: "Queue", icon: "queue", paths: ["/moderation"] },
  profileLink,
];

export const privacyNavigation: RegisterNavItem[] = [
  { href: "/admin/privacy", label: "Data requests", icon: "data" },
  profileLink,
];

export function PageShell({
  children, aside, navigation, mainClassName,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  navigation?: RegisterNavItem[];
  mainClassName?: string;
}) {
  return (
    <>
      <header className="register-header">
        <Link href="/" className="register-wordmark">The FLAG Register</Link>
        {aside}
      </header>
      <main className={mainClassName ? `register-main ${mainClassName}` : "register-main"}>{children}</main>
      <footer className="register-footer">
        <nav aria-label="Legal">
          <Link href="/legal/privacy" aria-label="Privacy notice">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/legal/terms">Terms</Link>
          <span aria-hidden="true">·</span>
          <span>FLAG is not legal advice</span>
        </nav>
      </footer>
      {navigation && <RegisterNavigation items={navigation} />}
    </>
  );
}
