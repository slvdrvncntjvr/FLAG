import type { Metadata } from "next";
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
  const { response } = await searchParams;
  return <>
    <h1 className="font-serif text-2xl">Engagements</h1>
    {/* Informational post-action feedback only; the query never grants access,
        associates profiles or supplies consent evidence for the rows below. */}
    {viewer.role === "client" && (response === "accepted" || response === "declined") && <p role="status" className="mt-4 border-y border-rule py-4">
      Review your engagements below.
    </p>}
    <p className="mt-2 text-sm">{intakeEnabled ? "An engagement can be logged only after the client accepts it. Private intake saves a draft and submits it as pending; publication is not available here." : "Private log intake is not available. Existing private logs remain available to their parties."}</p>
    {viewer.role === "freelancer" && (viewer.freelancerStatus === "verified" ? <CreateEngagementForm /> : <p className="mt-6">Complete freelancer verification before inviting a client.</p>)}
    <section className="mt-8 border-t border-rule pt-6" aria-label="Your engagements">
      <h2 className="font-serif text-2xl">Your engagements</h2>
      {rows.length === 0 && <p className="mt-4">No engagements yet.</p>}
      <ul className="mt-4 divide-y divide-rule">{rows.map(row => <li key={row.id} className="py-4 break-words">
        <h3 className="font-medium">{row.title}</h3>
        <p className="mt-1 text-sm">Start date: <time className="font-mono">{row.startedOn}</time></p>
        <p className="mt-1 text-sm">{row.status === "declined" ? "Invitation closed" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}</p>
        {row.status === "accepted" && <p className="mt-1 text-sm">{row.consentAt ? `Consent recorded ${row.consentAt}; version ${row.consentVersion}.` : "The original engagement-specific consent receipt was not retained."}</p>}
        {logs.has(row.id) ? <Link className="mt-3 inline-block py-2 underline" href={`/logs/${logs.get(row.id)}`}>View private log</Link> : intakeEnabled && viewer.role === "freelancer" && viewer.freelancerStatus === "verified" && row.status === "accepted" && <Link className="mt-3 inline-block py-2 underline" href={`/engagements/${row.id}/log`}>Create private log</Link>}
        {viewer.role === "freelancer" && row.status === "invited" && <CancelInviteForm id={row.id} />}
      </li>)}</ul>
    </section>
  </>;
}
