"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RegisterIcon, type RegisterIconName } from "./register-icon";

export type RegisterNavItem = {
  href: string;
  label: string;
  icon: RegisterIconName;
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
              <RegisterIcon name={icon} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
