import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  return <div className="register-narrow space-y-6">
    <section aria-labelledby="engagements-heading">
      <div className="flex items-center justify-between gap-4 pb-3">
        <h1 id="engagements-heading" className="font-serif text-2xl">Your engagements</h1>
        {canInvite && <a href="#new-engagement" aria-label="New engagement" className="grid size-14 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-coupon shadow-[0_3px_0_var(--ink)] hover:bg-tint"><Image src="/register/new-engagement.svg" alt="" width={28} height={28} unoptimized /></a>}
      </div>
      {viewer.role === "client" && (response === "accepted" || response === "declined") && <p role="status" className="register-callout mb-4 text-sm">Review your engagements below.</p>}
      {rows.length === 0 ? <p className="register-ledger py-4 text-sm text-muted">No engagements yet.</p> : <ul className="register-ledger divide-y divide-rule">
        {rows.map(row => {
          const logId = logs.get(row.id);
          const initials = row.title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
          const accepted = row.status === "accepted";
          const invited = row.status === "invited";
          return <li key={row.id} className="flex items-start gap-3 py-4">
            <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium ${accepted ? "bg-coupon text-accent" : invited ? "bg-accent text-paper" : "bg-sand text-ink"}`}>{initials}</span>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
              <h2 className="font-serif text-lg leading-tight">{row.title}</h2>
              <p className={`text-right text-[0.6875rem] font-semibold tracking-[0.08em] uppercase ${accepted ? "text-accent" : row.status === "declined" ? "text-danger" : "text-ink"}`}>{row.status === "declined" ? "Invitation closed" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}</p>
              <p className="col-span-full pt-1 text-sm text-muted">Start date: <time dateTime={row.startedOn}>{row.startedOn}</time></p>
              {accepted && <p className="col-span-full mt-1 text-xs text-muted">{row.consentAt ? `Consent recorded ${row.consentAt}; version ${row.consentVersion}.` : "The original engagement-specific consent receipt was not retained."}</p>}
              {logId ? <Link className="col-span-full mt-3 justify-self-start py-2 text-sm font-semibold text-accent underline underline-offset-4" href={`/logs/${logId}`}>View private log</Link> : intakeEnabled && canInvite && accepted && <Link className="register-primary col-span-full mt-3 w-full text-sm" href={`/engagements/${row.id}/log`}>Create private log</Link>}
              {viewer.role === "freelancer" && invited && <CancelInviteForm id={row.id} />}
            </div>
          </li>;
        })}
      </ul>}
    </section>
    <p className="text-sm text-muted">{intakeEnabled ? "An engagement can be logged only after the client accepts it. Private intake saves a draft and submits it as pending; publication is not available here." : "Private log intake is not available. Existing private logs remain available to their parties."}</p>
    {viewer.role === "freelancer" && (canInvite ? <CreateEngagementForm /> : <p className="register-callout text-sm">Complete freelancer verification before inviting a client.</p>)}
  </div>;
}
