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
  return <div className="register-narrow">
    <Link href={`/logs/${id}`} className="text-sm text-accent underline underline-offset-4">Back to private log</Link>
    <h1 className="mt-4 font-serif text-2xl">Propose a dated update</h1>
    <p className="mt-2 text-sm text-muted">{log.title} · <span className="font-mono">{log.ref}</span></p>
    <p className="register-ledger mt-3 py-3 text-sm text-muted">The original publication and twelve-month expiry stay fixed. Your proposal appears to record readers only after moderator approval.</p>
    {!await isPrivateIntakeEnabled() ? <p role="status" className="register-callout mt-5 text-sm">Private intake is currently unavailable.</p> : data.pending && data.pending.status !== "awaiting_changes" ? <p role="status" className="register-callout mt-5 text-sm">Your update is awaiting human review. Its submitted content is frozen.</p> : <UpdateWorkspace key={r?.id ?? "new"} logId={id} currentRevisionId={log.revisionId} revisionId={r?.id} previousEffectiveOn={data.previousEffectiveOn} effectiveOn={r?.effective_on ?? undefined} proofs={data.proofs} uploading={data.uploading}
      value={r ? { rating: r.rating, facts: r.facts, tags: data.tags, periodStart: r.period_start, periodEnd: r.period_end, amountCentavos: r.amount_centavos } : { rating: log.rating, facts: log.facts, tags: log.tags, periodStart: log.periodStart, periodEnd: log.periodEnd, amountCentavos: log.amountCentavos }} />}
  </div>;
}
