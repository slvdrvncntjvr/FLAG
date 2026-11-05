import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function Landing() {
  return (
    <PageShell aside={<Link href="/sign-in" className="text-sm underline underline-offset-2">Sign in</Link>}>
      <h1 className="font-serif text-3xl leading-tight">A record of how clients handle freelance work.</h1>
      <p className="mt-4 text-muted">
        Verified freelancers share proof-backed experiences with clients who registered and accepted the
        engagement. A moderator must approve every published log. Named clients can request private correction.
      </p>
      <section aria-labelledby="pilot-heading" className="mt-6 border-y border-rule py-4 text-sm">
        <h2 id="pilot-heading" className="font-medium">Available in this pilot</h2>
        <p className="mt-2">Create an account, complete onboarding, request a freelancer identity check, and send or respond to engagement invitations. The pilot includes moderated logs, client records, and private corrections.</p>
        <p className="mt-2 text-muted">New log submissions are available only when pilot intake is open. Real pilot data requires completed acceptance testing.</p>
      </section>
      <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm">
        <li className="py-3">Client records include approved positive, mixed, and negative experiences.</li>
        <li className="py-3">Client records are restricted to authorized signed-in users.</li>
        <li className="py-3">FLAG is not legal advice and does not resolve disputes.</li>
      </ul>
      <Link href="/sign-in" className="mt-8 inline-block rounded-sm bg-ink px-4 py-3 text-paper">
        Sign in or create an account
      </Link>
    </PageShell>
  );
}
