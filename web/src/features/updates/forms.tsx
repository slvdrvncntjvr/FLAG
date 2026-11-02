"use client";
import { useActionState, useState } from "react";
import { proposalAction } from "./actions";
import { RevisionFields, type FieldValues } from "./fields";
import { ProofUpload } from "@/features/logs/proof-upload";
import type { LogResult } from "@/features/logs/schema";
import { RemoveProposalProof } from "./remove-form";

type Proof = { id: string; kind: string; mime: string; size_bytes: number; selected: number };
function Feedback({ state }: { state: LogResult | null }) { return state && <p role={state.ok ? "status" : "alert"}>{state.ok ? "Saved. The page shows the latest saved proposal." : state.error}</p>; }
export function UpdateWorkspace({ logId, currentRevisionId, revisionId, value, effectiveOn, previousEffectiveOn, proofs, uploading }: { logId: string; currentRevisionId: string; revisionId?: string; value: FieldValues; effectiveOn?: string; previousEffectiveOn: string; proofs: Proof[]; uploading: { id: string; kind: string }[] }) {
  const [dirty, setDirty] = useState(false), [uploadingNow, setUploading] = useState(false);
  const [saved, save, saving] = useActionState(async (previous: LogResult | null, form: FormData) => { const result = await proposalAction(previous, form); if (result.ok) setDirty(false); return result; }, null), [submitted, submit, submitting] = useActionState(proposalAction, null);
  const [selected, setSelected] = useState(proofs.filter(p => p.selected).map(p => p.id));
  return <div className="mt-6 space-y-8">
    <form action={save} onChange={() => setDirty(true)} className="space-y-5" aria-busy={saving}>
      <input type="hidden" name="operation" value="save" /><input type="hidden" name="kind" value="filer_update" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="expectedCurrentRevisionId" value={currentRevisionId} />{revisionId && <input type="hidden" name="revisionId" value={revisionId} />}
      <fieldset disabled={saving || submitting} className="min-w-0 space-y-5"><legend className="sr-only">Update proposal</legend>
        <label className="block">Update effective date<input name="effectiveOn" type="date" required defaultValue={effectiveOn} className="mt-1 block w-full border border-rule bg-white p-3" /></label><p>The date must be later than {previousEffectiveOn} and no later than today in Asia/Manila. A correction does not reset the previous approved update date.</p>
        <RevisionFields value={value} />
        <fieldset><legend>Reuse same-log filer evidence (up to five including new uploads)</legend>{proofs.map(p => <label key={p.id} className="flex min-h-11 items-center gap-3"><input name="proofIds" type="checkbox" value={p.id} checked={selected.includes(p.id)} onChange={e => setSelected(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))} /><span>{p.kind} · {p.mime} · {p.size_bytes.toLocaleString("en-US")} bytes</span></label>)}</fieldset>
        <button className="min-h-11 bg-ink px-4 py-3 text-paper disabled:opacity-60" disabled={saving || submitting || selected.length + uploading.length > 5}>{saving ? "Saving…" : "Save update draft"}</button>
      </fieldset><Feedback state={saved} />
    </form>
    {revisionId ? <><ProofUpload logId={logId} endpoint={`/api/revisions/${encodeURIComponent(revisionId)}/proofs`} count={selected.length + uploading.length} onBusy={setUploading} />{!!uploading.length && <ul>{uploading.map(p => <li key={p.id}>New saved proof: {p.kind}<RemoveProposalProof logId={logId} proofId={p.id} /></li>)}</ul>}
      <form action={submit} className="space-y-4" aria-busy={submitting}><input type="hidden" name="operation" value="submit" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="revisionId" value={revisionId} /><p>Submission freezes this proposal for human review. The current publication and rating remain active until an approved replacement.</p><button className="min-h-11 bg-ink px-4 py-3 text-paper disabled:opacity-60" disabled={submitting || saving || uploadingNow || dirty || selected.length + uploading.length === 0}>{submitting ? "Submitting…" : "Submit update for review"}</button>{dirty && <p role="status">Save your changes before submitting.</p>}<Feedback state={submitted} /></form></> : <p>Save the update draft before uploading additional proof.</p>}
  </div>;
}
