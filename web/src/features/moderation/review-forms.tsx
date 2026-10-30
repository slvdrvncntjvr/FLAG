"use client";

import { useActionState, useEffect, useState } from "react";
import { ActionFeedback, buttonStyle, inputStyle, recoverAction, ReloadStatus } from "@/features/verification/action-feedback";
import type { ReviewResult } from "@/features/verification/schema";
import { claimReview, decideReview, recordInspection, releaseReview } from "./actions";

type Lease = { caseId: string; expectedClaimUntil: string };

function LeaseFields({ caseId, expectedClaimUntil }: Lease) {
  return <><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="expectedClaimUntil" value={expectedClaimUntil} /></>;
}

export function ClaimReviewForm({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>((previous, form) => recoverAction(claimReview, previous, form), null);
  return <form action={action} className="mt-6 space-y-3" aria-busy={pending}>
    <input type="hidden" name="caseId" value={caseId} />
    <p>Claim this request for 30 minutes before inspecting or deciding.</p>
    <button disabled={pending || state?.ok === true} className={`${buttonStyle} w-full`}>{pending ? "Claiming…" : "Claim review"}</button>
    <ActionFeedback state={state} success="Review claimed. Reload status if the review form has not appeared." />
  </form>;
}

export function ReviewerForms({ caseId, expectedClaimUntil, canApprove }: Lease & { canApprove: boolean }) {
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  // Server predicates remain authoritative; the timer makes the stale form clear.
  useEffect(() => {
    const remaining = Date.parse(expectedClaimUntil) - Date.now();
    const timer = setTimeout(() => setExpired(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [expectedClaimUntil]);
  return <div className="mt-8 space-y-8">
    {expired && <div role="alert" className="space-y-2"><p>Your claim has expired. Reload and claim again before continuing.</p><ReloadStatus /></div>}
    <fieldset disabled={expired || busy} className="min-w-0 space-y-8">
      <legend className="sr-only">Actions for your claimed review</legend>
      <InspectionForm caseId={caseId} expectedClaimUntil={expectedClaimUntil} onPending={setBusy} />
      <DecisionForm caseId={caseId} expectedClaimUntil={expectedClaimUntil} canApprove={canApprove} onPending={setBusy} />
      <ReleaseForm caseId={caseId} expectedClaimUntil={expectedClaimUntil} onPending={setBusy} />
    </fieldset>
  </div>;
}

function InspectionForm({ onPending, ...lease }: Lease & { onPending: (pending: boolean) => void }) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>((previous, form) => recoverAction(recordInspection, previous, form), null);
  useEffect(() => { onPending(pending); }, [pending, onPending]);
  return <form action={action} className="space-y-5 border-t border-rule pt-5" aria-busy={pending}>
    <LeaseFields {...lease} />
    <h2 className="font-medium">Record a live inspection</h2>
    <p className="text-muted">Inspect the supported ID live and compare it to the captured account/profile name. Do not capture an image, number, recording or QR data. Recording inspection does not approve verification.</p>
    <label className="block" htmlFor="inspection-kind">ID kind inspected
      <select id="inspection-kind" name="idKind" required defaultValue="" className={inputStyle}>
        <option value="" disabled>Choose ID kind</option><option value="philid">PhilID</option><option value="ephilid">ePhilID</option><option value="passport">Passport</option><option value="drivers_licence">Driver licence</option>
      </select>
    </label>
    <label className="block" htmlFor="inspection-result">Inspection result
      <select id="inspection-result" name="result" required defaultValue="" className={inputStyle}>
        <option value="" disabled>Choose result</option><option value="pass">Pass</option><option value="fail">Fail</option>
      </select>
    </label>
    <fieldset className="space-y-3"><legend className="font-medium">Does the ID name match the account/profile name?</legend>
      <label className="flex min-h-11 items-center gap-3"><input type="radio" name="nameMatch" value="yes" required />Yes, matches</label>
      <label className="flex min-h-11 items-center gap-3"><input type="radio" name="nameMatch" value="no" required />No, does not match</label>
    </fieldset>
    <label className="flex items-start gap-3"><input type="checkbox" name="liveInspection" required className="mt-1 size-4 shrink-0" /><span>I personally inspected the ID live for this request. I have not saved its image or full number.</span></label>
    <button disabled={pending} className={`${buttonStyle} w-full`}>{pending ? "Recording inspection…" : "Record live inspection"}</button>
    <ActionFeedback state={state} success="Live inspection recorded. Review the facts below before deciding." />
  </form>;
}

function DecisionForm({ canApprove, onPending, ...lease }: Lease & { canApprove: boolean; onPending: (pending: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("");
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>((previous, form) => recoverAction(decideReview, previous, form), null);
  useEffect(() => { onPending(pending); }, [pending, onPending]);
  return <form action={action} className="space-y-5 border-t border-rule pt-5" aria-busy={pending}>
    <LeaseFields {...lease} />
    <h2 className="font-medium">Decide verification</h2>
    {!canApprove && <p className="text-muted">Approval requires a passing live inspection recorded by you under this claim with a matching name. You may reject an uninspected request with a reason.</p>}
    <label className="block" htmlFor="review-decision">Decision
      <select id="review-decision" name="decision" required value={decision} onChange={e => setDecision(e.target.value)} className={inputStyle}>
        <option value="" disabled>Choose decision</option><option value="approve" disabled={!canApprove}>Approve identity check</option><option value="reject">Reject request</option>
      </select>
    </label>
    <label className="block" htmlFor="review-reason">Reason (shared with the freelancer)
      <textarea id="review-reason" name="reason" required maxLength={1000} rows={4} value={reason} onChange={e => setReason(e.target.value)} aria-describedby="review-reason-help" className={inputStyle} />
    </label>
    <p id="review-reason-help" className="text-muted">State the review grounds only. Do not transcribe ID details, numbers, links or QR data. This closes the request and cannot be undone here.</p>
    <button disabled={pending || !reason.trim() || !decision || (decision === "approve" && !canApprove)} className={`${buttonStyle} sticky bottom-4 w-full`}>{pending ? "Recording decision…" : "Record decision"}</button>
    <ActionFeedback state={state} success="Decision recorded." />
  </form>;
}

function ReleaseForm({ onPending, ...lease }: Lease & { onPending: (pending: boolean) => void }) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>((previous, form) => recoverAction(releaseReview, previous, form), null);
  useEffect(() => { onPending(pending); }, [pending, onPending]);
  return <form action={action} className="space-y-3 border-t border-rule pt-5" aria-busy={pending}>
    <LeaseFields {...lease} />
    <p>Release this claim if another moderator should continue. A new claimant must perform their own live inspection.</p>
    <button disabled={pending} className="min-h-11 underline">{pending ? "Releasing…" : "Release claim"}</button>
    <ActionFeedback state={state} success="Claim released." />
  </form>;
}
