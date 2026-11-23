"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type RegisterNavItem = {
  href: string;
  label: string;
  icon: "search" | "engagements" | "profile" | "record" | "queue" | "data";
  paths?: string[];
};

export function RegisterNavigation({ items }: { items: RegisterNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="register-dock" aria-label="Main navigation">
      <div className="register-dock-inner">
        {items.map(({ href, label, icon, paths = [href] }) => {
          const current = paths.some(path => pathname === path || pathname.startsWith(`${path}/`));
          return (
            <Link key={href} href={href} aria-current={current ? (pathname === href ? "page" : "location") : undefined}>
              <span aria-hidden="true" className="register-icon" style={{ "--register-icon": `url("/register/${icon}.svg")` } as CSSProperties} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
