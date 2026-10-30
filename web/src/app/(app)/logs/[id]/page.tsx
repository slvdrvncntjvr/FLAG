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
    {log.status === "pending" && <div role="status" className="mt-6 space-y-2 border-y border-rule py-4"><p>Submitted. Awaiting log moderation.</p><p>This log is private and has not been published. Log review decisions are not available in this version.</p>{log.firstSubmittedAt && <p className="font-mono text-sm">First submitted: {log.firstSubmittedAt}</p>}</div>}
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
