import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell, profileLink } from "@/components/page-shell";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { getViewer } from "@/server/auth/guards";
import { isOnboarded } from "@/server/db/queries/viewer";
import { getDb } from "@/server/db";
import { loadInviteForClient, loadInviteLanding } from "@/server/db/queries/engagements";
import { INVITE_RETURN_PATH, PENDING_INVITE_COOKIE, tokenInput } from "@/features/engagements/schema";
import { RespondInviteForm } from "@/features/engagements/forms";
import { acceptEngagement } from "@/features/engagements/actions";
import { SignOutButton } from "@/features/onboarding/sign-out-button";
import { InviteSummary, InviteUnavailable } from "../invite-summary";

export default async function ContinueInvite() {
  const value = (await cookies()).get(PENDING_INVITE_COOKIE)?.value;
  const hash = tokenInput.safeParse(value).success ? value! : "";
  const landing = hash ? await loadInviteLanding(await getDb(), hash) : null;
  if (!landing || landing.expired) {
    return (
      <InviteUnavailable title={landing?.expired ? "This invite has expired" : "This invitation is unavailable"}>
        Open the invitation link again to continue.
      </InviteUnavailable>
    );
  }
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`);
  if (!isOnboarded(viewer)) redirect(`/onboarding?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`);
  const invite = await loadInviteForClient(await getDb(), viewer.id, hash);
  if (!invite) {
    return (
      <InviteUnavailable title="This account cannot respond">
        Only a different client account can respond to this invitation.
      </InviteUnavailable>
    );
  }
  return (
    <PageShell
      mainClassName="register-narrow"
      navigation={[
        { href: "/engagements", label: "Engagements", icon: "engagements", paths: ["/engagements", "/invite/continue"] },
        { href: "/clients", label: "My record", icon: "record" },
        profileLink,
      ]}
      aside={
        <div className="flex flex-wrap items-center gap-x-3 text-xs">
          <span className="register-status">Client</span>
          <SignOutButton />
        </div>
      }
    >
      <RegisterPageHeading title="Respond to invitation" />
      <InviteSummary inviter={invite.inviter} title={invite.title} />
      <RespondInviteForm
        engagementId={invite.id}
        profile={invite.profile}
        acceptAction={acceptEngagement.bind(null, invite.profile?.id ?? null)}
      />
    </PageShell>
  );
}
