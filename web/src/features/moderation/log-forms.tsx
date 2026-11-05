"use client";
import { useActionState, useEffect, useState } from "react";
import { logReviewAction } from "./log-actions";
import { type LogResult } from "@/features/logs/schema";
import { RevisionFields, type FieldValues } from "@/features/updates/fields";
const field = "mt-1 block w-full rounded-sm border border-rule bg-white p-3";
const button = "min-h-11 rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60";
type Proof = { id: string; sha256: string; mime: string; size_bytes: number; kind: string };
function Feedback({ state }: { state: LogResult | null }) { return state && <p role={state.ok ? "status" : "alert"}>{state.ok ? "Saved. Reload to see the current case." : state.error}</p>; }
export function CaseLeaseForm({ caseId, lease }: { caseId: string; lease?: string }) {
  const [state, action, pending] = useActionState(logReviewAction, null);
  return <form action={action} className="my-6 space-y-3" aria-busy={pending}><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="operation" value={lease ? "release" : "claim"} />{lease && <input type="hidden" name="expectedClaimUntil" value={lease} />}
    <button disabled={pending} className={button}>{pending ? "Saving…" : lease ? "Release claim" : "Claim for 30 minutes"}</button><Feedback state={state} /></form>;
}
export function LogDecisionForm({ caseId, lease, revisionId, currentRevisionId, requestId, proofs, fields }: { caseId: string; lease: string; revisionId: string; currentRevisionId: string | null; requestId?: string; proofs: Proof[]; fields: FieldValues }) {
  const [decision, setDecision] = useState("");
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [state, action, pending] = useActionState(async (_: LogResult | null, form: FormData) => {
    const verdicts = proofs.map(p => ({ proofId: p.id, sha256: p.sha256, viewToken: receipts[p.id] ?? "", verdict: form.get(`verdict-${p.id}`), reason: form.get(`proofReason-${p.id}`) }));
    for (const p of proofs) { form.delete(`verdict-${p.id}`); form.delete(`proofReason-${p.id}`); }
    form.delete("personallyViewed");
    if (decision === "correct") {
      form.set("fields", JSON.stringify({ rating: Number(form.get("rating")), tags: form.getAll("tags"), facts: form.get("facts"), periodStart: form.get("periodStart"), periodEnd: form.get("periodEnd"), amountCentavos: form.get("amountCentavos") === "" ? null : Number(form.get("amountCentavos")) }));
      for (const key of ["rating", "tags", "facts", "periodStart", "periodEnd", "amountCentavos"]) form.delete(key);
    }
    form.set("proofVerdicts", JSON.stringify(verdicts));
    try { return await logReviewAction(null, form); } catch { return { ok: false, code: "unavailable", error: "Could not record this decision. Reload before retrying." } as const; }
  }, null);
  async function open(p: Proof) {
    setOpening(p.id); setOpenError("");
    const target = window.open("about:blank", "_blank");
    try {
      const query = new URLSearchParams({ caseId, revisionId, expectedClaimUntil: lease });
      const response = await fetch(`/api/moderation/proofs/${encodeURIComponent(p.id)}?${query}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const token = response.headers.get("X-FLAG-Proof-View");
      if (!response.ok || !token) throw new Error("Proof is unavailable or the claim changed. Reload and claim again.");
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      if (!target) throw new Error("Allow this page to open the proof, then try again.");
      target.opener = null; target.location.href = url;
      setReceipts(old => ({ ...old, [p.id]: token }));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { target?.close(); setOpenError(error instanceof Error ? error.message : "Could not open proof."); }
    finally { setOpening(null); }
  }
  const [expired, setExpired] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(lease) - Date.now())); return () => clearTimeout(timer); }, [lease]);
  return <form action={action} className="space-y-6 border-t border-rule pt-6" aria-busy={pending}>
    <input type="hidden" name="operation" value={requestId ? "correction" : "log"} /><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="expectedClaimUntil" value={lease} /><input type="hidden" name="revisionId" value={revisionId} /><input type="hidden" name="expectedCurrentRevisionId" value={currentRevisionId ?? ""} />{requestId && <input type="hidden" name="requestId" value={requestId} />}
    <h2 className="font-serif text-2xl">Review every proof</h2><p>Check the agreed client and engagement, the claimed event and filing anchor, and whether the rating is supported. Edited or unverifiable material, opinions alone, and one-sided material without client interaction are insufficient.</p>
    {openError && <p role="alert">{openError}</p>}
    <fieldset disabled={pending || expired} className="min-w-0 space-y-5"><legend className="sr-only">Evidence verdicts and decision</legend>
      {proofs.map((p, index) => <fieldset key={p.id} className="min-w-0 space-y-3 border-y border-rule py-4"><legend>Proof {index + 1}: {p.kind} ({p.mime}, {p.size_bytes.toLocaleString("en-US")} bytes)</legend>
        <button type="button" disabled={!!opening} onClick={() => open(p)} className="min-h-11 underline">{opening === p.id ? "Opening…" : "Open exact proof"}</button>{receipts[p.id] && <p role="status">Proof retrieved for this claim. Review it before recording your verdict.</p>}
        <label className="block">Your evidence verdict<select name={`verdict-${p.id}`} required disabled={!receipts[p.id]} defaultValue="" className={field}><option value="" disabled>Choose verdict</option><option value="accept">Accepted: supports the claim</option><option value="unclear">Unclear: needs changes</option><option value="reject">Rejected: does not support the claim</option></select></label>
        <label className="block">Private proof reason<textarea name={`proofReason-${p.id}`} required maxLength={1000} rows={2} className={field} /></label>
      </fieldset>)}
      <label className="block">Decision<select name="decision" required value={decision} onChange={e => setDecision(e.target.value)} className={field}><option value="" disabled>Choose decision</option>{(requestId ? [["uphold", "Uphold the publication"], ["ask_changes", "Ask for more evidence"], ["correct", "Correct the publication"], ["withdraw", "Withdraw the publication"]] : [["approve", "Approve publication"], ["ask_changes", "Ask for changes"], ["reject", "Reject proposal"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {decision === "correct" && <RevisionFields value={fields} />}
      <label className="block">Private decision reason<textarea name="reason" required maxLength={1000} rows={4} className={field} /></label>
      <label className="flex min-h-11 items-start gap-3"><input name="personallyViewed" type="checkbox" required className="mt-1" /><span>I personally viewed every proof and assessed the evidence and any new factual item. My decision concerns the documented facts; opinion disagreement alone is not cause for removal.</span></label>
      <p>Reasons remain in the private case. Never transcribe government ID details.</p>
      <button disabled={pending || !!opening || proofs.some(p => !receipts[p.id]) || !proofs.length} className={`${button} w-full`}>{pending ? "Recording…" : "Record human decision"}</button>
    </fieldset><Feedback state={state} />{expired && <p role="alert">This claim expired. Reload and claim again.</p>}
  </form>;
}
export function RiskHideForm({ caseId, lease, requestId, currentRevisionId }: { caseId: string; lease: string; requestId: string; currentRevisionId: string }) {
  const [state, action, pending] = useActionState(logReviewAction, null);
  return <form action={action} className="my-8 space-y-3 border-y border-rule py-5" aria-busy={pending}><input type="hidden" name="operation" value="hide" /><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="expectedClaimUntil" value={lease} /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="expectedCurrentRevisionId" value={currentRevisionId} />
    <h2 className="font-serif text-xl">Temporary risk hiding</h2><p>Use only for credible factual error or privacy risk. A request or opinion disagreement alone does not justify hiding. This never extends retention.</p>
    <label className="block">Credible risk<select name="riskKind" required defaultValue="" className={field}><option value="" disabled>Choose risk</option><option value="factual_error">Factual error</option><option value="privacy_risk">Privacy risk</option></select></label>
    <label className="block">Private factual grounds<textarea name="reason" required maxLength={1000} className={field} /></label><button disabled={pending} className={button}>Temporarily hide publication</button><Feedback state={state} />
  </form>;
}
