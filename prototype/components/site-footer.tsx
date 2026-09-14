import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-ink text-paper">
      <div className="px-5 py-12 sm:px-8">
        <p className="specimen text-paper/50">003 · The record stays open</p>
        <h2 className="display mt-3 text-[16vw] leading-[0.85] sm:text-[8vw]">Log good<br /><span className="outline-paper">work too.</span></h2>
        <div className="mt-8 grid gap-8 border-t border-paper/15 pt-8 md:grid-cols-3">
          <p className="max-w-sm text-sm leading-6 text-paper/70">Balanced log, proof on every entry, reply open. Awareness only. Not legal advice, not a ranking.</p>
          <div className="mono text-[12px] uppercase tracking-[0.12em]">
            <Link href="/browse" className="block py-1 hover:text-white">Browse the log</Link>
            <Link href="/report" className="block py-1 hover:text-white">Log an engagement</Link>
            <Link href="/moderation" className="block py-1 hover:text-white">How review works</Link>
          </div>
          <div className="mono text-[12px] uppercase tracking-[0.12em] text-paper/60">
            <p>Verified only · Proof required</p>
            <p className="mt-2">48h review · Demo data</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
