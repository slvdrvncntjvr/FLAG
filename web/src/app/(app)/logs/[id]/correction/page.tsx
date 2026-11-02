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
  return <><Link href={`/logs/${id}`} className="underline">Back to private log</Link><h1 className="mt-5 font-serif text-3xl">Private correction history</h1><p className="mt-3 font-mono">{data.log.ref}</p><p className="mt-4">Only participants and moderators can read these requests, evidence and reasons. Corrections require an independent moderator; clients cannot edit a publication.</p>
    {!enabled && <p role="status" className="mt-5">Private intake is currently unavailable.</p>}{enabled && data.canRequest && !open && <CorrectionOpenForm logId={id} />}
    <div className="mt-6 divide-y divide-rule">{data.requests.map(r => {
      const proofs = data.proofs.filter(p => p.correction_request_id === r.id), activeProofIds: string[] = JSON.parse(r.active_proof_ids);
      return <section key={r.id} className="space-y-4 py-6"><h2 className="font-serif text-xl">Request · {r.status.replaceAll("_", " ")}</h2><p><time>{r.created_at}</time></p><p className="whitespace-pre-wrap break-words">{r.new_evidence_note}</p>
        <ul>{proofs.map((p, index) => <li key={p.id}><a href={`/api/proofs/${p.id}`} className="inline-block min-h-11 py-3 underline">Private counterproof {index + 1}: {p.kind} ({p.mime}, {p.size_bytes} bytes) · {activeProofIds.includes(p.id) ? "Selected" : "Private history"}</a>{enabled && data.canRequest && p.status === "uploading" && <RemoveProposalProof logId={id} proofId={p.id} />}</li>)}</ul>
        {data.rounds.filter(round => round.correction_request_id === r.id).map(round => <div key={round.round_no}><p>Round {round.round_no}: {round.decision.replaceAll("_", " ")} · <time>{round.decided_at}</time></p><p className="whitespace-pre-wrap break-words">{round.reason}</p></div>)}
        {enabled && data.canRequest && ["draft", "ask_changes"].includes(r.status) && <><CorrectionEvidenceForm key={r.active_proof_ids} logId={id} requestId={r.id} activeProofIds={activeProofIds} proofs={proofs} /><CorrectionSubmitForm logId={id} requestId={r.id} count={activeProofIds.length} /></>}
      </section>;
    })}</div>
    {!data.requests.length && <p className="mt-6">No private correction requests.</p>}</>;
}
