"use client";

import { useActionState, useId, useState } from "react";
import type { PrivateLog } from "@/server/db/queries/logs";
import { LOG_TAGS, outcomeForRating, type LogResult } from "./schema";
import { removeProofAction, saveDraftAction, submitLogAction } from "./actions";
import { ProofUpload } from "./proof-upload";

const field = "mt-1 block w-full min-w-0 rounded-sm border border-rule bg-white px-3 py-3";
const button = "w-full rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60";
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
  function error(name: string) { return errors?.[name] && <p id={`${prefix}-${name}-error`} className="mt-1 text-sm">{errors[name].join(" ")}</p>; }
  return <form id={`${prefix}-form`} action={action} onChange={() => onDirty?.(true)} className="mt-6 space-y-5" aria-busy={pending}>
    <input type="hidden" name="engagementId" value={engagementId} />
    {log && <input type="hidden" name="logId" value={log.id} />}
    <h2 className="font-serif text-2xl">{log ? "Edit draft" : "Log details"}</h2>
    <p>Save complete details before adding proof. A saved draft has not been submitted.</p>
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <legend className="sr-only">Engagement log details</legend>
      <fieldset className="min-w-0 space-y-3">
        <legend className="font-medium">Filing anchor</legend>
        <p className="text-sm">Use completion, termination, or the first missed agreed payment or milestone during ongoing work. Submit within 15 calendar days of this date in Asia/Manila. A 1 April anchor permits submission through 16 April. Repeated missed payments do not restart the clock.</p>
        {log ? <><p>{anchorLabels[log.anchorKind]}: <time className="font-mono">{log.anchorDate}</time>. The anchor is fixed after the first save.</p><input type="hidden" name="anchorKind" value={log.anchorKind} /><input type="hidden" name="anchorDate" value={log.anchorDate} /></> : <>
          <div><label className="block" htmlFor={`${prefix}-anchorKind`}>Anchor event</label><select name="anchorKind" required className={field} {...attrs("anchorKind")} defaultValue=""><option value="" disabled>Choose an event</option>{Object.entries(anchorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error("anchorKind")}</div>
          <div><label className="block" htmlFor={`${prefix}-anchorDate`}>Anchor date</label><input type="date" name="anchorDate" required className={field} {...attrs("anchorDate")} />{error("anchorDate")}</div>
        </>}
        <p className="text-sm">Your proof must support the engagement and this event. Saving a draft does not extend the deadline.</p>
      </fieldset>
      <fieldset className="min-w-0 space-y-3"><legend className="font-medium">Covered work period</legend>
        <p className="text-sm">The dates the work covers, separate from the filing anchor. Both are required for ongoing work too.</p>
        <div><label className="block" htmlFor={`${prefix}-periodStart`}>Work period start</label><input type="date" name="periodStart" required defaultValue={log?.periodStart} className={field} {...attrs("periodStart")} />{error("periodStart")}</div>
        <div><label className="block" htmlFor={`${prefix}-periodEnd`}>Work period end</label><input type="date" name="periodEnd" required defaultValue={log?.periodEnd} className={field} {...attrs("periodEnd")} />{error("periodEnd")}</div>
      </fieldset>
      <div><label className="block" htmlFor={`${prefix}-rating`}>Rating</label><select name="rating" required value={rating || ""} onChange={event => setRating(Number(event.target.value))} className={field} {...attrs("rating")}><option value="" disabled>Choose 1–5</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select>{error("rating")}</div>
      <p role="status">{rating ? `${rating <= 2 ? "!" : rating === 3 ? "~" : "✓"} ${outcomeForRating(rating).replace(/^./, value => value.toUpperCase())} — derived from your rating.` : "Choose a rating to see the derived outcome."}</p>
      <fieldset tabIndex={-1} className="min-w-0 space-y-2" {...attrs("tags")}><legend className="font-medium">Factual tags (choose at least one)</legend>
        <p className="text-sm">Tags describe details and do not change the derived outcome. Positive with Late Payment is allowed.</p>
        {LOG_TAGS.map(tag => <label key={tag} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="tags" value={tag} defaultChecked={log?.tags.includes(tag)} className="size-4 shrink-0" /><span>{tag}</span></label>)}{error("tags")}
      </fieldset>
      <div><label className="block" htmlFor={`${prefix}-amountCentavos`}>Amount in centavos (optional)</label><input name="amountCentavos" type="number" inputMode="numeric" min="0" step="1" max={Number.MAX_SAFE_INTEGER} defaultValue={log?.amountCentavos ?? ""} className={field} {...attrs("amountCentavos")} aria-describedby={`${prefix}-amount-help${errors?.amountCentavos ? ` ${prefix}-amountCentavos-error` : ""}`} /><p id={`${prefix}-amount-help`} className="mt-1 text-sm">Whole nonnegative centavos, without currency conversion. For example, 10000 means ₱100.</p>{error("amountCentavos")}</div>
      <div><label className="block" htmlFor={`${prefix}-facts`}>Written facts</label><textarea name="facts" required minLength={40} maxLength={2000} rows={7} defaultValue={log?.facts} className={field} {...attrs("facts")} aria-describedby={`${prefix}-facts-help${errors?.facts ? ` ${prefix}-facts-error` : ""}`} /><p id={`${prefix}-facts-help`} className="mt-1 text-sm">40–2,000 characters. Describe what happened on this engagement. Do not include government ID details or unrelated personal information.</p>{error("facts")}</div>
    </fieldset>
    {state && !state.ok && <div role="alert" className="border-y border-rule py-3"><p>{state.error}</p>{errors && <ul className="mt-2 list-disc pl-5">{Object.entries(errors).map(([name, messages]) => <li key={name}><a className="underline" href={`#${prefix}-${name}`}>{name}: {messages.join(" ")}</a></li>)}</ul>}</div>}
    {state?.ok && <p role="status">Draft saved. Review or add proof, then submit.</p>}
    <div className="sticky bottom-0 border-t border-rule bg-paper py-3"><button disabled={pending} className={button}>{pending ? "Saving…" : "Save complete draft"}</button></div>
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
    <ProofUpload logId={log.id} count={log.proofs.length} onBusy={setUploading} />
    <ProofList log={log} editable={!pending && !uploading} />
    <form action={action} className="mt-8 space-y-4 border-t border-rule pt-6" aria-busy={pending}>
      <input type="hidden" name="logId" value={log.id} />
      <h2 className="font-serif text-2xl">Submit saved draft</h2>
      <p>Check the saved details and proof before submitting. Submission freezes this draft and sends it to pending. It stays private.</p>
      {dirty && <p role="status">Save your changed details before submitting.</p>}
      {!log.proofs.length && <p>Attach at least one proof file before submitting.</p>}
      {state && !state.ok && <p role="alert">{state.error}</p>}
      <button disabled={pending || saving || uploading || dirty || !log.proofs.length} className={button}>{pending ? "Submitting…" : "Submit private log"}</button>
    </form>
  </fieldset>;
}

export function ProofList({ log, editable = false }: { log: PrivateLog; editable?: boolean }) {
  return <section className="mt-6" aria-label="Saved proof"><h2 className="font-serif text-2xl">Saved proof ({log.proofs.length}/5)</h2>
    {!log.proofs.length && <p className="mt-3">No proof uploaded yet.</p>}
    <ul className="mt-3 divide-y divide-rule">{log.proofs.map((proof, index) => <li className="py-3" key={proof.id}><a href={`/api/proofs/${encodeURIComponent(proof.id)}`} className="block break-words py-2 underline">Download private proof {index + 1} ({proof.kind}, {proof.mime}, {proof.sizeBytes.toLocaleString("en-US")} bytes)</a>{editable && <RemoveProof logId={log.id} proofId={proof.id} />}</li>)}</ul>
  </section>;
}

function RemoveProof({ logId, proofId }: { logId: string; proofId: string }) {
  const [state, action, pending] = useActionState(removeProofAction.bind(null, logId, proofId), null);
  return <form action={action} className="mt-2"><input type="hidden" name="logId" value={logId} /><input type="hidden" name="proofId" value={proofId} />{state && !state.ok && <p role="alert">{state.error}</p>}<button className="border border-rule px-4 py-3 disabled:opacity-60" disabled={pending}>{pending ? "Removing…" : "Remove proof"}</button></form>;
}
