import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { POLICY_VERSIONS } from "@/lib/policies";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms" version={POLICY_VERSIONS.terms}>
      <p>FLAG is an awareness tool. It is not legal advice, does not resolve disputes, and does not collect payment.</p>
      <p>
        Every log needs proof and is reviewed by a moderator before anyone else can read it. A false or misleading log
        is removed and the account can be suspended.
      </p>
      <p>A client can reply to a published log but cannot edit or delete it.</p>
    </LegalPage>
  );
}
