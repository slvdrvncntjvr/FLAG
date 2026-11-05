import Link from "next/link";
import { notFound } from "next/navigation";
import { requireVerifiedFreelancer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadFilerProposal } from "@/server/db/queries/proposals";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { UpdateWorkspace } from "@/features/updates/forms";
export const dynamic = "force-dynamic";
export default async function UpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireVerifiedFreelancer(), { id } = await params;
  const data = await loadFilerProposal(await getDb(), viewer.id, id);
  if (!data) notFound();
  const { log, revision: r } = data;
  return <><Link href={`/logs/${id}`} className="underline">Back to private log</Link><h1 className="mt-5 font-serif text-3xl">Propose a dated update</h1><p className="mt-3 font-mono">{log.ref}</p><p className="mt-4">The original publication and twelve-month expiry stay fixed. Your proposal appears to record readers only after moderator approval.</p>
    {!await isPrivateIntakeEnabled() ? <p role="status" className="mt-6">Private intake is currently unavailable.</p> : data.pending && data.pending.status !== "awaiting_changes" ? <p role="status" className="mt-6">Your update is awaiting human review. Its submitted content is frozen.</p> : <UpdateWorkspace key={r?.id ?? "new"} logId={id} currentRevisionId={log.revisionId} revisionId={r?.id} previousEffectiveOn={data.previousEffectiveOn} effectiveOn={r?.effective_on ?? undefined} proofs={data.proofs} uploading={data.uploading}
      value={r ? { rating: r.rating, facts: r.facts, tags: data.tags, periodStart: r.period_start, periodEnd: r.period_end, amountCentavos: r.amount_centavos } : { rating: log.rating, facts: log.facts, tags: log.tags, periodStart: log.periodStart, periodEnd: log.periodEnd, amountCentavos: log.amountCentavos }} />}</>;
}
