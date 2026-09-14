import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 mix-blend-difference">
      <div className="flex h-16 items-center justify-between px-5 text-white sm:px-8">
        <Link href="/" className="display text-[22px] tracking-tight">FLAG.</Link>
        <nav className="flex items-center gap-5 sm:gap-8">
          <Link href="/browse" className="mono text-[12px] font-semibold uppercase tracking-[0.16em] opacity-80 hover:opacity-100">Log</Link>
          <Link href="/report" className="mono text-[12px] font-semibold uppercase tracking-[0.16em] opacity-80 hover:opacity-100">File</Link>
          <Link href="/moderation" className="mono hidden text-[12px] font-semibold uppercase tracking-[0.16em] opacity-80 hover:opacity-100 sm:block">Review</Link>
          <Link href="/browse" className="mono border border-white/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] hover:bg-white hover:text-black">Check a client</Link>
        </nav>
      </div>
    </header>
  );
}
