import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, FileText, MessageSquareReply } from "lucide-react";
import { getClient, reportsFor, TAG_STYLE, POS_TAGS, RISK_TAGS, share } from "@/lib/data";
import { Reveal } from "@/components/reveal";
import { SignalBar } from "@/components/client-card";
import { cn } from "@/lib/utils";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) return notFound();
  const entries = reportsFor(id);
  return (
    <div className="pb-10 pt-10">
      <Link href="/browse" className="mono inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Full log</Link>
      <Reveal>
        <div className="mt-4 border border-ink bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/12 px-5 py-3 sm:px-8">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">{client.channel} · Since {client.firstSeen}</p>
            <span className="stamp">{client.standing} · {share(client)}% positive</span>
          </div>
          <div className="px-5 py-6 sm:px-8">
            <h1 className="font-serif text-[36px] leading-tight sm:text-[44px]">{client.name}</h1>
            <p className="mono mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">{client.total} engagements · {client.positive} positive · {client.flagged} flagged · Active {client.lastActivity}</p>
            <SignalBar client={client} className="mt-5 h-2.5" />
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mono text-[11px] uppercase tracking-[0.14em] text-leaf">Positive signals</p>
                {POS_TAGS.map((t) => (
                  <div key={t} className="ledger-row flex items-center justify-between py-2 text-[13px]"><span className="text-ink-soft">{t}</span><span className="mono font-semibold">{client.tags[t]}</span></div>
                ))}
              </div>
              <div>
                <p className="mono text-[11px] uppercase tracking-[0.14em] text-melon-deep">Risk signals</p>
                {RISK_TAGS.map((t) => (
                  <div key={t} className="ledger-row flex items-center justify-between py-2 text-[13px]"><span className="text-ink-soft">{t}</span><span className="mono font-semibold">{client.tags[t]}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
      <h2 className="mt-8 font-serif text-[26px]">Timeline, newest first</h2>
      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="border border-dashed border-ink/20 bg-white p-6 text-sm text-ink-soft">Aggregate counts above cover {client.total} engagements. Detailed demo entries for this file are still being added.</p>}
        {entries.map((r, i) => (
          <Reveal key={r.id} delay={i * 0.04}>
            <div className="border border-ink/15 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-xs font-semibold text-ink-faint">{r.id} · {r.date}</span>
                <span className={cn("mono text-[10px] font-bold uppercase tracking-[0.1em]", r.outcome === "Positive" ? "text-leaf" : r.outcome === "Flagged" ? "text-melon-deep" : "text-amber-warn")}>{r.outcome}</span>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", TAG_STYLE[r.tag])}>{r.tag}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-leaf"><BadgeCheck className="size-3.5" />{r.status}</span>
              </div>
              <p className="mt-2 text-[15px] leading-7">{r.summary}</p>
              <p className="mono mt-2 text-[11px] text-ink-soft"><FileText className="mr-1 inline size-3.5" />{r.proof} · {r.amount} · {r.period}</p>
              {r.reply ? (
                <div className="mt-4 border-l-2 border-leaf bg-leaf-soft/50 p-4 text-[13px] leading-6">
                  <p className="flex items-center gap-1.5 font-bold text-leaf"><MessageSquareReply className="size-4" /> Client reply</p>
                  <p className="mt-1 text-ink-soft">Thanks for logging this. Handler changed in Feb and terms moved to 15 days. Happy to share updated slips.</p>
                </div>
              ) : null}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
