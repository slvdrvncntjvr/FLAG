import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL, POLICY_VERSIONS } from "@/lib/policies";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy notice" version={POLICY_VERSIONS.privacy}>
      <p>
        This notice explains what FLAG collects, why, and the rights you have under the Philippine Data Privacy Act of
        2012 (RA 10173). It applies to everyone who creates a FLAG account.
      </p>
      <p>
        Accounts, onboarding, manual freelancer verification, moderator review of verification requests, engagement
        invitations, client profiles, and accepting or declining invitations are available. Logs, proof uploads,
        client records, and private corrections remain planned.
      </p>

      <h2 className="font-serif text-lg">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your email address, account name and role, and the sign-in and session records needed to run your account.</li>
        <li>Which policies you accepted, their versions, and when. You cannot directly alter acceptance history.</li>
        <li>
          For verification: your account/profile name, optional city, portfolio URLs and optional link labels,
          verification status, and request history. We record the reviewer, inspection method, ID type, result,
          name-match result, inspection time, decision, reason, and decision time, together with case claims and
          review history. Audit records contain account and case identifiers, actions, and times, without submitted
          content. A moderator views a supported government ID live; we do not record the inspection, save an ID
          image or full ID number, or require an ID-derived hash or phone verification.
        </li>
        <li>
          For engagements: the title, client name as the freelancer knows it, start date, freelancer account,
          invitation creation time, status, invite-token hash and expiry, and acceptance or decline time. Invitations
          expire after fourteen days; the token is stored as a hash rather than as the full invite link.
        </li>
        <li>
          For a client profile: your display name, individual or business profile type, optional city, and optional
          DTI or SEC business registration number. Accepting explicitly associates your signed-in account and client
          profile with that engagement. Profiles are never automatically merged because names match.
        </li>
        <li>
          For each accepted engagement: a separate consent receipt linking that engagement to your account&apos;s
          acceptance of the engagement-consent text, including its version and acceptance time. Accepting the privacy
          notice and terms during onboarding does not accept an engagement. Account/profile association and engagement
          consent require separate, initially unchecked choices. Declining requires neither a client profile nor
          engagement consent and creates no warning or negative signal.
        </li>
        <li>
          When logging becomes available: the facts, rating, covered work period, optional amount, proof files,
          and review history you submit for an accepted engagement.
        </li>
      </ul>

      <h2 className="font-serif text-lg">Why we use it</h2>
      <p>
        We use this data to authenticate you, verify freelancers, manage engagement invitations and responses, and
        record your explicit account/profile association and engagement-specific consent. As logging and private
        corrections launch, we will use the submitted material to run moderation and private review and keep the
        proof-backed record that is the purpose of the service. We do not sell your data, and we do not use it for advertising.
      </p>

      <h2 className="font-serif text-lg">Who can see it</h2>
      <p>
        Each party can read its own engagement list, including the title, start date, status, and any recorded consent
        version and time. These lists are private to the signed-in freelancer and associated client. Your client profile
        is linked to your registered account. Anyone holding a live invite link can see the engagement title and the
        inviting freelancer&apos;s display name before signing in; the link does not expose the client name hint, client
        profile, contact details, or consent receipt. Share invite links only with the intended client.
      </p>
      <p>
        Your verification request and its outcome are private to you and authorized moderators. Moderators can see
        the profile and portfolio information needed to review it; the decision reason is shared with you.
      </p>
      <p>
        Published client records and logs will be visible to signed-in freelancers; clients see their own record.
        Readers see the filer&apos;s name, but not contact or ID data. Proof files are restricted to the filer, named client,
        and moderators. An admin has no blanket proof access. Private review requests and notes stay with the parties
        and moderators. Records and logs are never served to signed-out visitors or search engines. Our email provider
        receives your address solely to deliver transactional messages.
      </p>

      <h2 className="font-serif text-lg">How long we keep it</h2>
      <p>
        Account data is kept while needed to run your account. Sign-in codes expire after ten minutes and sessions
        after fourteen days. Authentication rate-limit records contain hashed keys rather than raw IP or email values;
        expired rate-limit records are removed during authentication requests.
      </p>
      <p>
        The following policy applies when logging launches. Published experiences and their proofs are kept
        for twelve months from original publication; updates do not restart that period. Expired, hidden, or withdrawn
        experiences do not contribute to visible records or ratings. Idle drafts and abandoned unpublished material
        are deleted after thirty days of inactivity; rejected material after thirty days from the final decision.
        An abandoned proposed update does not delete the active publication.
      </p>
      <p>
        Minimal verification, moderation, and correction history is kept for twelve months after its case closes.
        Current policy acceptance stays while needed to gate an active account. Retired acceptance history is kept
        for twelve months after its policy or purpose ends or the account closes. A documented open review or legal
        obligation may delay deletion; it does not extend a publication&apos;s visibility or rating contribution.
      </p>
      <p>
        You may request account closure at any time. We assess closure and erasure individually within thirty days,
        revoke access, and remove data as the assessment permits. Closing an account does not automatically erase
        unexpired records or consent history. If a name or content needs earlier erasure, the affected publication is
        hidden or withdrawn. These periods are FLAG&apos;s policy, not universal legal retention requirements. Requests
        currently go to the contact address below; account-request and retention automation have not launched.
      </p>

      <h2 className="font-serif text-lg">Your rights</h2>
      <p>
        Under RA 10173 you may ask for a copy of your data, ask us to correct it, object to how we use it, or ask us to
        delete data we are not required to keep. To make a request, or to raise a privacy concern, write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        . We respond within a reasonable period and will tell you if a legal obligation prevents deletion.
      </p>
    </LegalPage>
  );
}
