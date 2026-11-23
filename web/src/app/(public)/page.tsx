import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { RegisterIllustration } from "@/components/register-illustration";

const exampleRatings = [
  { name: "Sample Studio A", rating: 4, note: "Paid in full on the agreed date. Brief was clear." },
  { name: "Sample Studio B", rating: 2, note: "Payment arrived two weeks after the due date." },
];

export default function Landing() {
  return (
    <PageShell aside={<Link href="/sign-in" className="register-secondary">Sign in</Link>}>
      <section aria-labelledby="landing-heading" className="text-center">
        <RegisterIllustration />
        <h1 id="landing-heading" className="mx-auto mt-5 max-w-[24ch] font-serif text-[2rem] leading-[1.16] sm:text-4xl">
          A record of how clients handle freelance work.
        </h1>
        <p className="mx-auto mt-5 max-w-[50ch] text-[0.9375rem] leading-relaxed text-muted">
          Verified freelancers share proof-backed experiences with clients who registered and accepted the engagement.
          A moderator must approve every published log. Named clients can request private correction.
        </p>
        <Link href="/sign-in" className="register-primary mt-5 w-full">Sign in or create an account</Link>
      </section>

      <section aria-labelledby="ratings-heading" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ratings-heading" className="font-serif text-xl">Client ratings</h2>
          <span className="rounded-full bg-sand px-3 py-1.5 text-[0.625rem] font-semibold tracking-wide uppercase">
            Fictional examples
          </span>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {exampleRatings.map(({ name, rating, note }) => (
            <li key={name} className="register-panel space-y-1">
              <h3 className="font-serif text-base font-semibold">{name}</h3>
              <p className="flex items-center gap-2 text-sm text-accent">
                <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
                <span>{rating.toFixed(1)}<span className="sr-only"> out of 5</span></span>
              </p>
              <p className="text-[0.8125rem] text-muted">“{note}”</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pilot-heading" className="register-ledger mt-8 py-4 text-sm">
        <h2 id="pilot-heading" className="font-serif text-xl">Available in this pilot</h2>
        <p className="mt-2">Create an account, complete onboarding, request a freelancer identity check, and send or respond to engagement invitations. The pilot includes moderated logs, client records, and private corrections.</p>
        <p className="mt-2 text-muted">New log submissions are available only when pilot intake is open. Real pilot data requires completed acceptance testing.</p>
      </section>
      <ul className="divide-y divide-rule border-b border-rule text-sm">
        <li className="py-3">Client records include approved positive, mixed, and negative experiences.</li>
        <li className="py-3">Client records are restricted to authorized signed-in users.</li>
        <li className="py-3">FLAG is not legal advice and does not resolve disputes.</li>
      </ul>
    </PageShell>
  );
}
