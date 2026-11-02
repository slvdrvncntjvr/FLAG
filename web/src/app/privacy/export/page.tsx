import { ExportDownload } from "@/features/privacy/download";
export const metadata = { title: "Private account export", robots: { index: false, follow: false } };
export default function ExportPage() {
  return <main className="mx-auto max-w-xl space-y-6 p-8"><h1 className="font-serif text-3xl">Private account export</h1><p>Use only the delivery reference and one-use secret provided through your verified private handover. Session deliveries also require signing in to the assessed account; an assessed export-only delivery does not reopen a closed account.</p><ExportDownload /></main>;
}
