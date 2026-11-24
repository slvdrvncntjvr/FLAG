import { ExportDownload } from "@/features/privacy/download";
import { PageShell } from "@/components/page-shell";
export const metadata = { title: "Private account export", robots: { index: false, follow: false } };
export default function ExportPage() {
  return (
    <PageShell>
      <div className="register-narrow space-y-5">
        <h1 className="font-serif text-2xl">Private account export</h1>
        <p className="text-sm text-muted">Use only the delivery reference and one-use secret provided through your verified private handover. Session deliveries also require signing in to the assessed account; an assessed export-only delivery does not reopen a closed account.</p>
        <ExportDownload />
      </div>
    </PageShell>
  );
}
