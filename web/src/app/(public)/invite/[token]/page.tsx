import { getDb } from "@/server/db";
import { loadInviteLanding } from "@/server/db/queries/engagements";
import { ContinueInviteForm } from "@/features/engagements/forms";
import { CONSENT_TEXT, hashInvite, tokenInput } from "@/features/engagements/schema";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = tokenInput.safeParse(token).success ? await loadInviteLanding(await getDb(), await hashInvite(token)) : null;
  if (!invite || invite.expired) return <><h1 className="font-serif text-2xl">{invite?.expired ? "This invite has expired" : "This invitation is unavailable"}</h1><p className="mt-4">Ask the freelancer for a new invitation if needed.</p></>;
  return <>
    <h1 className="font-serif text-2xl">Engagement invitation</h1>
    <p className="mt-4 break-words"><strong>{invite.inviter}</strong> invited you to <strong>{invite.title}</strong>.</p>
    <p className="mt-4">{CONSENT_TEXT}</p>
    <p className="mt-4 text-sm">Continuing does not accept this engagement. Sign in or register as a client, then choose whether to accept or decline. Refusal creates no warning or negative signal.</p>
    <ContinueInviteForm token={token} />
  </>;
}
