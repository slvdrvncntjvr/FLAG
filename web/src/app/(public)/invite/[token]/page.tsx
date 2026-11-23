import { PageShell } from "@/components/page-shell";
import { getDb } from "@/server/db";
import { loadInviteLanding } from "@/server/db/queries/engagements";
import { ContinueInviteForm } from "@/features/engagements/forms";
import { CONSENT_TEXT, hashInvite, INVITE_TTL_DAYS, tokenInput } from "@/features/engagements/schema";
import { InviteSummary, InviteUnavailable } from "../invite-summary";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = tokenInput.safeParse(token).success ? await loadInviteLanding(await getDb(), await hashInvite(token)) : null;
  if (!invite || invite.expired) {
    return (
      <InviteUnavailable title={invite?.expired ? "This invite has expired" : "This invitation is unavailable"}>
        Ask the freelancer for a new invitation if needed.
      </InviteUnavailable>
    );
  }
  return (
    <PageShell mainClassName="register-narrow">
      <h1 className="mt-2 text-center font-serif text-[1.875rem] leading-tight">You have an invitation</h1>
      <p className="mx-auto mt-3 mb-5 max-w-[34ch] text-center text-sm leading-relaxed text-muted">
        {invite.inviter} invited you to an engagement.
      </p>
      <InviteSummary inviter={invite.inviter} title={invite.title} />
      <section aria-labelledby="invite-consent" className="mx-auto mt-5 max-w-[45ch] text-center">
        <h2 id="invite-consent" className="font-serif text-base font-semibold">If you accept</h2>
        <p className="mt-2 text-sm leading-relaxed">{CONSENT_TEXT}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Continuing does not accept this engagement. Sign in or register as a client, then choose whether to accept or decline. Refusal creates no warning or negative signal.
        </p>
      </section>
      <ContinueInviteForm token={token} />
      <p className="mt-6 rounded-sm bg-ink px-4 py-3.5 text-sm text-paper">
        Invitation links expire {INVITE_TTL_DAYS} days after creation.
      </p>
    </PageShell>
  );
}
