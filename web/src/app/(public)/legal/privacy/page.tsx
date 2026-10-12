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
        <li>Which policies you accepted and when, kept as a permanent record you cannot edit or delete.</li>
        <li>
          For freelancers who verify: a phone number, portfolio links, and a one-way cryptographic value (HMAC) derived
          from a government ID. We never store an image of an ID or the full ID number.
        </li>
        <li>
          For logs and engagements: the content you submit, the proof files you upload, and the client named in a log.
        </li>
      </ul>

      <h2 className="font-serif text-lg">Why we use it</h2>
      <p>
        We use this data to authenticate you, to verify freelancers, to run the moderation and reply process, and to
        keep the proof-backed record that is the purpose of the service. We do not sell your data, and we do not use it
        for advertising.
      </p>

      <h2 className="font-serif text-lg">Who can see it</h2>
      <p>
        Client records and logs are visible only to signed-in users and are never shown to search engines. Proof files
        are visible only to moderators, the freelancer who filed them, and the client named in the log. Email codes are
        sent through our email provider solely to deliver your sign-in code.
      </p>

      <h2 className="font-serif text-lg">How long we keep it</h2>
      <p>
        We keep account and verification data for as long as your account is active. Policy acceptances and published,
        moderator-approved logs are kept as a permanent record even after an account is closed, because they document
        decisions that others relied on. You can ask us to close your account at any time.
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
