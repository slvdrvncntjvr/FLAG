import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function Landing() {
  return (
    <PageShell aside={<Link href="/sign-in" className="text-sm underline underline-offset-2">Sign in</Link>}>
      <h1 className="font-serif text-3xl leading-tight">A record of how clients handle freelance work.</h1>
      <p className="mt-4 text-muted">
        FLAG is being built so verified freelancers can share proof-backed experiences with clients who
        registered and accepted the engagement. Published logs will require moderator approval, and clients
        will have a private correction process.
      </p>
      <section aria-labelledby="pilot-heading" className="mt-6 border-y border-rule py-4 text-sm">
        <h2 id="pilot-heading" className="font-medium">Available in this pilot</h2>
        <p className="mt-2">Create an account, complete onboarding, request a freelancer identity check, and send or respond to engagement invitations.</p>
        <p className="mt-2 text-muted">Log submission, published client records, and private corrections are not open yet.</p>
      </section>
      <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm">
        <li className="py-3">The planned record includes positive, mixed, and negative experiences.</li>
        <li className="py-3">Client records will be restricted to authorized signed-in users.</li>
        <li className="py-3">FLAG is not legal advice and does not resolve disputes.</li>
      </ul>
      <Link href="/sign-in" className="mt-8 inline-block rounded-sm bg-ink px-4 py-3 text-paper">
        Sign in or create an account
      </Link>
    </PageShell>
  );
}
