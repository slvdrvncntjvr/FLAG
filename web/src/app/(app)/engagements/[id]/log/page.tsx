import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireVerifiedFreelancer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadLogForEngagement } from "@/server/db/queries/logs";
import { DraftForm } from "@/features/logs/forms";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { RegisterIcon } from "@/components/register-icon";

export const metadata: Metadata = { title: "Create private log" };
export const dynamic = "force-dynamic";

export default async function EngagementLog({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireVerifiedFreelancer().catch(() => null);
  if (!viewer) notFound();
  if (!await isPrivateIntakeEnabled()) notFound();
  const { id } = await params;
  const engagement = await loadLogForEngagement(await getDb(), viewer.id, id);
  if (!engagement) notFound();
  if (engagement.log) redirect(`/logs/${engagement.log.id}`);
  return <div className="max-w-5xl">
    <Link href="/engagements" className="mb-4 inline-flex text-sm text-accent underline underline-offset-4">Back to engagements</Link>
    <RegisterPageHeading title="Create private log" label="Accepted engagement">
      <p className="font-semibold">{engagement.title}</p>
    </RegisterPageHeading>
    <div className="register-detail-grid">
      <section aria-label="Engagement details" className="register-invite-summary">
        <RegisterIcon name="lock" className="text-accent" />
        <div className="space-y-3">
          <p className="text-sm font-semibold">{engagement.clientName}</p>
          <p className="text-sm text-muted">Named client · Started <time dateTime={engagement.startedOn}>{engagement.startedOn}</time></p>
          <p className="text-sm text-muted">One log per accepted engagement. First save the complete draft, then attach proof and submit. No log is published here.</p>
        </div>
      </section>
      <div className="register-log-form"><DraftForm engagementId={engagement.id} /></div>
    </div>
  </div>;
}
