import { PageShell } from "@/components/page-shell";

export function InviteSummary({ inviter, title }: { inviter: string; title: string }) {
  return (
    <dl className="register-panel text-center px-9!">
      <div className="pb-4">
        <dt className="text-[0.6875rem] font-medium tracking-wide text-muted">Inviting freelancer</dt>
        <dd className="mt-1 font-serif text-xl leading-tight font-semibold">{inviter}</dd>
      </div>
      <div className="border-t border-rule pt-3">
        <dt className="text-[0.6875rem] font-medium tracking-wide text-muted">Engagement</dt>
        <dd className="mt-1 font-semibold">{title}</dd>
      </div>
    </dl>
  );
}

export function InviteUnavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageShell mainClassName="register-narrow">
      <section className="register-panel text-center">
        <h1 className="font-serif text-[1.375rem] leading-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted">{children}</p>
      </section>
    </PageShell>
  );
}
