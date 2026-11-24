import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadCorrections } from "@/server/db/queries/corrections";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { CorrectionOpenForm, CorrectionSubmitForm, CorrectionEvidenceForm } from "@/features/corrections/forms";
import { RemoveProposalProof } from "@/features/updates/remove-form";
export const dynamic = "force-dynamic";
export default async function CorrectionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireOnboardedViewer(), { id } = await params;
  const data = await loadCorrections(await getDb(), viewer.id, id);
  if (!data) notFound();
  const enabled = await isPrivateIntakeEnabled(), open = data.requests.some(r => ["draft", "submitted", "ask_changes"].includes(r.status));
  return <div className="register-narrow">
    <Link href={`/logs/${id}`} className="text-sm text-accent underline underline-offset-4">Back to private log</Link>
    <h1 className="mt-4 font-serif text-2xl">Private correction history</h1>
    <p className="mt-2 font-mono text-sm text-muted">{data.log.ref}</p>
    <p className="register-ledger mt-3 py-3 text-sm text-muted">Only participants and moderators can read these requests, evidence and reasons. Corrections require an independent moderator; clients cannot edit a publication.</p>
    {!enabled && <p role="status" className="register-callout mt-5 text-sm">Private intake is currently unavailable.</p>}
    {enabled && data.canRequest && !open && <CorrectionOpenForm logId={id} />}
    {data.requests.length ? <div className="mt-6 divide-y divide-rule">{data.requests.map(r => {
      const proofs = data.proofs.filter(p => p.correction_request_id === r.id), activeProofIds: string[] = JSON.parse(r.active_proof_ids);
      return <section key={r.id} className="space-y-4 py-4">
        <div className="space-y-1">
          <h2 className="font-serif text-xl">Request · {r.status.replaceAll("_", " ")}</h2>
          <p className="text-sm text-muted"><time dateTime={r.created_at}>{r.created_at}</time></p>
        </div>
        <p className="register-panel whitespace-pre-wrap text-sm">{r.new_evidence_note}</p>
        {!!proofs.length && <ul className="register-ledger divide-y divide-rule text-sm">{proofs.map((p, index) => <li key={p.id} className="py-2"><a href={`/api/proofs/${p.id}`} className="inline-block min-h-11 py-3 text-accent underline underline-offset-4">Private counterproof {index + 1}: {p.kind} ({p.mime}, {p.size_bytes} bytes) · {activeProofIds.includes(p.id) ? "Selected" : "Private history"}</a>{enabled && data.canRequest && p.status === "uploading" && <RemoveProposalProof logId={id} proofId={p.id} />}</li>)}</ul>}
        {data.rounds.filter(round => round.correction_request_id === r.id).map(round => <div key={round.round_no} className="register-panel space-y-2 text-sm"><p className="font-medium">Round {round.round_no}: {round.decision.replaceAll("_", " ")} · <time dateTime={round.decided_at} className="text-muted">{round.decided_at}</time></p><p className="whitespace-pre-wrap">{round.reason}</p></div>)}
        {enabled && data.canRequest && ["draft", "ask_changes"].includes(r.status) && <><CorrectionEvidenceForm key={r.active_proof_ids} logId={id} requestId={r.id} activeProofIds={activeProofIds} proofs={proofs} /><CorrectionSubmitForm logId={id} requestId={r.id} count={activeProofIds.length} /></>}
      </section>;
    })}</div> : <p className="mt-6 text-sm text-muted">No private correction requests.</p>}
  </div>;
}
