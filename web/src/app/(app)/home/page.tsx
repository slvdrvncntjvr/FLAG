import type { Metadata } from "next";
import Link from "next/link";
import { RegisterPageHeading } from "@/components/register-page-heading";
import { RegisterIcon, type RegisterIconName } from "@/components/register-icon";
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
      <RegisterPageHeading title={`${accountType} account`} label="Private register">
        {(isClient || isFreelancer) && <p>
          {isClient
            ? "Open an invite link from your freelancer to accept or decline an engagement."
            : intakeEnabled ? "Open your engagements to create or view a private engagement log." : "Open your engagements to manage invitations and view accepted work."}
        </p>}
      </RegisterPageHeading>
      <div className="register-overview">
        <nav aria-labelledby="account-tools">
          <h2 id="account-tools" className="register-kicker mb-3">Account tools</h2>
          <ul className="register-action-list text-sm">
            {(isClient || isFreelancer) && <AccountLink href="/engagements" icon="engagements">View engagements</AccountLink>}
            {(isClient || isFreelancer) && <AccountLink href="/clients" icon={isClient ? "record" : "search"}>{isClient ? "View your client record" : "Search client records"}</AccountLink>}
            {isFreelancer && <AccountLink href="/verification" icon="shield">View verification or request an identity check</AccountLink>}
            {viewer.role === "moderator" && <>
              <AccountLink href="/moderation/verification" icon="shield">Open verification review queue</AccountLink>
              <AccountLink href="/moderation/logs" icon="queue">Review engagement logs and updates</AccountLink>
              <AccountLink href="/moderation/corrections" icon="correction">Review private correction requests</AccountLink>
            </>}
            {viewer.role === "admin" && <AccountLink href="/admin/privacy" icon="data">Process privacy requests and retention</AccountLink>}
          </ul>
        </nav>
        <section className="register-account-card" aria-labelledby="account-details">
          <h2 id="account-details" className="mb-2 flex items-center gap-2 text-base font-semibold"><RegisterIcon name="profile" /> Account details</h2>
          <dl className="divide-y divide-rule text-sm">
            <Row term="Email" value={viewer.email} />
            <Row term="Account type" value={accountType} />
            {isFreelancer && <Row term="Verification" value={viewer.freelancerStatus === "verified" ? "Identity checked" : viewer.freelancerStatus ?? "Not started"} />}
          </dl>
        </section>
      </div>
    </>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid gap-1 py-2.5 last:pb-0">
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}

function AccountLink({ href, icon, children }: { href: string; icon: RegisterIconName; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href}>
        <RegisterIcon name={icon} />
        {children}
        <RegisterIcon name="arrow" />
      </Link>
    </li>
  );
}
