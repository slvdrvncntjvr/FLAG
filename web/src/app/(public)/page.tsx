import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function Landing() {
  return (
    <PageShell aside={<Link href="/sign-in" className="text-sm underline underline-offset-2">Sign in</Link>}>
      <h1 className="font-serif text-3xl leading-tight">A record of how clients handle freelance work.</h1>
      <p className="mt-4 text-muted">
        Verified freelancers log the outcome of work with clients who registered and accepted the engagement.
        Every log carries proof and is reviewed by a moderator before it appears. Clients can privately request a review.
      </p>
      <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm">
        <li className="py-3">Positive, mixed, and flagged outcomes are all recorded.</li>
        <li className="py-3">Records are visible to signed-in users only.</li>
        <li className="py-3">FLAG is not legal advice and does not resolve disputes. (autodeploy-check-9471)</li>
      </ul>
      <Link href="/sign-in" className="mt-8 inline-block rounded-sm bg-ink px-4 py-3 text-paper">
        Sign in or create an account
      </Link>
    </PageShell>
  );
}
