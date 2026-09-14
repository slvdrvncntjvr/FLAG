import { BadgeCheck, CloudUpload, ShieldCheck } from "lucide-react";
import { POS_TAGS, RISK_TAGS, TAG_STYLE } from "@/lib/data";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

export default function ReportPage() {
  return (
    <div className="pb-10 pt-10">
      <Reveal>
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">File · Same bar for praise and flags</p>
        <h1 className="mt-2 font-serif text-[44px] leading-tight">Log the engagement <em>as it happened.</em></h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-ink-soft">Pick an outcome, add fixed tags, attach proof. Positives need proof too, or praise becomes cheap. A person reviews every entry either way.</p>
      </Reveal>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Reveal>
          <div className="border border-ink bg-white p-6 sm:p-8">
            <div className="mono flex gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
              {["Positive", "Mixed", "Flagged"].map((o, i) => (
                <span key={o} className={cn("border px-4 py-2", i === 2 ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft")}>{o}</span>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px] font-semibold">Client<input placeholder="Marikina Bakeshop Co." className="mt-1.5 w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm font-normal outline-none placeholder:text-ink-faint focus:border-ink" /></label>
              <label className="block text-[13px] font-semibold">Channel<input placeholder="Messenger, Viber, email" className="mt-1.5 w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm font-normal outline-none placeholder:text-ink-faint focus:border-ink" /></label>
              <label className="block text-[13px] font-semibold">Period<input placeholder="Jan 12 - Feb 28" className="mt-1.5 w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm font-normal outline-none placeholder:text-ink-faint focus:border-ink" /></label>
              <label className="block text-[13px] font-semibold">Amount<input placeholder="P18,500" className="mt-1.5 w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm font-normal outline-none placeholder:text-ink-faint focus:border-ink" /></label>
            </div>
            <p className="mono mt-6 text-[11px] uppercase tracking-[0.14em] text-leaf">Positive signals</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {POS_TAGS.map((t) => (<span key={t} className={cn("border px-3.5 py-1.5 text-[13px] font-semibold", TAG_STYLE[t])}>{t}</span>))}
            </div>
            <p className="mono mt-5 text-[11px] uppercase tracking-[0.14em] text-melon-deep">Risk signals</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RISK_TAGS.map((t, i) => (<span key={t} className={cn("border px-3.5 py-1.5 text-[13px] font-semibold", i === 0 ? "border-ink bg-ink text-paper" : TAG_STYLE[t])}>{t}</span>))}
            </div>
            <label className="mt-6 block text-[13px] font-bold">Facts only<textarea rows={4} placeholder="Dates, amounts, agreed vs delivered. Write what the proof shows." className="mt-2 w-full border border-ink/20 bg-paper px-3.5 py-2.5 text-sm font-normal outline-none placeholder:text-ink-faint focus:border-ink" /></label>
            <div className="mt-6 border border-dashed border-ink/25 bg-paper p-6 text-center">
              <CloudUpload className="mx-auto size-6 text-ink-faint" />
              <p className="mt-2 text-sm font-bold">Proof required, even for positives</p>
              <p className="mt-1 text-[13px] text-ink-soft">Invoice, receipt, thread, or signed brief · Max 10MB</p>
            </div>
            <button className="mt-6 w-full bg-ink py-3.5 text-sm font-semibold text-paper hover:bg-rind">Submit for review (demo)</button>
          </div>
        </Reveal>
        <div className="space-y-4">
          <Reveal delay={0.06}>
            <div className="border border-ink bg-rind p-6 text-white">
              <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-emerald-300" /> Review checks both sides</p>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-white/75">
                <li>· Proof matches claim and dates</li>
                <li>· Positive has a positive tag, flagged has a risk tag</li>
                <li>· Client is resolvable, not a guess</li>
                <li>· Decision in 48h with a reason</li>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="border border-ink/15 bg-white p-6">
              <p className="flex items-center gap-2 text-sm font-bold"><BadgeCheck className="size-4 text-leaf" /> Anti-gaming</p>
              <p className="mt-2 text-[13px] leading-6 text-ink-soft">Same verification and proof for praise. Limits per client and network block stuffing. No scores, so there is nothing to farm.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
