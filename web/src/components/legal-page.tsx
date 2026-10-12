import { PageShell } from "./page-shell";

// Draft wording until the team supplies the final text (LOG Q15).
export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <PageShell>
      <p className="border border-danger px-3 py-2 font-mono text-xs text-danger">DRAFT TEXT · NOT FINAL</p>
      <h1 className="mt-4 font-serif text-2xl">{title}</h1>
      <p className="mt-1 font-mono text-xs text-muted">Version {version}</p>
      <div className="mt-6 space-y-4 text-sm">{children}</div>
    </PageShell>
  );
}
