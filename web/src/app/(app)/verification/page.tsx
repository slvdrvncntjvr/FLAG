import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadVerificationStatus } from "@/server/db/queries/verification";
import { ReadFailure, ReloadStatus } from "@/features/verification/action-feedback";
import { VerificationRequestForm } from "@/features/verification/request-form";
import { PortfolioLinks, RecordValue, verificationStage } from "@/features/verification/status";

export const metadata: Metadata = { title: "Verification", robots: { index: false, follow: false } };

export default async function VerificationPage() {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "freelancer") notFound();
  const data = await getDb().then(db => loadVerificationStatus(db, viewer.id)).catch(() => undefined);
  if (data === undefined) return <><h1 className="font-serif text-2xl">Verification</h1><ReadFailure /></>;
  if (!data) notFound();
  const canRequest = (!data.profile || ["unverified", "rejected"].includes(data.profile.status)) && (!data.latest || !!data.latest.request.decidedAt);
  return <>
    <h1 className="font-serif text-2xl">Verification</h1>
    <p className="mt-4">Verification means your identity has been checked. It does not guarantee trustworthiness.</p>
    <dl className="mt-6 border-b border-rule">
      <RecordValue label="Status">{verificationStage(data)}</RecordValue>
      {data.profile && <><RecordValue label="Account/profile name">{data.profile.displayName}</RecordValue><RecordValue label="City">{data.profile.city || "Not provided"}</RecordValue></>}
      {data.latest?.request.reason && <RecordValue label="Review reason">{data.latest.request.reason}</RecordValue>}
      {data.latest?.request.decidedAt && <RecordValue label="Decision recorded"><time className="font-mono" dateTime={data.latest.request.decidedAt}>{data.latest.request.decidedAt}</time></RecordValue>}
    </dl>
    {!!data.portfolioLinks.length && <section className="mt-6 space-y-3"><h2 className="font-medium">Submitted portfolio</h2><PortfolioLinks links={data.portfolioLinks} /></section>}
    {canRequest ? <VerificationRequestForm name={data.profile?.displayName ?? ""} city={data.profile?.city ?? ""} links={data.portfolioLinks.map(link => ({ url: link.url, label: link.label ?? "" }))} />
      : <div className="mt-6 space-y-3"><p>{data.profile?.status === "verified" ? "Identity check approved. Engagement and log features are separate releases." : "Your request and profile cannot be edited here. Reload to check for a review update."}</p><ReloadStatus /></div>}
  </>;
}
