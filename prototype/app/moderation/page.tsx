import { Check, X, Clock3, FileText } from "lucide-react";
import { QUEUE, TAG_STYLE } from "@/lib/data";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

export default function Moderation() {
  return (
    <div className="pb-10 pt-10">
      <Reveal>
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">Review · Demo data</p>
        <h1 className="mt-2 font-serif text-[44px] leading-tight">Praise gets <em>checked too.</em></h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-ink-soft">Oldest first, 48 hours max, reason on every call. Positives face the same proof bar, or the ratio means nothing.</p>
      </Reveal>
      <div className="mono mt-6 grid gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] sm:grid-cols-3">
        {["4 pending", "31h oldest wait", "2 positives in queue"].map((s, i) => (
          <div key={s} className={cn("border px-4 py-3", i === 0 ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white")}>{s}</div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {QUEUE.map((q, i) => (
          <Reveal key={q.id} delay={i * 0.05}>
            <div className="border border-ink/15 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-xs font-semibold text-ink-faint">{q.id}</span>
                <span className={cn("mono text-[10px] font-bold uppercase tracking-[0.1em]", q.outcome === "Positive" ? "text-leaf" : q.outcome === "Flagged" ? "text-melon-deep" : "text-amber-warn")}>{q.outcome}</span>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", TAG_STYLE[q.tag])}>{q.tag}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-warn"><Clock3 className="size-3.5" />{q.submitted}</span>
                <span className="ml-auto text-xs text-ink-soft">{q.reporter}</span>
              </div>
              <h3 className="mt-2 font-serif text-[22px]">{q.client}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-soft"><FileText className="size-3.5" />{q.proof}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex cursor-pointer items-center gap-1.5 bg-leaf px-4 py-2 text-[13px] font-semibold text-white"><Check className="size-4" /> Approve (demo)</span>
                <span className="inline-flex cursor-pointer items-center gap-1.5 border border-ink/20 bg-white px-4 py-2 text-[13px] font-semibold"><X className="size-4" /> Reject with reason (demo)</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
