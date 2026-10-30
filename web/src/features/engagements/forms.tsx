"use client";

import { useActionState } from "react";
import { POLICY_VERSIONS } from "@/lib/policies";
import { acceptEngagement, cancelEngagement, continueInvite, createEngagement, declineEngagement } from "./actions";
import { CONSENT_TEXT } from "./schema";

const field = "mt-1 block w-full rounded-sm border border-rule bg-white px-3 py-3";
const button = "w-full rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60";

export function CreateEngagementForm() {
  const [state, action, pending] = useActionState(createEngagement, null);
  return <form action={action} className="mt-6 space-y-4">
    <h2 className="font-serif text-2xl">Invite a client</h2>
    <p className="text-sm">The link expires in 14 days. You can create 10 invitations per day and 30 per week.</p>
    <label className="block text-sm">Engagement title<input className={field} name="title" required maxLength={160} /></label>
    <label className="block text-sm">Client name as you know it<input className={field} name="clientNameHint" required maxLength={160} /></label>
    <label className="block text-sm">Start date<input className={field} type="date" name="startedOn" required /></label>
    {state && !state.ok && <p role="alert">{state.message}</p>}
    {state?.ok && <div role="status" className="space-y-2 border-y border-rule py-4">
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
    {state && !state.ok && <p role="alert">{state.message}</p>}
    <button disabled={pending} className={button}>{pending ? "Continuing" : "Continue to sign in or respond"}</button>
  </form>;
}

export function RespondInviteForm({ engagementId, profile }: { engagementId: string; profile: { displayName: string; kind: string } | null }) {
  const [accepted, accept, accepting] = useActionState(acceptEngagement, null);
  const [declined, decline, declining] = useActionState(declineEngagement, null);
  return <div className="mt-6 space-y-8">
    <form action={accept} className="space-y-5">
      <input type="hidden" name="engagementId" value={engagementId} />
      {profile ? <p>Your client profile: <strong>{profile.displayName}</strong> ({profile.kind}).</p> : <fieldset className="space-y-4">
        <legend className="font-medium">Your client profile</legend>
        <p className="text-sm">Enter your details. Profiles are linked to registered accounts and are never merged by name.</p>
        <label className="block text-sm">Display name<input name="displayName" maxLength={160} required className={field} /></label>
        <label className="block text-sm">Profile type<select name="kind" required className={field}><option value="individual">Individual</option><option value="business">Business</option></select></label>
        <label className="block text-sm">City (optional)<input name="city" maxLength={160} className={field} /></label>
        <label className="block text-sm">DTI or SEC registration number (optional)<input name="registrationNo" maxLength={100} className={field} /></label>
      </fieldset>}
      <label className="flex items-start gap-3"><input type="checkbox" name="associate" required className="mt-1 size-4 shrink-0" /><span>Use my signed-in account and {profile ? "this client profile" : "create this client profile"} for this engagement.</span></label>
      <label className="flex items-start gap-3"><input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0" /><span>{CONSENT_TEXT}</span></label>
      <p className="font-mono text-sm">Consent version {POLICY_VERSIONS.client_consent}</p>
      <p className="text-sm">Accept only if you have agreed to work with this freelancer on this engagement. You can decline without a warning or negative signal.</p>
      {accepted && !accepted.ok && <p role="alert">{accepted.message}</p>}
      <button disabled={accepting || declining} className={button}>{accepting ? "Accepting" : "Accept engagement"}</button>
    </form>
    <form action={decline} className="border-t border-rule pt-6">
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="mb-3 text-sm">Declining requires no profile or engagement consent.</p>
      {declined && !declined.ok && <p role="alert">{declined.message}</p>}
      <button disabled={accepting || declining} className="w-full border border-rule px-4 py-3 disabled:opacity-60">{declining ? "Declining" : "Decline invitation"}</button>
    </form>
  </div>;
}

export function CancelInviteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelEngagement, null);
  return <form action={action} className="mt-3">
    <input type="hidden" name="id" value={id} />
    {state && !state.ok && <p role="alert">{state.message}</p>}
    <button disabled={pending} className="border border-rule px-4 py-3 text-sm disabled:opacity-60">{pending ? "Cancelling" : "Cancel invitation"}</button>
  </form>;
}
