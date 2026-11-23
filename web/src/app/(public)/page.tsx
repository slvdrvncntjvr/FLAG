import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { RegisterIllustration } from "@/components/register-illustration";

const steps = [
  {
    title: "Start with an invitation",
    icon: "/register/engagements.svg",
    description: "Verified freelancers can invite clients to an engagement. Clients choose whether to accept.",
  },
  {
    title: "Submit proof for review",
    icon: "/register/queue.svg",
    description: "Each log needs proof and a client who accepted the engagement. A moderator must approve it before publication.",
  },
  {
    title: "Read private records",
    icon: "/register/record.svg",
    description: "Authorized, signed-in users can see approved positive, mixed, and negative experiences. Named clients can request a private correction.",
  },
];

export default function Landing() {
  return (
    <PageShell aside={<Link href="/sign-in" className="register-secondary">Sign in</Link>}>
      <section aria-labelledby="landing-heading" className="grid gap-5 text-center md:grid-cols-2 md:items-center md:gap-7 md:text-left">
        <div className="md:order-last"><RegisterIllustration /></div>
        <div>
          <h1 id="landing-heading" className="mx-auto max-w-[24ch] font-serif text-[2rem] leading-[1.16] md:mx-0 md:text-[2.125rem]">
            A record of how clients handle freelance work.
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted md:mx-0">
            Verified freelancers share proof-backed experiences from engagements their clients accepted.
          </p>
          <Link href="/sign-in" className="register-primary mt-5 w-full md:w-auto">Sign in or create an account</Link>
        </div>
      </section>

      <section aria-labelledby="register-guide" className="mt-9">
        <h2 id="register-guide" className="font-serif text-xl">How the register works</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {steps.map(({ title, icon, description }) => (
            <li key={title} className="register-panel flex items-start gap-3 md:flex-col">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint">
                <Image src={icon} width={22} height={22} alt="" unoptimized />
              </span>
              <div>
                <h3 className="font-serif text-base">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="pilot-heading" className="register-ledger mt-7 space-y-1 py-4 text-sm">
        <h2 id="pilot-heading" className="font-semibold">Pilot availability</h2>
        <p className="text-muted">New logs and proof uploads are available only while pilot intake is open.</p>
        <p className="text-muted">FLAG does not resolve disputes or collect payments.</p>
      </section>
    </PageShell>
  );
}
