import type { loadVerificationStatus } from "@/server/db/queries/verification";
import type { VerificationInput } from "./schema";

type Status = NonNullable<Awaited<ReturnType<typeof loadVerificationStatus>>>;

export function verificationStage(data: Status): string {
  if (data.profile?.status === "suspended") return "Suspended";
  if (data.profile?.status === "verified") return "Verified — identity checked";
  if (data.latest?.request.decision === "reject") return "Rejected";
  if (data.latest && !data.latest.request.decidedAt) {
    const active = data.latest.review.status === "claimed" && !!data.latest.review.claimedUntil && Date.parse(data.latest.review.claimedUntil) > Date.now();
    if (active && data.latest.request.inspectedAt && data.latest.request.reviewerId === data.latest.review.claimedBy) return "Inspected — awaiting decision";
    return active ? "Claimed — awaiting live inspection" : "Pending review";
  }
  return data.profile?.status === "pending" ? "Pending review" : "Not started";
}

export function RecordValue({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 border-t border-rule py-3"><dt className="text-muted">{label}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere]">{children}</dd></div>;
}

// Only web URLs become links, even when reading legacy or malformed data.
export function PortfolioLinks({ links }: { links: { id?: string; url: string; label?: string | null }[] }) {
  return <ul className="space-y-3">{links.map((link, index) => {
    let safe = false;
    try { const url = new URL(link.url); safe = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch {}
    return <li key={link.id ?? index} className="break-words [overflow-wrap:anywhere]">{safe
      ? <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">{link.label || link.url} <span className="text-muted">(opens a new tab)</span></a>
      : <span>Invalid portfolio link</span>}</li>;
  })}</ul>;
}

type CurrentProfile = { name: string; city: string | null; portfolioLinks: { url: string; label: string | null }[] };
export function SubmittedProfile({ submitted, current }: { submitted: VerificationInput | null; current: CurrentProfile | null }) {
  return <>
    <section className="mt-6 space-y-3"><h2 className="font-medium">Submitted profile</h2>
      {submitted ? <>
        <dl className="border-b border-rule"><RecordValue label="Account/profile name">{submitted.name}</RecordValue><RecordValue label="City">{submitted.city || "Not provided"}</RecordValue></dl>
        <h3 className="font-medium">Owner-submitted portfolio</h3><p className="text-muted">External links are supplied by the requester.</p><PortfolioLinks links={submitted.portfolioLinks} />
      </> : <p>Original submitted profile unavailable. The original inputs cannot be shown for this request.</p>}
    </section>
    {!submitted && current && <section className="mt-6 space-y-3"><h2 className="font-medium">Current profile — for fresh inspection</h2>
      <p className="text-muted">These current values cannot establish what was submitted or inspected previously.</p>
      <dl className="border-b border-rule"><RecordValue label="Current account/profile name">{current.name}</RecordValue><RecordValue label="Current city">{current.city || "Not provided"}</RecordValue></dl>
      <h3 className="font-medium">Current portfolio</h3><PortfolioLinks links={current.portfolioLinks} />
    </section>}
  </>;
}
