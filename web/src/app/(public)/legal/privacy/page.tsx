import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { POLICY_VERSIONS } from "@/lib/policies";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy notice" version={POLICY_VERSIONS.privacy}>
      <p>
        FLAG processes your name, email, sign-in records, and policy acceptances to run your account. Freelancers who
        verify also give a phone number and portfolio links. FLAG never stores an image or the number of a government ID.
      </p>
      <p>Proof files are visible only to moderators, the freelancer who filed them, and the client named in the log.</p>
      <p>
        You can ask for a copy, a correction, or deletion of your data. The data protection contact and retention
        periods are not set yet.
      </p>
    </LegalPage>
  );
}
