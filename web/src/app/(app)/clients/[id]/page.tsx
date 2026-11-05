import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadClientRecord } from "@/server/db/queries/records";
import { recordPage } from "@/features/records/model";
import { ClientRecordView } from "@/features/records/record-view";

export const metadata: Metadata = { title: "Client record", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Record({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }>;
}) {
  const viewer = await viewerOrRedirect();
  const { id } = await params;
  const { page } = await searchParams;
  const record = await loadClientRecord(await getDb(), viewer.id, id, recordPage(page));
  if (!record) notFound();
  return <ClientRecordView record={record} />;
}
