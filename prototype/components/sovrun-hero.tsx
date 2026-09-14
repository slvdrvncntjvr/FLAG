"use client";
import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { CLIENTS, ENTRIES, share } from "@/lib/data";
import { SignalBar } from "@/components/client-card";

const TABS = ["All", "Positive", "Mixed", "Flagged"] as const;

export function SovrunHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const ghostX = useTransform(scrollYProgress, [0, 1], ["0%", "-18%"]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const shown = ENTRIES.filter((e) => tab === "All" || e.outcome === tab).slice(0, 3);
  return (
    <div ref={ref} className="relative">
      <div className="flex min-h-[100svh] flex-col justify-end pb-10 pt-28">
        <motion.div style={{ scale, y }} className="origin-bottom-left">
          <p className="mono mb-4 text-[12px] uppercase tracking-[0.2em] text-ink-soft">A balanced engagement log · 96 files · Manila</p>
          <h1 className="display text-[19vw] leading-[0.84] sm:text-[15vw]">Know who</h1>
          <h1 className="display outline-text text-[19vw] leading-[0.84] sm:text-[15vw]">pays.</h1>
        </motion.div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-md text-[16px] leading-7 text-ink-soft">On-time work counts here too. Proof on every entry, a person reviews it, the client may reply. No scores, no ranking.</p>
          <div className="flex gap-3">
            <Link href="/browse" className="bg-ink px-7 py-4 text-sm font-bold uppercase tracking-wide text-paper hover:bg-blue">Browse files</Link>
            <Link href="/report" className="border-b-2 border-ink px-1 py-4 text-sm font-bold uppercase tracking-wide hover:text-blue hover:border-blue">Log work →</Link>
          </div>
        </div>
      </div>
      <motion.div style={{ x: ghostX }} className="display pointer-events-none select-none whitespace-nowrap text-[24vw] leading-none text-ink/[0.06]">Good work — Good work</motion.div>
      <div className="relative mt-4 min-h-[90svh]">
        <p className="mono mb-6 text-[12px] uppercase tracking-[0.2em] text-ink-faint">Throw them around · Files stay open</p>
        <div className="relative h-[60vh] min-h-[420px]">
          {CLIENTS.slice(0, 3).map((c, i) => (
            <motion.article key={c.id} drag dragConstraints={{ left: -120, right: 120, top: -40, bottom: 60 }} whileDrag={{ scale: 1.05, rotate: 0, zIndex: 10 }} initial={{ rotate: [-5, 4, -2][i] }}
              className="absolute w-[min(360px,80vw)] cursor-grab bg-paper p-7 text-ink shadow-[12px_12px_0_0_#0B0B0C] active:cursor-grabbing border border-ink"
              style={{ left: `${[4, 34, 62][i]}%`, top: `${[8, 0, 18][i]}%`, zIndex: 3 - i }}>
              <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">{c.total} engagements · {share(c)}% positive</p>
              <h3 className="mt-2 font-serif text-[26px] leading-tight">{c.name}</h3>
              <SignalBar client={c} className="mt-4" />
              <Link href={`/clients/${c.id}`} className="mono mt-4 inline-block border-b border-ink/30 pb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] hover:border-ink">Open file</Link>
            </motion.article>
          ))}
        </div>
        <div className="mt-10 border-t-2 border-ink">
          <div className="flex">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`mono flex-1 border-b-2 px-2 py-4 text-[12px] font-bold uppercase tracking-[0.14em] ${tab === t ? "border-ink" : "border-transparent text-ink-faint hover:text-ink"}`}>{t}</button>
            ))}
          </div>
          {shown.map((e) => (
            <div key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink/10 py-5">
              <span className="mono text-xs text-ink-faint">{e.id}</span>
              <span className="mono text-[11px] font-bold uppercase">{e.outcome}</span>
              <span className="min-w-[240px] flex-1 text-[15px] text-ink-soft">{e.summary}</span>
              <span className="mono text-sm font-bold">{e.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScaleSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const s = useTransform(scrollYProgress, [0, 1], [0.85, 1.3]);
  const x = useTransform(scrollYProgress, [0, 1], ["8%", "-8%"]);
  return (
    <div ref={ref} className="overflow-clip bg-ink py-[12vh] text-paper">
      <div className="px-5 sm:px-10">
        <p className="mono text-[12px] uppercase tracking-[0.2em] text-paper/50">002 · Proof at scale</p>
        <motion.h2 style={{ scale: s }} className="display mt-6 origin-left text-[16vw] leading-[0.85] sm:text-[10vw]">Proof<br /><span className="outline-paper">scales.</span></motion.h2>
        <motion.p style={{ x }} className="mono mt-8 whitespace-nowrap text-[13px] uppercase tracking-[0.22em] text-paper/60">96 engagements · 63% positive · 48h review · No scores · Reply open ·</motion.p>
      </div>
    </div>
  );
}
