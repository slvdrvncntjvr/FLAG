import type { Metadata } from "next";
import { viewerOrRedirect } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const viewer = await viewerOrRedirect();
  const isClient = viewer.role === "client";
  return (
    <>
      <h1 className="font-serif text-2xl">{isClient ? "Client account" : "Freelancer account"}</h1>
      <dl className="mt-6 divide-y divide-rule border-y border-rule text-sm">
        <Row term="Email" value={viewer.email} />
        <Row term="Account type" value={isClient ? "Client" : "Freelancer"} />
        {!isClient && <Row term="Verification" value="Not started. Opens in a later release." />}
      </dl>
      <p className="mt-6 text-sm text-muted">
        {isClient
          ? "Engagement invites from freelancers will appear here."
          : "Client search and engagement logs open after verification is available."}
      </p>
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
