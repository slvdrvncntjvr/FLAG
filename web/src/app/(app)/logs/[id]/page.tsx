import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadPrivateLog } from "@/server/db/queries/logs";
import { DraftWorkspace, ProofList } from "@/features/logs/forms";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";

export const metadata: Metadata = { title: "Private engagement log" };
export const dynamic = "force-dynamic";

export default async function PrivateLogPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrRedirect();
  const { id } = await params;
  const log = await loadPrivateLog(await getDb(), viewer.id, id);
  if (!log) notFound();
  const canEdit = log.canEdit && await isPrivateIntakeEnabled();
  return <>
    <Link href="/engagements" className="underline">Back to engagements</Link>
    <h1 className="mt-4 font-serif text-2xl">Private engagement log</h1>
    <p className="mt-3 font-mono">{log.ref}</p>
    <p className="mt-2 break-words">{log.title}</p>
    <p className="mt-2">Status: <strong>{log.status === "pending" ? "Pending" : log.status === "draft" ? "Draft" : log.status}</strong></p>
    <p className="mt-4">Available only to the filer, named client and moderators.</p>
    {log.status === "pending" && <div role="status" className="mt-6 space-y-2 border-y border-rule py-4"><p>Submitted. Awaiting human log review.</p><p>This log is private and has not been published.</p>{log.firstSubmittedAt && <p className="font-mono text-sm">First submitted: {log.firstSubmittedAt}</p>}</div>}
    {log.status === "ask_changes" && <p role="status" className="mt-6">A moderator requested changes. Save a revised draft before adding proof or resubmitting. Your original filing date and anchor stay fixed.</p>}
    {["published", "hidden", "withdrawn"].includes(log.status) && <nav aria-label="Private log requests" className="mt-6 flex flex-wrap gap-5"><Link className="underline" href={`/logs/${log.id}/correction`}>Private correction history</Link>{viewer.role === "freelancer" && <Link className="underline" href={`/logs/${log.id}/update`}>Propose a dated update</Link>}</nav>}
    {!!log.reviewHistory.length && <section className="mt-6"><h2 className="font-serif text-xl">Private review decisions</h2><ol className="divide-y divide-rule">{log.reviewHistory.map((round, index) => <li key={index} className="py-3"><p>{round.decision.replaceAll("_", " ")} · <time>{round.decidedAt}</time></p><p className="whitespace-pre-wrap break-words">{round.reason}</p></li>)}</ol></section>}
    {canEdit ? <DraftWorkspace log={log} /> : <>
      <dl className="mt-6 space-y-4 border-y border-rule py-4">
        <div><dt className="text-muted">Filing anchor</dt><dd className="font-mono">{log.anchorKind.replaceAll("_", " ")} · {log.anchorDate}</dd></div>
        <div><dt className="text-muted">Covered work period</dt><dd className="font-mono">{log.periodStart} – {log.periodEnd}</dd></div>
        <div><dt className="text-muted">Rating and derived outcome</dt><dd>{log.rating}/5 · {log.outcome === "positive" ? "✓ Positive" : log.outcome === "mixed" ? "~ Mixed" : "! Negative"}</dd></div>
        <div><dt className="text-muted">Factual tags</dt><dd>{log.tags.join(", ")}</dd></div>
        {log.amountCentavos !== null && <div><dt className="text-muted">Amount in centavos</dt><dd className="font-mono">{log.amountCentavos.toLocaleString("en-US")}</dd></div>}
        <div><dt className="text-muted">Written facts</dt><dd className="mt-1 whitespace-pre-wrap break-words">{log.facts}</dd></div>
      </dl>
      <ProofList log={log} />
    </>}
  </>;
}
