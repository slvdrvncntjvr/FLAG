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
  return <>
    <Link href="/engagements" className="underline">Back to engagements</Link>
    <h1 className="mt-4 font-serif text-2xl">Create private log</h1>
    <p className="mt-3 break-words">{engagement.title}</p>
    <p className="mt-2 break-words">Named client: {engagement.clientName}</p>
    <p className="mt-4">One log per accepted engagement. First save the complete draft, then attach proof and submit. No log is published here.</p>
    <DraftForm engagementId={engagement.id} />
  </>;
}
