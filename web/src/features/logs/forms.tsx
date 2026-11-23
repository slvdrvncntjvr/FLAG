"use client";

import { useActionState, useId, useState } from "react";
import Image from "next/image";
import type { PrivateLog } from "@/server/db/queries/logs";
import { LOG_TAGS, outcomeForRating, type LogResult } from "./schema";
import { removeProofAction, saveDraftAction, submitLogAction } from "./actions";
import { ProofUpload } from "./proof-upload";

const field = "register-field mt-1 block w-full min-w-0";
const anchorLabels = { completed: "Completed", terminated: "Terminated", missed_milestone: "First missed agreed payment or milestone" };
type Saved = LogResult<{ logId: string; ref: string }>;

export function DraftForm({ engagementId, log, onDirty, onBusy }: { engagementId: string; log?: PrivateLog; onDirty?: (dirty: boolean) => void; onBusy?: (busy: boolean) => void }) {
  const prefix = useId();
  const [rating, setRating] = useState(log?.rating ?? 0);
  const boundSave = saveDraftAction.bind(null, { engagementId, ...(log ? { logId: log.id } : {}) });
  const [state, action, pending] = useActionState(async (previous: Saved | null, data: FormData) => {
    onBusy?.(true);
    try {
      const result = await boundSave(previous, data);
      if (result.ok) onDirty?.(false);
      return result;
    } finally { onBusy?.(false); }
  }, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  function attrs(name: string) { return { id: `${prefix}-${name}`, "aria-invalid": !!errors?.[name], "aria-describedby": errors?.[name] ? `${prefix}-${name}-error` : undefined }; }
  function error(name: string) { return errors?.[name] && <p id={`${prefix}-${name}-error`} className="mt-1 text-sm text-danger">{errors[name].join(" ")}</p>; }
  return <form id={`${prefix}-form`} action={action} onChange={() => onDirty?.(true)} className="mt-6 space-y-4 border-t border-rule pt-5" aria-busy={pending}>
    <input type="hidden" name="engagementId" value={engagementId} />
    {log && <input type="hidden" name="logId" value={log.id} />}
    <h2 className="font-serif text-2xl">{log ? "Edit draft" : "Log details"}</h2>
    <p className="text-sm text-muted">Save complete details before adding proof. A saved draft has not been submitted.</p>
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <legend className="sr-only">Engagement log details</legend>
      <fieldset className="min-w-0 space-y-3 text-sm">
        <legend className="register-kicker mb-2">Filing anchor</legend>
        <p className="text-muted">Use completion, termination, or the first missed agreed payment or milestone during ongoing work. Submit within 15 calendar days of this date in Asia/Manila. A 1 April anchor permits submission through 16 April. Repeated missed payments do not restart the clock.</p>
        {log ? <><p className="register-panel">{anchorLabels[log.anchorKind]}: <time dateTime={log.anchorDate} className="font-mono">{log.anchorDate}</time>. The anchor is fixed after the first save.</p><input type="hidden" name="anchorKind" value={log.anchorKind} /><input type="hidden" name="anchorDate" value={log.anchorDate} /></> : <>
          <div><label className="block font-medium" htmlFor={`${prefix}-anchorKind`}>Anchor event</label><select name="anchorKind" required className={field} {...attrs("anchorKind")} defaultValue=""><option value="" disabled>Choose an event</option>{Object.entries(anchorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error("anchorKind")}</div>
          <div><label className="block font-medium" htmlFor={`${prefix}-anchorDate`}>Anchor date</label><input type="date" name="anchorDate" required className={field} {...attrs("anchorDate")} />{error("anchorDate")}</div>
        </>}
        <p className="text-muted">Your proof must support the engagement and this event. Saving a draft does not extend the deadline.</p>
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <legend className="register-kicker mb-2">Covered work period</legend>
        <p className="col-span-full text-muted">The dates the work covers, separate from the filing anchor. Both are required for ongoing work too.</p>
        <div><label className="block font-medium" htmlFor={`${prefix}-periodStart`}>Work period start</label><input type="date" name="periodStart" required defaultValue={log?.periodStart} className={field} {...attrs("periodStart")} />{error("periodStart")}</div>
        <div><label className="block font-medium" htmlFor={`${prefix}-periodEnd`}>Work period end</label><input type="date" name="periodEnd" required defaultValue={log?.periodEnd} className={field} {...attrs("periodEnd")} />{error("periodEnd")}</div>
      </fieldset>
      <div className="register-ledger space-y-3 py-4">
        <div><label className="register-kicker block" htmlFor={`${prefix}-rating`}>Rating</label><select name="rating" required value={rating || ""} onChange={event => setRating(Number(event.target.value))} className={field} {...attrs("rating")}><option value="" disabled>Choose 1–5</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select>{error("rating")}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div aria-hidden="true" className="flex gap-2">{[1, 2, 3, 4, 5].map(value => <Image key={value} src={value <= rating ? "/register/log-rating-filled.svg" : "/register/log-rating-empty.svg"} alt="" width={26} height={26} unoptimized />)}</div>
          <p role="status" className="text-sm font-semibold text-accent">{rating ? `${rating}/5 · ${outcomeForRating(rating).replace(/^./, value => value.toUpperCase())} — derived from your rating.` : "Choose a rating to see the derived outcome."}</p>
        </div>
        <p className="text-sm text-muted">Ratings 1–2 are Negative, 3 is Mixed, and 4–5 are Positive.</p>
      </div>
      <fieldset tabIndex={-1} className="min-w-0 space-y-3" {...attrs("tags")}><legend className="register-kicker mb-2">Factual tags (choose at least one)</legend>
        <p className="text-sm text-muted">Tags describe details and do not change the derived outcome. Positive with Late Payment is allowed.</p>
        <div className="flex flex-wrap gap-2">{LOG_TAGS.map(tag => <label key={tag} className="flex min-h-11 items-center gap-2 rounded-full border border-rule bg-surface px-3 text-sm has-checked:bg-tint"><input type="checkbox" name="tags" value={tag} defaultChecked={log?.tags.includes(tag)} className="size-4 shrink-0" /><span>{tag}</span></label>)}</div>{error("tags")}
      </fieldset>
      <div><label className="block text-sm font-medium" htmlFor={`${prefix}-amountCentavos`}>Amount in centavos (optional)</label><input name="amountCentavos" type="number" inputMode="numeric" min="0" step="1" max={Number.MAX_SAFE_INTEGER} defaultValue={log?.amountCentavos ?? ""} className={field} {...attrs("amountCentavos")} aria-describedby={`${prefix}-amount-help${errors?.amountCentavos ? ` ${prefix}-amountCentavos-error` : ""}`} /><p id={`${prefix}-amount-help`} className="mt-1 text-sm text-muted">Whole nonnegative centavos, without currency conversion. For example, 10000 means ₱100.</p>{error("amountCentavos")}</div>
      <div><label className="register-kicker block" htmlFor={`${prefix}-facts`}>Written facts</label><textarea name="facts" required minLength={40} maxLength={2000} rows={5} defaultValue={log?.facts} className={field} {...attrs("facts")} aria-describedby={`${prefix}-facts-help${errors?.facts ? ` ${prefix}-facts-error` : ""}`} /><p id={`${prefix}-facts-help`} className="mt-1 text-sm text-muted">40–2,000 characters. Describe what happened on this engagement. Do not include government ID details or unrelated personal information.</p>{error("facts")}</div>
    </fieldset>
    {state && !state.ok && <div role="alert" className="register-panel text-sm text-danger"><p>{state.error}</p>{errors && <ul className="mt-2 list-disc pl-5">{Object.entries(errors).map(([name, messages]) => <li key={name}><a className="underline" href={`#${prefix}-${name}`}>{name}: {messages.join(" ")}</a></li>)}</ul>}</div>}
    {state?.ok && <p role="status" className="register-callout text-sm">Draft saved. Review or add proof, then submit.</p>}
    <button disabled={pending} className={log ? "register-secondary w-full" : "register-primary w-full"}>{pending ? "Saving…" : "Save complete draft"}</button>
  </form>;
}

export function DraftWorkspace({ log }: { log: PrivateLog }) {
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, action, pending] = useActionState(submitLogAction.bind(null, log.id), null);
  return <fieldset disabled={pending} className="min-w-0">
    <legend className="sr-only">Private draft and proof</legend>
    <DraftForm engagementId={log.engagementId} log={log} onDirty={setDirty} onBusy={setSaving} />
    {log.draftReady ? <ProofUpload logId={log.id} count={log.proofs.length} onBusy={setUploading} /> : <p className="register-callout mt-6 text-sm" role="status">Save your revised draft before changing evidence or resubmitting.</p>}
    <ProofList log={log} editable={log.draftReady && !pending && !uploading} />
    <form action={action} className="mt-8 space-y-4 border-t border-rule pt-6" aria-busy={pending}>
      <input type="hidden" name="logId" value={log.id} />
      <h2 className="font-serif text-2xl">Submit saved draft</h2>
      <p className="text-sm text-muted">Check the saved details and proof before submitting. Submission freezes this draft and sends it to pending. It stays private.</p>
      {dirty && <p role="status" className="register-callout text-sm">Save your changed details before submitting.</p>}
      {!log.proofs.length && <p className="text-sm text-muted">Attach at least one proof file before submitting.</p>}
      {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending || saving || uploading || dirty || !log.draftReady || !log.proofs.length} className="register-primary w-full">{pending ? "Submitting…" : "Submit private log"}</button>
    </form>
  </fieldset>;
}

export function ProofList({ log, editable = false }: { log: PrivateLog; editable?: boolean }) {
  return <section className="mt-6" aria-label="Saved proof"><h2 className="font-serif text-xl">Saved proof ({log.proofs.length}/5)</h2>
    {!log.proofs.length && <p className="mt-3 border-t border-rule pt-3 text-sm text-muted">No proof uploaded yet.</p>}
    {!!log.proofs.length && <ul className="register-ledger mt-3 divide-y divide-rule">{log.proofs.map((proof, index) => <li className="py-3" key={proof.id}><a href={`/api/proofs/${encodeURIComponent(proof.id)}`} className="block py-2 text-sm text-accent underline underline-offset-4">Download private proof {index + 1} ({proof.kind}, {proof.mime}, {proof.sizeBytes.toLocaleString("en-US")} bytes)</a>{editable && <RemoveProof logId={log.id} proofId={proof.id} />}</li>)}</ul>}
  </section>;
}

function RemoveProof({ logId, proofId }: { logId: string; proofId: string }) {
  const [state, action, pending] = useActionState(removeProofAction.bind(null, logId, proofId), null);
  return <form action={action} className="mt-2"><input type="hidden" name="logId" value={logId} /><input type="hidden" name="proofId" value={proofId} />{state && !state.ok && <p role="alert" className="mb-2 text-sm text-danger">{state.error}</p>}<button className="register-secondary text-sm" disabled={pending}>{pending ? "Removing…" : "Remove proof"}</button></form>;
}
