import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL, POLICY_VERSIONS } from "@/lib/policies";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms" version={POLICY_VERSIONS.terms}>
      <p>
        By using FLAG you agree to these terms. FLAG is an awareness tool that keeps a moderated, proof-backed record of
        how clients handle freelance work. It is not legal advice, it does not resolve disputes, and it does not collect
        or hold payment.
      </p>

      <h2 className="font-serif text-lg">Accounts</h2>
      <p>
        You must give an email you control and keep your account secure. You choose once whether you are a freelancer or
        a client; this cannot be changed later. Staff roles are assigned by FLAG, never chosen at sign-up.
      </p>

      <h2 className="font-serif text-lg">Verification and feature availability</h2>
      <p>
        Accounts, onboarding, manual freelancer verification, and moderator review of verification requests are
        available. To request verification, provide your account/profile name and portfolio links. A moderator
        inspects a supported government ID live and records the inspection result and a reasoned approval or
        rejection. Do not submit ID images, full ID numbers, recordings, or QR data. After rejection, you may submit
        a corrected new request; the previous request and decision remain in the review history.
        Verification means identity checked, not a guarantee of trustworthiness. Engagements, logs, client records,
        and private correction workflows remain planned.
      </p>

      <h2 className="font-serif text-lg">Filing a log</h2>
      <p>
        When logging launches, a log requires a registered client who accepted the engagement, a rating from 1 to 5,
        and proof supporting the facts. File within fifteen calendar days of completion or termination, or the first
        missed agreed payment or milestone during ongoing work. One log is allowed per engagement. A moderator reviews
        every log before other readers see it; private evidence is restricted to the parties and moderators. A false, misleading log or one filed
        without a genuine engagement is removed, and the account that filed it may be suspended.
      </p>
      <p>
        Approved publications expire twelve months after original publication; later updates do not extend retention.
        Declining an engagement produces no warning or negative rating.
      </p>

      <h2 className="font-serif text-lg">Clients and reviews</h2>
      <p>
        When logging and private corrections launch, a client named in a published log may privately request a review
        or correction with supporting evidence. Published logs cannot be directly edited or deleted by the client,
        and FLAG displays only the approved 1 to 5 rating and client average.
      </p>

      <h2 className="font-serif text-lg">Acceptable use</h2>
      <p>
        Do not upload content you have no right to share, do not harass anyone, and do not try to defeat verification or
        rate limits. We may suspend accounts that break these terms or that put others at legal or privacy risk.
      </p>

      <h2 className="font-serif text-lg">Liability and changes</h2>
      <p>
        FLAG is provided as is, without warranty, and we are not liable for how members use information on the service.
        We may update these terms; when we do, we raise the version and ask you to accept again. Questions go to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
