import type { Metadata } from "next";
import Link from "next/link";
import { viewerOrRedirect } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const viewer = await viewerOrRedirect();
  const isClient = viewer.role === "client";
  const isFreelancer = viewer.role === "freelancer";
  const accountType = isClient ? "Client" : isFreelancer ? "Freelancer" : viewer.role === "moderator" ? "Moderator" : "Admin";
  return (
    <>
      <h1 className="font-serif text-2xl">{accountType} account</h1>
      <dl className="mt-6 divide-y divide-rule border-y border-rule text-sm">
        <Row term="Email" value={viewer.email} />
        <Row term="Account type" value={accountType} />
        {isFreelancer && <Row term="Verification" value={viewer.freelancerStatus === "verified" ? "Identity checked" : viewer.freelancerStatus ?? "Not started"} />}
      </dl>
      <p className="mt-6 text-sm text-muted">
        {isClient
          ? "Engagement invites from freelancers will appear here."
          : "Client search and engagement logs are planned for later releases."}
      </p>
      {isFreelancer && <p className="mt-6"><Link href="/verification" className="underline underline-offset-2">View verification or request an identity check</Link></p>}
      {viewer.role === "moderator" && <p className="mt-6"><Link href="/moderation/verification" className="underline underline-offset-2">Open verification review queue</Link></p>}
    </>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
