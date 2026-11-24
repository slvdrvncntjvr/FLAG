"use client";

import { useActionState } from "react";
import { POLICY_VERSIONS } from "@/lib/policies";
import { cancelEngagement, continueInvite, createEngagement, declineEngagement } from "./actions";
import { CONSENT_TEXT, type EngagementResult } from "./schema";

const field = "register-field mt-1 block w-full";
const button = "register-primary w-full";

export function CreateEngagementForm() {
  const [state, action, pending] = useActionState(createEngagement, null);
  return <form id="new-engagement" action={action} className="scroll-mt-4 space-y-4 border-t border-rule pt-5" aria-labelledby="new-engagement-heading">
    <h2 id="new-engagement-heading" className="font-serif text-2xl">New engagement</h2>
    <label className="block text-sm">Engagement title<input className={field} name="title" required maxLength={160} /></label>
    <label className="block text-sm">Client name as you know it<input className={field} name="clientNameHint" required maxLength={160} /></label>
    <label className="block text-sm">Start date<input className={field} type="date" name="startedOn" required /></label>
    <p className="border-t border-rule pt-4 text-sm text-muted">The link expires in 14 days. You can create 10 invitations per day and 30 per week.</p>
    {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
    {state?.ok && <div role="status" className="register-callout space-y-2 text-sm">
      <p>Invitation created. Copy this link and send it to your client. It is shown once.</p>
      <input aria-label="Invite link" readOnly className={`${field} font-mono text-sm`} value={typeof window === "undefined" ? state.invitePath : `${window.location.origin}${state.invitePath}`} onFocus={e => e.currentTarget.select()} />
      <p className="text-sm">No email was sent.</p>
    </div>}
    <button type="submit" disabled={pending} className={button}>{pending ? "Creating" : "Create invitation"}</button>
  </form>;
}

export function ContinueInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(continueInvite, null);
  return <form action={action} className="mt-6 space-y-4">
    <input type="hidden" name="token" value={token} />
    {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
    <button disabled={pending} className={button}>{pending ? "Continuing" : "Continue to sign in or respond"}</button>
  </form>;
}

export function RespondInviteForm({ engagementId, profile, acceptAction }: {
  engagementId: string; profile: { displayName: string; kind: string } | null;
  acceptAction: (previous: EngagementResult | null, data: FormData) => Promise<EngagementResult>;
}) {
  const [accepted, accept, accepting] = useActionState(acceptAction, null);
  const [declined, decline, declining] = useActionState(declineEngagement, null);
  return <div className="mt-6 space-y-8">
    <form action={accept} className="space-y-5">
      <input type="hidden" name="engagementId" value={engagementId} />
      {profile ? <p className="register-panel">Your client profile: <strong>{profile.displayName}</strong> ({profile.kind}).</p> : <fieldset className="space-y-4">
        <legend className="register-kicker mb-2">Your client profile</legend>
        <p className="text-sm text-muted">Enter your details. Profiles are linked to registered accounts and are never merged by name.</p>
        <label className="block text-sm">Display name<input name="displayName" maxLength={160} required className={field} /></label>
        <label className="block text-sm">Profile type<select name="kind" required className={field}><option value="individual">Individual</option><option value="business">Business</option></select></label>
        <label className="block text-sm">City<input name="city" maxLength={160} required className={field} /></label>
        <label className="block text-sm">DTI or SEC registration number (optional)<input name="registrationNo" maxLength={100} className={field} /></label>
      </fieldset>}
      <label className="register-choice text-sm"><input type="checkbox" name="associate" required className="mt-0.5 size-4 shrink-0" /><span>Use my signed-in account and {profile ? "this client profile" : "create this client profile"} for this engagement.</span></label>
      <label className="register-choice text-sm"><input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" /><span>{CONSENT_TEXT}</span></label>
      <p className="font-mono text-sm text-muted">Consent version {POLICY_VERSIONS.client_consent}</p>
      <p className="text-sm text-muted">Accept only if you have agreed to work with this freelancer on this engagement. You can decline without a warning or negative signal.</p>
      {accepted && !accepted.ok && <p role="alert" className="text-sm text-danger">{accepted.message}</p>}
      <button disabled={accepting || declining} className={button}>{accepting ? "Accepting" : "Accept engagement"}</button>
    </form>
    <form action={decline} className="border-t border-rule pt-6">
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="mb-3 text-sm text-muted">Declining requires no profile or engagement consent.</p>
      {declined && !declined.ok && <p role="alert" className="mb-3 text-sm text-danger">{declined.message}</p>}
      <button disabled={accepting || declining} className="register-secondary w-full">{declining ? "Declining" : "Decline invitation"}</button>
    </form>
  </div>;
}

export function CancelInviteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelEngagement, null);
  return <form action={action} className="col-span-full mt-3">
    <input type="hidden" name="id" value={id} />
    {state && !state.ok && <p role="alert" className="mb-2 text-sm text-danger">{state.message}</p>}
    <button disabled={pending} className="register-secondary text-sm">{pending ? "Cancelling" : "Cancel invitation"}</button>
  </form>;
}
