import Link from "next/link";

export function PageShell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-mono text-sm font-medium tracking-wide">
            FLAG
          </Link>
          {aside}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-rule">
        <nav className="mx-auto flex max-w-2xl gap-4 px-4 py-4 text-sm text-muted">
          <Link href="/legal/privacy" className="underline underline-offset-2">Privacy notice</Link>
          <Link href="/legal/terms" className="underline underline-offset-2">Terms</Link>
        </nav>
      </footer>
    </>
  );
}
