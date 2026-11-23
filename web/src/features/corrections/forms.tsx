"use client";
import { useActionState, useState } from "react";
import { correctionAction } from "./actions";
import { ProofUpload } from "@/features/logs/proof-upload";
export function CorrectionOpenForm({ logId }: { logId: string }) {
  const [state, action, pending] = useActionState(correctionAction, null);
  return <form action={action} className="mt-5 space-y-4" aria-busy={pending}>
    <input type="hidden" name="operation" value="open" /><input type="hidden" name="logId" value={logId} />
    <h2 className="font-serif text-xl">Request a private review</h2>
    <label className="block"><span className="register-kicker">Private factual correction note</span><textarea name="note" required maxLength={1000} rows={4} className="register-field mt-1 block w-full" /></label>
    <p className="text-sm text-muted">Describe the factual error and any new evidence. Opinion disagreement alone does not justify removal. Do not include government ID details.</p>
    <button disabled={pending} className="register-primary w-full">{pending ? "Saving…" : "Open private correction draft"}</button>
    {state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "register-callout text-sm" : "text-sm text-danger"}>{state.ok ? "Correction draft opened. Add counterproof below." : state.error}</p>}
  </form>;
}
export function CorrectionSubmitForm({ logId, requestId, count }: { logId: string; requestId: string; count: number }) {
  const [state, action, pending] = useActionState(correctionAction, null), [uploading, setUploading] = useState(false);
  return <div>
    <ProofUpload logId={logId} endpoint={`/api/corrections/${encodeURIComponent(requestId)}/proofs`} count={count} onBusy={setUploading} />
    <form action={action} className="mt-5 space-y-4 border-t border-rule pt-4" aria-busy={pending}>
      <input type="hidden" name="operation" value="submit" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-muted">Submission freezes this note and counterproof for independent human review. It does not change the publication or hide it.</p>
      <button disabled={pending || uploading || count < 1} className="register-primary w-full">{pending ? "Submitting…" : "Submit private correction"}</button>
      {state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "register-callout text-sm" : "text-sm text-danger"}>{state.ok ? "Submitted for independent review." : state.error}</p>}
    </form>
  </div>;
}
export function CorrectionEvidenceForm({ logId, requestId, activeProofIds, proofs }: { logId: string; requestId: string; activeProofIds: string[]; proofs: { id: string; kind: string; status: string }[] }) {
  const [state, action, pending] = useActionState(correctionAction, null);
  return <form action={action} className="my-5 space-y-4 border-t border-rule pt-4" aria-busy={pending}>
    <input type="hidden" name="operation" value="select" /><input type="hidden" name="logId" value={logId} /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="expectedProofIds" value={JSON.stringify(activeProofIds)} />
    <fieldset disabled={pending} className="min-w-0 space-y-3 text-sm">
      <legend className="register-kicker mb-2">Select up to five counterproofs for the next review</legend>
      <p className="text-muted">Deselect an earlier proof to make room for new evidence. Earlier submitted files and review receipts remain private history; deselection does not erase them.</p>
      {proofs.map((p, index) => <label key={p.id} className="register-choice"><input type="checkbox" name="proofIds" value={p.id} defaultChecked={activeProofIds.includes(p.id)} className="mt-0.5 size-4 shrink-0" /><span>Counterproof {index + 1}: {p.kind} · {p.status}</span></label>)}
      <button className="register-secondary w-full" disabled={pending}>{pending ? "Saving…" : "Save evidence selection"}</button>
    </fieldset>
    {state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "register-callout text-sm" : "text-sm text-danger"}>{state.ok ? "Evidence selection saved." : state.error}</p>}
  </form>;
}
