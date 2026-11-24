import Link from "next/link";
import { PageShell } from "./page-shell";

export function LegalPage({ title, version, intro, related, children }: {
  title: string;
  version: string;
  intro: React.ReactNode;
  related: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <PageShell mainClassName="register-narrow">
      <article className="text-sm leading-relaxed">
        <header>
          <h1 className="font-serif text-[1.375rem] leading-tight font-semibold">{title}</h1>
          <p className="mt-4 text-[0.6875rem] font-medium tracking-wider text-muted">Version {version}</p>
          <p className="mt-2 font-serif text-[0.9375rem] leading-snug font-semibold">{intro}</p>
        </header>
        <div className="register-ledger mt-6 space-y-3 py-5 text-muted [&_a]:font-medium [&_a]:text-accent [&_a]:underline-offset-2 [&_h2:not(:first-child)]:mt-6">
          {children}
        </div>
      </article>
      <Link href={related.href} className="mt-6 block text-center text-sm font-medium text-accent underline underline-offset-2">
        {related.label}
      </Link>
    </PageShell>
  );
}
