import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegisterIcon } from "@/components/register-icon";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadOwnEngagements } from "@/server/db/queries/engagements";
import { loadOwnPrivateLogLinks } from "@/server/db/queries/logs";
import { CancelInviteForm, CreateEngagementForm } from "@/features/engagements/forms";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";

export const metadata: Metadata = { title: "Engagements" };
export const dynamic = "force-dynamic";
export default async function Engagements({ searchParams }: { searchParams: Promise<{ response?: string | string[] }> }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "freelancer" && viewer.role !== "client") notFound();
  const db = await getDb();
  const [rows, logLinks] = await Promise.all([loadOwnEngagements(db, viewer.id), loadOwnPrivateLogLinks(db, viewer.id)]);
  const logs = new Map(logLinks.map(log => [log.engagementId, log.id]));
  const intakeEnabled = await isPrivateIntakeEnabled();
  const canInvite = viewer.role === "freelancer" && viewer.freelancerStatus === "verified";
  const { response } = await searchParams;
  return <div className="space-y-6">
    <RegisterPageHeading title="Your engagements" label="Private register" id="engagements-heading"
      action={canInvite && <a href="#new-engagement" className="register-primary text-sm"><RegisterIcon name="plus" /> New engagement</a>} />
    <div className={viewer.role === "freelancer" ? "register-detail-grid register-detail-grid--wide-first" : "max-w-3xl"}>
    <section aria-labelledby="engagements-heading">
      {viewer.role === "client" && (response === "accepted" || response === "declined") && <p role="status" className="register-callout mb-4 text-sm">Review your engagements below.</p>}
      {rows.length === 0 ? <p className="register-empty text-sm"><RegisterIcon name="engagements" /> No engagements yet.</p> : <ul className="register-ledger divide-y divide-rule">
        {rows.map(row => {
          const logId = logs.get(row.id);
          const initials = row.title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
          const accepted = row.status === "accepted";
          const invited = row.status === "invited";
          return <li key={row.id} className="flex items-start gap-3 py-4">
            <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-sm font-mono text-sm font-medium ${accepted ? "bg-coupon text-accent" : invited ? "bg-accent text-paper" : "bg-sand text-ink"}`}>{initials}</span>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
              <h2 className="text-lg leading-tight">{row.title}</h2>
              <p className={`text-right text-[0.6875rem] font-semibold tracking-[0.08em] uppercase ${accepted ? "text-accent" : row.status === "declined" ? "text-danger" : "text-ink"}`}>{row.status === "declined" ? "Invitation closed" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}</p>
              <p className="col-span-full pt-1 text-sm text-muted">Start date: <time dateTime={row.startedOn}>{row.startedOn}</time></p>
              {accepted && <p className="col-span-full mt-1 text-xs text-muted">{row.consentAt ? `Consent recorded ${row.consentAt}; version ${row.consentVersion}.` : "The original engagement-specific consent receipt was not retained."}</p>}
              {logId ? <Link className="register-secondary col-span-full mt-3 justify-self-start text-sm" href={`/logs/${logId}`}>View private log</Link> : intakeEnabled && canInvite && accepted && <Link className="register-primary col-span-full mt-3 justify-self-start text-sm" href={`/engagements/${row.id}/log`}>Create private log</Link>}
              {viewer.role === "freelancer" && invited && <CancelInviteForm id={row.id} />}
            </div>
          </li>;
        })}
      </ul>}
      <p className="mt-4 max-w-prose text-sm text-muted">{intakeEnabled ? "An engagement can be logged only after the client accepts it. Private intake saves a draft and submits it as pending; publication is not available here." : "Private log intake is not available. Existing private logs remain available to their parties."}</p>
    </section>
    {viewer.role === "freelancer" && (canInvite ? <CreateEngagementForm /> : <div className="register-callout text-sm">
      <p className="font-semibold">Complete freelancer verification before inviting a client.</p>
      <Link href="/verification" className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-4">Open verification <RegisterIcon name="arrow" /></Link>
    </div>)}
    </div>
  </div>;
}
