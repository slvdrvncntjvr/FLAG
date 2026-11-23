import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadVerificationQueue } from "@/server/db/queries/verification";
import { ReadFailure, ReloadStatus } from "@/features/verification/action-feedback";

export const metadata: Metadata = { title: "Verification queue", robots: { index: false, follow: false } };

export default async function VerificationQueue() {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "moderator") notFound();
  const queue = await getDb().then(db => loadVerificationQueue(db, viewer.id)).catch(() => null);
  return <>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="font-serif text-2xl">Verification queue</h1>
      {queue && <p className="register-kicker">{queue.length} awaiting review</p>}
    </header>
    <p className="mt-2 text-sm text-muted">Review identity requests. Verification means identity checked, not a guarantee of trustworthiness.</p>
    <p className="mt-3 text-sm text-muted">Oldest requests first. Waiting time is calculated on the server when this queue loads. Reload for an update.</p>
    {queue === null ? <ReadFailure /> : queue.length === 0 ? <p className="register-panel mt-6 text-sm text-muted">No verification requests are awaiting review.</p> : <ul className="register-ledger mt-4 divide-y divide-rule">{queue.map(({ request, review, profile, claimActive: active, waitingHours, overdue }) => (
      <li key={review.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Link className="block py-2 font-semibold text-accent underline-offset-4 hover:underline" href={`/moderation/verification/${encodeURIComponent(review.id)}`}>{profile.displayName}</Link>
          <p className="text-sm text-muted">Submitted <time className="font-mono" dateTime={request.createdAt}>{request.createdAt}</time></p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="text-muted">{active ? review.claimedBy === viewer.id ? "Claimed by you" : "Claimed by another moderator" : "Available to claim"}</p>
          <p>Waiting {waitingHours} {waitingHours === 1 ? "hour" : "hours"}</p>
          {overdue && <p className="font-medium text-danger">Overdue — waiting more than 36 hours</p>}
        </div>
      </li>
    ))}</ul>}
    <div className="mt-4"><ReloadStatus /></div>
  </>;
}
