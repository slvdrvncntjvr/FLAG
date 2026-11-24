import type { Metadata } from "next";
import Link from "next/link";
import { viewerOrRedirect } from "@/server/auth/guards";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const viewer = await viewerOrRedirect();
  const isClient = viewer.role === "client";
  const isFreelancer = viewer.role === "freelancer";
  const intakeEnabled = isFreelancer && await isPrivateIntakeEnabled();
  const accountType = isClient ? "Client" : isFreelancer ? "Freelancer" : viewer.role === "moderator" ? "Moderator" : "Admin";
  return (
    <>
      <h1 className="font-serif text-[1.375rem] leading-tight">{accountType} account</h1>
      {(isClient || isFreelancer) && <p className="mt-2 text-sm text-muted">
        {isClient
          ? "Open an invite link from your freelancer to accept or decline an engagement."
          : intakeEnabled ? "Open your engagements to create or view a private engagement log." : "Open your engagements to manage invitations and view accepted work."}
      </p>}
      <dl className="register-ledger mt-4 divide-y divide-rule text-sm">
        <Row term="Email" value={viewer.email} />
        <Row term="Account type" value={accountType} />
        {isFreelancer && <Row term="Verification" value={viewer.freelancerStatus === "verified" ? "Identity checked" : viewer.freelancerStatus ?? "Not started"} />}
      </dl>
      <nav aria-labelledby="account-tools" className="mt-4">
        <h2 id="account-tools" className="register-kicker">Account tools</h2>
        <ul className="mt-1 grid gap-2 text-sm">
          {(isClient || isFreelancer) && <AccountLink href="/engagements">View engagements</AccountLink>}
          {(isClient || isFreelancer) && <AccountLink href="/clients">{isClient ? "View your client record" : "Search client records"}</AccountLink>}
          {isFreelancer && <AccountLink href="/verification">View verification or request an identity check</AccountLink>}
          {viewer.role === "moderator" && <>
            <AccountLink href="/moderation/verification">Open verification review queue</AccountLink>
            <AccountLink href="/moderation/logs">Review engagement logs and updates</AccountLink>
            <AccountLink href="/moderation/corrections">Review private correction requests</AccountLink>
          </>}
          {viewer.role === "admin" && <AccountLink href="/admin/privacy">Process privacy requests and retention</AccountLink>}
        </ul>
      </nav>
    </>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}

function AccountLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-12 items-center rounded-2xl border border-rule px-3 py-2 hover:bg-tint">
        {children}
      </Link>
    </li>
  );
}
