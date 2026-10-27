import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth/guards";
import { isOnboarded } from "@/server/db/queries/viewer";
import { getDb } from "@/server/db";
import { loadInviteForClient, loadInviteLanding } from "@/server/db/queries/engagements";
import { INVITE_RETURN_PATH, PENDING_INVITE_COOKIE, tokenInput } from "@/features/engagements/schema";
import { RespondInviteForm } from "@/features/engagements/forms";

export default async function ContinueInvite() {
  const value = (await cookies()).get(PENDING_INVITE_COOKIE)?.value;
  const hash = tokenInput.safeParse(value).success ? value! : "";
  const landing = hash ? await loadInviteLanding(await getDb(), hash) : null;
  if (!landing || landing.expired) return <><h1 className="font-serif text-2xl">{landing?.expired ? "This invite has expired" : "This invitation is unavailable"}</h1><p className="mt-4">Open the invitation link again to continue.</p></>;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`);
  if (!isOnboarded(viewer)) redirect(`/onboarding?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`);
  const invite = await loadInviteForClient(await getDb(), viewer.id, hash);
  if (!invite) return <><h1 className="font-serif text-2xl">This account cannot respond</h1><p className="mt-4">Only a different client account can respond to this invitation.</p></>;
  return <>
    <h1 className="font-serif text-2xl">Respond to invitation</h1>
    <p className="mt-4 break-words"><strong>{invite.inviter}</strong> invited you to <strong>{invite.title}</strong>.</p>
    <RespondInviteForm profile={invite.profile} />
  </>;
}
