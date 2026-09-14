"use client";
import { useRef } from "react";
import { motion, useScroll, useVelocity, useAnimationFrame, useMotionValue, useTransform } from "motion/react";

export function VelocityStrip({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const vel = useVelocity(scrollY);
  const base = useMotionValue(0);
  const skew = useTransform(vel, [-2000, 2000], [-4, 4]);
  useAnimationFrame((_, delta) => {
    const v = Math.min(3, Math.abs(vel.get()) / 1200);
    base.set((base.get() - delta * (0.02 + v * 0.12)) % 50);
  });
  const x = useTransform(base, (b) => `${b}%`);
  const row = [...items, ...items, ...items];
  return (
    <div ref={ref} className="overflow-hidden border-y border-ink bg-ink py-2.5 text-paper">
      <motion.div style={{ x, skewX: skew }} className="flex w-max items-center">
        {row.map((t, i) => (
          <span key={i} className="mono whitespace-nowrap px-5 text-[11px] uppercase tracking-[0.14em] opacity-80">
            {t} <span className="ml-5 opacity-30">·</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
