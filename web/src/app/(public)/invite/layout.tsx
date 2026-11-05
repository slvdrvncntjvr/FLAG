import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
