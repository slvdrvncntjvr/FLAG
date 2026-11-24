import Link from "next/link";
import { useId } from "react";
import { RegisterNavigation, type RegisterNavItem } from "./register-navigation";

export const profileLink: RegisterNavItem = { href: "/home", label: "Profile", icon: "profile" };

export const moderationNavigation: RegisterNavItem[] = [
  { href: "/moderation/verification", label: "Verification", icon: "shield" },
  { href: "/moderation/logs", label: "Logs", icon: "queue" },
  { href: "/moderation/corrections", label: "Corrections", icon: "correction" },
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
  const contentId = useId();
  return (
    <div className={navigation ? "register-shell register-shell--workspace" : "register-shell"}>
      <a href={`#${contentId}`} className="register-skip">Skip to content</a>
      <header className="register-header">
        <div className="register-header-inner">
          <Link href="/" className="register-wordmark" aria-label="The FLAG Register">
            <span className="register-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 25" fill="currentColor" focusable="false">
                <path d="M2 3h29l-5 9H2zm0 11h22l-5 9H2z" />
              </svg>
            </span>
            FLAG <small>Register</small>
          </Link>
          {aside}
        </div>
      </header>
      {navigation && <RegisterNavigation items={navigation} />}
      <main id={contentId} tabIndex={-1} className={mainClassName ? `register-main ${mainClassName}` : "register-main"}>{children}</main>
      <footer className="register-footer">
        <div className="register-footer-inner">
          <p>FLAG is not legal advice</p>
          <nav aria-label="Legal">
            <Link href="/legal/privacy" aria-label="Privacy notice">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
