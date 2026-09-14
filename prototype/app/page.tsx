import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CLIENTS, STATS } from "@/lib/data";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { SovrunHero, ScaleSection } from "@/components/sovrun-hero";
import { VelocityStrip } from "@/components/velocity-strip";
import { share } from "@/lib/data";

export default function Home() {
  return (
    <div className="pb-0">
      <SovrunHero />
      <div className="mt-16">
        <VelocityStrip items={["96 engagements", "63% positive", "Proof on every entry", "48h review", "Reply open", "No scores"]} />
      </div>
      <section className="mt-0 grid grid-cols-2 border-b border-ink md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="border-r border-ink/15 px-6 py-8 last:border-r-0">
            <p className="display text-[44px] tabular"><CountUp to={s.value} suffix={s.suffix} /></p>
            <p className="mono mt-2 text-[11px] uppercase tracking-[0.16em] text-ink-soft">{s.label}</p>
          </div>
        ))}
      </section>
      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="display text-[12vw] leading-[0.85] sm:text-[6vw]">Files open.</h2>
          <Link href="/browse" className="mono text-[12px] font-bold uppercase tracking-[0.14em] hover:underline">Full log <ArrowRight className="inline size-4" /></Link>
        </div>
        <div className="mt-8 border-t-2 border-ink">
          {CLIENTS.slice(0, 5).map((c, i) => (
            <Reveal key={c.id} delay={Math.min(i * 0.04, 0.15)}>
              <Link href={`/clients/${c.id}`} className="group grid gap-2 border-b border-ink/12 py-6 transition-colors hover:bg-ink hover:text-paper sm:grid-cols-[80px_1fr_auto] sm:items-baseline sm:gap-8 sm:px-4">
                <span className="mono text-xs opacity-50">0{i + 1}</span>
                <span>
                  <span className="font-serif text-[28px] leading-tight sm:text-[34px]">{c.name}</span>
                  <span className="mono mt-1 block text-[11px] uppercase tracking-[0.14em] opacity-60">{c.total} engagements · {share(c)}% positive · {c.standing}</span>
                </span>
                <span className="mono text-[13px] font-bold uppercase tracking-[0.1em] opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <ScaleSection />
    </div>
  );
}
