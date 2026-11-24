import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadVerificationStatus } from "@/server/db/queries/verification";
import { ReadFailure, ReloadStatus } from "@/features/verification/action-feedback";
import { VerificationRequestForm } from "@/features/verification/request-form";
import { PortfolioLinks, RecordValue, verificationStage } from "@/features/verification/status";
import { RegisterIcon } from "@/components/register-icon";
import { RegisterPageHeading } from "@/components/register-page-heading";

export const metadata: Metadata = { title: "Verification", robots: { index: false, follow: false } };

export default async function VerificationPage() {
  const viewer = await viewerOrRedirect();
  if (viewer.role !== "freelancer") notFound();
  const data = await getDb().then(db => loadVerificationStatus(db, viewer.id)).catch(() => undefined);
  if (data === undefined) return <div className="register-narrow"><RegisterPageHeading title="Verification" /><ReadFailure className="register-panel space-y-2" /></div>;
  if (!data) notFound();
  const canRequest = (!data.profile || ["unverified", "rejected"].includes(data.profile.status)) && (!data.latest || !!data.latest.request.decidedAt);
  return (
    <div className="max-w-5xl">
      <RegisterPageHeading title="Identity verification"
        action={<dl><dt className="sr-only">Status</dt><dd className="register-status">{verificationStage(data)}</dd></dl>} />
      <div className="register-detail-grid">
        <section aria-label="Identity check details">
          <div className="register-callout flex items-start gap-3">
            <RegisterIcon name="shield" className="text-accent" />
            <p className="max-w-[34ch] text-sm leading-relaxed">Verification means your identity has been checked. It does not guarantee trustworthiness.</p>
          </div>
          {(data.profile || data.latest?.request.reason || data.latest?.request.decidedAt) && <dl className="register-ledger mt-4 text-sm">
            {data.profile && <><RecordValue label="Account/profile name">{data.profile.displayName}</RecordValue><RecordValue label="City">{data.profile.city || "Not provided"}</RecordValue></>}
            {data.latest?.request.reason && <RecordValue label="Review reason">{data.latest.request.reason}</RecordValue>}
            {data.latest?.request.decidedAt && <RecordValue label="Decision recorded"><time className="font-mono" dateTime={data.latest.request.decidedAt}>{data.latest.request.decidedAt}</time></RecordValue>}
          </dl>}
          {!!data.portfolioLinks.length && <div className="mt-4 space-y-2 text-sm">
            <h2 className="register-kicker">Submitted portfolio</h2>
            <PortfolioLinks links={data.portfolioLinks} />
          </div>}
        </section>
        {canRequest ? (
          <VerificationRequestForm name={data.profile?.displayName ?? ""} city={data.profile?.city ?? ""} links={data.portfolioLinks.map(link => ({ url: link.url, label: link.label ?? "" }))} />
        ) : (
          <div className="register-panel space-y-3 text-sm">
            <p>{data.profile?.status === "verified" ? "Identity check approved. Engagement and log features are separate releases." : "Your request and profile cannot be edited here. Reload to check for a review update."}</p>
            <ReloadStatus className="register-secondary" />
          </div>
        )}
      </div>
    </div>
  );
}
