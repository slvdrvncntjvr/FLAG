import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadPrivateLog } from "@/server/db/queries/logs";
import { DraftWorkspace, ProofList } from "@/features/logs/forms";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { RegisterIcon } from "@/components/register-icon";

export const metadata: Metadata = { title: "Private engagement log" };
export const dynamic = "force-dynamic";

export default async function PrivateLogPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrRedirect();
  const { id } = await params;
  const log = await loadPrivateLog(await getDb(), viewer.id, id);
  if (!log) notFound();
  const canEdit = log.canEdit && await isPrivateIntakeEnabled();
  return <div className="register-narrow">
    <Link href="/engagements" className="mb-4 inline-flex text-sm text-accent underline underline-offset-4">Back to engagements</Link>
    <RegisterPageHeading title="Private engagement log" label={log.ref}
      action={<p className="register-status">Status: {log.status === "pending" ? "Pending" : log.status === "draft" ? "Draft" : log.status.replaceAll("_", " ")}</p>}>
      <p className="font-semibold">{log.title}</p>
    </RegisterPageHeading>
    <p className="register-callout flex items-start gap-2 text-sm"><RegisterIcon name="lock" /> Available only to the filer, named client and moderators.</p>
    {log.status === "pending" && <div role="status" className="register-callout mt-5 space-y-2 text-sm"><p className="font-semibold">Submitted. Awaiting human log review.</p><p>This log is private and has not been published.</p>{log.firstSubmittedAt && <p className="font-mono text-xs">First submitted: {log.firstSubmittedAt}</p>}</div>}
    {log.status === "ask_changes" && <p role="status" className="register-callout mt-5 text-sm">A moderator requested changes. Save a revised draft before adding proof or resubmitting. Your original filing date and anchor stay fixed.</p>}
    {["published", "hidden", "withdrawn"].includes(log.status) && <nav aria-label="Private log requests" className="mt-5 flex flex-wrap gap-3"><Link className="register-secondary text-sm" href={`/logs/${log.id}/correction`}>Private correction history</Link>{viewer.role === "freelancer" && <Link className="register-secondary text-sm" href={`/logs/${log.id}/update`}>Propose a dated update</Link>}</nav>}
    {!!log.reviewHistory.length && <section className="mt-6">
      <h2 className="mb-2 font-serif text-xl">Private review decisions</h2>
      <ol className="register-ledger divide-y divide-rule">{log.reviewHistory.map((round, index) => <li key={index} className="space-y-1 py-3 text-sm"><p className="font-medium">{round.decision.replaceAll("_", " ")} · <time className="text-muted" dateTime={round.decidedAt}>{round.decidedAt}</time></p><p className="whitespace-pre-wrap">{round.reason}</p></li>)}</ol>
    </section>}
    {canEdit ? <DraftWorkspace log={log} /> : <>
      <dl className="register-ledger mt-6 divide-y divide-rule text-sm [&>div]:space-y-1 [&>div]:py-3">
        <div><dt className="register-kicker">Filing anchor</dt><dd>{log.anchorKind.replaceAll("_", " ")} · <time dateTime={log.anchorDate}>{log.anchorDate}</time></dd></div>
        <div><dt className="register-kicker">Covered work period</dt><dd><time dateTime={log.periodStart}>{log.periodStart}</time> – <time dateTime={log.periodEnd}>{log.periodEnd}</time></dd></div>
        <div><dt className="register-kicker">Rating and derived outcome</dt><dd className="font-semibold">{log.rating}/5 · {log.outcome === "positive" ? "✓ Positive" : log.outcome === "mixed" ? "~ Mixed" : "! Negative"}</dd></div>
        <div><dt className="register-kicker">Factual tags</dt><dd>{log.tags.join(", ")}</dd></div>
        {log.amountCentavos !== null && <div><dt className="register-kicker">Amount in centavos</dt><dd>{log.amountCentavos.toLocaleString("en-US")}</dd></div>}
        <div><dt className="register-kicker">Written facts</dt><dd className="whitespace-pre-wrap">{log.facts}</dd></div>
      </dl>
      <ProofList log={log} />
    </>}
  </div>;
}
