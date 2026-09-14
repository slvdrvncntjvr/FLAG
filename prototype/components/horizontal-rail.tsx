"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { CLIENTS, share } from "@/lib/data";
import { SignalBar } from "@/components/client-card";
import Link from "next/link";

export function HorizontalRail() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["4%", "-62%"]);
  const progress = useTransform(scrollYProgress, [0, 1], ["8%", "92%"]);
  return (
    <div ref={ref} className="relative mt-14 border-y border-ink bg-white">
      <div className="flex items-center justify-between px-5 py-3 sm:px-8">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">Drag of scroll · Client rail</p>
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">Vertical scroll drives horizontal files</p>
      </div>
      <div className="overflow-hidden border-t border-ink/12">
        <motion.div style={{ x }} className="flex w-max gap-4 px-5 py-6 sm:px-8">
          {CLIENTS.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="w-[300px] shrink-0 border border-ink bg-paper p-5 hover:bg-cream/50">
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">{c.total} engagements</p>
              <h3 className="mt-1 font-serif text-[22px] leading-tight">{c.name}</h3>
              <p className="mono mt-1 text-[11px] text-ink-soft">{share(c)}% positive · {c.standing}</p>
              <SignalBar client={c} className="mt-3" />
            </Link>
          ))}
        </motion.div>
      </div>
      <div className="relative h-[3px] bg-ink/10">
        <motion.div style={{ left: progress }} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-melon" />
      </div>
    </div>
  );
}
