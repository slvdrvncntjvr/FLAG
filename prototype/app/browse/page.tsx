import { CLIENTS } from "@/lib/data";
import { ClientCard } from "@/components/client-card";
import { Reveal } from "@/components/reveal";

export default function Browse() {
  return (
    <div className="pb-10 pt-10">
      <Reveal>
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">Log · Ratio first</p>
        <h1 className="mt-2 font-serif text-[44px] leading-tight">Every file shows <em>the base rate.</em></h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-ink-soft">Engagements logged, share positive, then tag distribution. Green is on-time and clean work. Red is late, unpaid, unresponsive, or creeping scope. No scores, no ranking.</p>
      </Reveal>
      <div className="mono mt-6 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
        {["All", "On-time", "Clear scope", "Late payment", "Non-payment", "Scope creep"].map((t, i) => (
          <span key={t} className={i === 0 ? "bg-ink px-4 py-2 text-paper" : "border border-ink/15 bg-white px-4 py-2 text-ink-soft"}>{t}</span>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {CLIENTS.map((c, i) => (<Reveal key={c.id} delay={Math.min(i * 0.04, 0.2)}><ClientCard client={c} /></Reveal>))}
      </div>
    </div>
  );
}
