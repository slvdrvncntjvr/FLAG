import { PageShell } from "./page-shell";

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <PageShell>
      <h1 className="font-serif text-2xl">{title}</h1>
      <p className="mt-1 font-mono text-xs text-muted">Version {version}</p>
      <div className="mt-6 space-y-4 text-sm">{children}</div>
    </PageShell>
  );
}
