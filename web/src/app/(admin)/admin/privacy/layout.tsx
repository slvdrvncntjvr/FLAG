import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { PageShell, privacyNavigation } from "@/components/page-shell";

export const metadata = { title: "Privacy processing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PrivacyLayout({ children }: { children: React.ReactNode }) {
  if ((await viewerOrRedirect()).role !== "admin") notFound();
  return <PageShell navigation={privacyNavigation}><nav aria-label="Privacy processing" className="register-ledger mb-6 flex flex-wrap gap-x-5 gap-y-2 py-3 text-sm font-semibold text-accent"><Link href="/home" className="underline underline-offset-4">Account home</Link><Link href="/admin/privacy" className="underline underline-offset-4">Privacy requests</Link></nav>{children}</PageShell>;
}
