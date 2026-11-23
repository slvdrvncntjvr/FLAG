"use client";
import { useActionState, useState } from "react";
import { proposalAction } from "./actions";
import { RevisionFields, type FieldValues } from "./fields";
import { ProofUpload } from "@/features/logs/proof-upload";
import type { LogResult } from "@/features/logs/schema";
import { RemoveProposalProof } from "./remove-form";

type Proof = { id: string; kind: string; mime: string; size_bytes: number; selected: number };
function Feedback({ state }: { state: LogResult | null }) { return state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "register-callout text-sm" : "text-sm text-danger"}>{state.ok ? "Saved. The page shows the latest saved proposal." : state.error}</p>; }
export function UpdateWorkspace({ logId, currentRevisionId, revisionId, value, effectiveOn, previousEffectiveOn, proofs, uploading }: { logId: string; currentRevisionId: string; revisionId?: string; value: FieldValues; effectiveOn?: string; previousEffectiveOn: string; proofs: Proof[]; uploading: { id: string; kind: string }[] }) {
  const [dirty, setDirty] = useState(false), [uploadingNow, setUploading] = useState(false);
  const [saved, save, saving] = useActionState(async (previous: LogResult | null, form: FormData) => { const result = await proposalAction(previous, form); if (result.ok) setDirty(false); return result; }, null), [submitted, submit, submitting] = useActionState(proposalAction, null);
  const [selected, setSelected] = useState(proofs.filter(p => p.selected).map(p => p.id));
  return <div className="mt-5 space-y-6">
    <form action={save} onChange={() => setDirty(true)} className="space-y-5" aria-busy={saving}>
      <input type="hidden" name="operation" value="save" /><input type="hidden" name="kind" value="filer_update" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="expectedCurrentRevisionId" value={currentRevisionId} />{revisionId && <input type="hidden" name="revisionId" value={revisionId} />}
      <fieldset disabled={saving || submitting} className="min-w-0 space-y-5"><legend className="sr-only">Update proposal</legend>
        <RevisionFields value={value} filerUpdate />
        <div className="space-y-2">
          <label className="block text-sm font-medium">Update effective date<input name="effectiveOn" type="date" required defaultValue={effectiveOn} className="register-field mt-1 block w-full" /></label>
          <p className="text-sm text-muted">The date must be later than {previousEffectiveOn} and no later than today in Asia/Manila. A correction does not reset the previous approved update date.</p>
        </div>
        <fieldset className="min-w-0 space-y-2">
          <legend className="register-kicker mb-2">Reuse same-log filer evidence (up to five including new uploads)</legend>
          {proofs.map(p => <label key={p.id} className="register-choice text-sm"><input name="proofIds" type="checkbox" value={p.id} checked={selected.includes(p.id)} onChange={e => setSelected(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))} className="mt-0.5 size-4 shrink-0" /><span>{p.kind} · {p.mime} · {p.size_bytes.toLocaleString("en-US")} bytes</span></label>)}
        </fieldset>
        <button className={revisionId ? "register-secondary w-full" : "register-primary w-full"} disabled={saving || submitting || selected.length + uploading.length > 5}>{saving ? "Saving…" : "Save update draft"}</button>
      </fieldset><Feedback state={saved} />
    </form>
    {revisionId ? <>
      <ProofUpload logId={logId} endpoint={`/api/revisions/${encodeURIComponent(revisionId)}/proofs`} count={selected.length + uploading.length} onBusy={setUploading} />
      {!!uploading.length && <ul className="register-ledger divide-y divide-rule text-sm">{uploading.map(p => <li key={p.id} className="py-3">New saved proof: {p.kind}<RemoveProposalProof logId={logId} proofId={p.id} /></li>)}</ul>}
      <form action={submit} className="space-y-4 border-t border-rule pt-4" aria-busy={submitting}>
        <input type="hidden" name="operation" value="submit" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="revisionId" value={revisionId} />
        <p className="text-sm text-muted">Submission freezes this proposal for human review. The current publication and rating remain active until an approved replacement.</p>
        {dirty && <p role="status" className="register-callout text-sm">Save your changes before submitting.</p>}
        <button className="register-primary w-full" disabled={submitting || saving || uploadingNow || dirty || selected.length + uploading.length === 0}>{submitting ? "Submitting…" : "Submit update for review"}</button>
        <Feedback state={submitted} />
      </form>
    </> : <p className="text-sm text-muted">Save the update draft before uploading additional proof.</p>}
  </div>;
}
