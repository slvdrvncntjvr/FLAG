"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ScrollHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const size = useTransform(scrollYProgress, [0, 1], [1, 0.86]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const tilt = useTransform(scrollYProgress, [0, 1], [0, -3]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  return (
    <div ref={ref} className="relative">
      <div className="mono flex items-center justify-between border-b border-ink/15 py-2.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
        <span>Vol. 02 · Balanced log</span>
        <span className="hidden sm:block">96 engagements · 63% positive · Proof required</span>
        <span>Scroll-driven demo</span>
      </div>
      <div className="grid gap-10 pt-8 md:grid-cols-[1.1fr_0.9fr] md:pt-12">
        <motion.div style={{ scale: size, y, opacity: fade }} className="origin-top-left">
          <h1 className="font-serif text-[52px] leading-[0.98] tracking-[-0.015em] sm:text-[84px]">
            Good clients<br />deserve <em>a record</em><br />too.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-ink-soft">
            FLAG logs finished engagements with proof, on-time ones included. Scroll to see how a file reads when the base rate is visible, not just the complaints.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/browse" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-rind">Browse the log <ArrowRight className="size-4" /></Link>
            <Link href="/report" className="inline-flex items-center gap-2 rounded-full border border-ink px-5 py-3 text-sm font-semibold hover:bg-ink/5">Log an engagement</Link>
          </div>
        </motion.div>
        <motion.div style={{ rotate: tilt, y }} className="relative">
          <div className="border border-ink bg-white">
            <div className="flex items-center justify-between border-b border-ink/12 px-5 py-3">
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">Dossier · QC Studio · Pins on scroll</p>
              <span className="stamp text-leaf">71% positive</span>
            </div>
            <div className="px-5 py-5">
              <h3 className="font-serif text-[28px]">North QC Creative Studio</h3>
              <p className="mono mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">31 engagements · 22 positive · 5 flagged</p>
              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div className="h-full bg-leaf" style={{ width: "71%" }} />
                <div className="h-full bg-amber-warn/70" style={{ width: "13%" }} />
                <div className="h-full bg-melon" style={{ width: "16%" }} />
              </div>
              <div className="mt-4 space-y-0">
                {["On-time payment ×18", "Responsive ×16", "Scope creep ×4"].map((r) => (
                  <div key={r} className="ledger-row flex justify-between py-2 text-[13px] text-ink-soft"><span>{r.split(" ×")[0]}</span><span className="mono font-semibold text-ink">×{r.split(" ×")[1]}</span></div>
                ))}
              </div>
            </div>
          </div>
          <p className="mono mt-3 text-[11px] uppercase tracking-[0.12em] text-ink-faint">Keep scrolling — the headline shrinks, the file tilts, the strip below reacts to velocity.</p>
        </motion.div>
      </div>
    </div>
  );
}
