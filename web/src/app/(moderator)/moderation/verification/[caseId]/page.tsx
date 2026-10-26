import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadVerificationReview } from "@/server/db/queries/verification";
import { ClaimReviewForm, ReviewerForms } from "@/features/moderation/review-forms";
import { ReadFailure, ReloadStatus } from "@/features/verification/action-feedback";
import { SubmittedProfile, RecordValue } from "@/features/verification/status";

export const metadata: Metadata = { title: "Verification review", robots: { index: false, follow: false } };

export default async function VerificationReview({ params }: { params: Promise<{ caseId: string }> }) {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "moderator") notFound();
  const { caseId } = await params;
  const detail = await getDb().then(db => loadVerificationReview(db, viewer.id, caseId)).catch(() => undefined);
  if (detail === undefined) return <><h1 className="font-serif text-2xl">Verification review</h1><ReadFailure /></>;
  if (!detail) notFound();
  const { request, review, claimActive: active } = detail;
  const mine = active && review.claimedBy === viewer.id;
  const canApprove = mine && request.reviewerId === viewer.id && !!request.inspectedAt && request.result === "pass" && request.nameMatch === true;
  return <>
    <h1 className="font-serif text-2xl">Verification review</h1>
    <SubmittedProfile submitted={detail.submittedProfile} current={detail.currentProfile} />
    <dl className="mt-6 border-b border-rule">
      <RecordValue label="Review status">{review.status === "decided" ? "Decided" : mine ? "Claimed by you" : active ? "Claimed by another moderator" : "Available to claim"}</RecordValue>
      {active && review.claimedUntil && <RecordValue label="Claim expires (UTC)"><time className="font-mono" dateTime={review.claimedUntil}>{review.claimedUntil}</time></RecordValue>}
      <RecordValue label="Live inspection">{request.inspectedAt ? `${request.result === "pass" ? "Pass" : "Fail"}; name ${request.nameMatch ? "matches" : "does not match"}; ${request.idKind}; ${request.inspectedAt}${request.reviewerId !== viewer.id && review.status !== "decided" ? ". Recorded by another moderator; a new claimant must inspect again." : ""}` : "Not recorded"}</RecordValue>
      {request.decision && <RecordValue label="Decision">{request.decision === "approve" ? "Approved — identity checked" : "Rejected"}</RecordValue>}
      {request.reason && <RecordValue label="Reason">{request.reason}</RecordValue>}
    </dl>
    {review.status !== "decided" && (mine && review.claimedUntil
      ? <ReviewerForms key={review.claimedUntil} caseId={review.id} expectedClaimUntil={review.claimedUntil} canApprove={canApprove} />
      : active ? <div className="mt-6 space-y-3"><p>Another moderator holds the current claim. Reload after release or expiry.</p><ReloadStatus /></div> : <ClaimReviewForm key={review.status + (review.claimedUntil ?? "")} caseId={review.id} />)}
    <section className="mt-8 space-y-3"><h2 className="font-medium">Review history</h2>
      {detail.history.length ? <ol className="space-y-3">{detail.history.map(event => <li key={event.id} className="min-w-0 border-t border-rule pt-3 text-sm [overflow-wrap:anywhere]"><p>{event.action.replaceAll("_", " ")}</p><p className="font-mono"><time dateTime={event.createdAt}>{event.createdAt}</time></p><p className="text-muted">Actor reference: {event.actorId ?? "System"}</p></li>)}</ol> : <p>No review events are available.</p>}
    </section>
  </>;
}
