import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireVerifiedFreelancer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadLogForEngagement } from "@/server/db/queries/logs";
import { DraftForm } from "@/features/logs/forms";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";

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
  return <div className="register-narrow">
    <Link href="/engagements" className="text-sm text-accent underline underline-offset-4">Back to engagements</Link>
    <h1 className="mt-4 font-serif text-2xl">Create private log</h1>
    <section aria-label="Engagement details" className="register-ledger mt-3 divide-y divide-rule">
      <div className="py-3">
        <h2 className="font-serif text-xl">{engagement.title}</h2>
        <p className="mt-1 text-sm text-muted">Named client: {engagement.clientName} · Started <time dateTime={engagement.startedOn}>{engagement.startedOn}</time></p>
      </div>
      <dl className="space-y-1 py-3">
        <dt className="register-kicker">Engagement status</dt>
        <dd className="font-serif font-semibold text-accent">Accepted</dd>
      </dl>
    </section>
    <p className="mt-4 text-sm text-muted">One log per accepted engagement. First save the complete draft, then attach proof and submit. No log is published here.</p>
    <DraftForm engagementId={engagement.id} />
  </div>;
}
