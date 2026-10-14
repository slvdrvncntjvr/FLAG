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

      <h2 className="font-serif text-lg">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your email address and the account, sign-in, and session records needed to run your account.</li>
        <li>Which policies you accepted, their versions, and when. You cannot directly alter acceptance history.</li>
        <li>
          When verification becomes available: portfolio links and the moderator&apos;s inspection method, result,
          name-match result, and time. A moderator views a supported government ID live; we do not record the inspection,
          save an ID image or full ID number, or require an ID-derived hash or phone verification.
        </li>
        <li>
          When engagements and logs become available: the accepted engagement, facts, rating, covered work period,
          optional amount, proof files, and review history you submit.
        </li>
      </ul>

      <h2 className="font-serif text-lg">Why we use it</h2>
      <p>
        We use this data to authenticate you, to verify freelancers, to run the moderation and private review process, and to
        keep the proof-backed record that is the purpose of the service. We do not sell your data, and we do not use it
        for advertising.
      </p>

      <h2 className="font-serif text-lg">Who can see it</h2>
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
        The following policy applies when engagement features launch. Published experiences and their proofs are kept
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
