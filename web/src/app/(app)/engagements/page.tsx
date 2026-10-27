import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadOwnEngagements } from "@/server/db/queries/engagements";
import { CancelInviteForm, CreateEngagementForm } from "@/features/engagements/forms";

export const metadata: Metadata = { title: "Engagements" };
export const dynamic = "force-dynamic";
export default async function Engagements({ searchParams }: { searchParams: Promise<{ response?: string | string[] }> }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "freelancer" && viewer.role !== "client") notFound();
  const rows = await loadOwnEngagements(await getDb(), viewer.id);
  const { response } = await searchParams;
  return <>
    <h1 className="font-serif text-2xl">Engagements</h1>
    {/* Informational post-action feedback only; the query never grants access,
        associates profiles or supplies consent evidence for the rows below. */}
    {viewer.role === "client" && (response === "accepted" || response === "declined") && <p role="status" className="mt-4 border-y border-rule py-4">
      Review your engagements below.
    </p>}
    <p className="mt-2 text-sm">An engagement can be logged only after the client accepts it. Logs and publication are not available yet.</p>
    {viewer.role === "freelancer" && (viewer.freelancerStatus === "verified" ? <CreateEngagementForm /> : <p className="mt-6">Complete freelancer verification before inviting a client.</p>)}
    <section className="mt-8 border-t border-rule pt-6" aria-label="Your engagements">
      <h2 className="font-serif text-2xl">Your engagements</h2>
      {rows.length === 0 && <p className="mt-4">No engagements yet.</p>}
      <ul className="mt-4 divide-y divide-rule">{rows.map(row => <li key={row.id} className="py-4 break-words">
        <h3 className="font-medium">{row.title}</h3>
        <p className="mt-1 text-sm">Start date: <time className="font-mono">{row.startedOn}</time></p>
        <p className="mt-1 text-sm">{row.status === "declined" ? "Invitation closed" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}</p>
        {row.status === "accepted" && <p className="mt-1 text-sm">{row.consentAt ? `Consent recorded ${row.consentAt}; version ${row.consentVersion}.` : "The original engagement-specific consent receipt was not retained."}</p>}
        {viewer.role === "freelancer" && row.status === "invited" && <CancelInviteForm id={row.id} />}
      </li>)}</ul>
    </section>
  </>;
}
