import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { PageShell } from "@/components/page-shell";

export const metadata = { title: "Privacy processing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PrivacyLayout({ children }: { children: React.ReactNode }) {
  if ((await viewerOrRedirect()).role !== "admin") notFound();
  return <PageShell><nav className="mb-6 flex gap-4"><Link href="/home">Account home</Link><Link href="/admin/privacy">Privacy requests</Link></nav>{children}</PageShell>;
}
