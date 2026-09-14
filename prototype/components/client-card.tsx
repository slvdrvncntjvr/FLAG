import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Client } from "@/lib/data";
import { RISK_TAGS, POS_TAGS, share } from "@/lib/data";

export function SignalBar({ client, className = "" }: { client: Client; className?: string }) {
  const pct = share(client);
  return (
    <div className={`flex h-2 w-full overflow-hidden rounded-full bg-ink/10 ${className}`}>
      <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
      <div className="h-full bg-amber-warn/70" style={{ width: `${Math.round((client.mixed / Math.max(1, client.total)) * 100)}%` }} />
      <div className="h-full bg-melon" style={{ width: `${Math.round((client.flagged / Math.max(1, client.total)) * 100)}%` }} />
    </div>
  );
}

export function ClientCard({ client }: { client: Client }) {
  const pct = share(client);
  const topRisks = RISK_TAGS.map((t) => ({ t, v: client.tags[t] })).sort((a, b) => b.v - a.v).slice(0, 2);
  const topPos = POS_TAGS.map((t) => ({ t, v: client.tags[t] })).sort((a, b) => b.v - a.v).slice(0, 2);
  return (
    <Link href={`/clients/${client.id}`} className="group block border border-ink bg-white transition-colors hover:bg-cream/40">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink/12 px-5 py-3">
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">{client.channel}</span>
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">{client.total} engagements</span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-[24px] leading-tight">{client.name}</h3>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
        </div>
        <p className="mono mt-1 text-[11px] uppercase tracking-[0.1em] text-ink-soft">{client.location} · {client.standing} · {pct}% positive</p>
        <SignalBar client={client} className="mt-4" />
        <div className="mono mt-2 flex justify-between text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          <span>{client.positive} positive</span><span>{client.flagged} flagged</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink/10 pt-3 text-[12px]">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-leaf">Often</p>
            {topPos.map((r) => (<p key={r.t} className="mt-0.5 text-ink-soft">{r.t} · <span className="font-semibold text-ink">{r.v}</span></p>))}
          </div>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-melon-deep">Watch</p>
            {topRisks.map((r) => (<p key={r.t} className="mt-0.5 text-ink-soft">{r.t} · <span className="font-semibold text-ink">{r.v}</span></p>))}
          </div>
        </div>
      </div>
    </Link>
  );
}
