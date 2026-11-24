import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { RegisterIcon } from "@/components/register-icon";

export default function NotFound() {
  return (
    <PageShell mainClassName="text-center">
      <div className="mx-auto max-w-sm space-y-4 py-4">
        <span className="register-icon-tile"><RegisterIcon name="flag" /></span>
        <h1>Page not found</h1>
        <p className="text-sm text-muted">This page does not exist or you do not have access to it.</p>
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">
          Return to the register
        </Link>
      </div>
    </PageShell>
  );
}
