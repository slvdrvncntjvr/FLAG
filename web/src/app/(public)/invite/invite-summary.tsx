import { PageShell } from "@/components/page-shell";
import { RegisterIcon } from "@/components/register-icon";

export function InviteSummary({ inviter, title }: { inviter: string; title: string }) {
  return (
    <div className="register-invite-summary">
      <RegisterIcon name="invite" className="text-accent" />
      <dl>
        <div>
          <dt className="register-kicker">Engagement</dt>
          <dd className="mt-1 text-lg leading-tight font-semibold">{title}</dd>
        </div>
        <div>
          <dt className="register-kicker">Inviting freelancer</dt>
          <dd className="mt-1 text-sm font-semibold">{inviter}</dd>
        </div>
      </dl>
    </div>
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
