import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadOwnClientRecordId, searchClientNames } from "@/server/db/queries/records";
import { CLIENT_SEARCH_LIMIT } from "@/features/records/model";

export const metadata: Metadata = { title: "Client records", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string | string[]; after?: string | string[] }> }) {
  const viewer = await viewerOrRedirect();
  const db = await getDb();
  if (viewer.role === "client") {
    const ownId = await loadOwnClientRecordId(db, viewer.id);
    if (ownId) redirect(`/clients/${ownId}`);
    return (
      <>
        <h1 className="font-serif text-[1.375rem] leading-tight">Your client record</h1>
        <p className="register-ledger mt-3 py-4 text-sm text-muted">Your client profile is created when you accept an engagement.</p>
      </>
    );
  }
  if (viewer.role !== "freelancer") notFound();
  const { q, after } = await searchParams;
  const name = typeof q === "string" ? q.trim() : "";
  const valid = name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
  const rows = valid ? await searchClientNames(db, viewer.id, name, typeof after === "string" ? after : null) : [];
  return <>
    <h1 className="font-serif text-[1.375rem] leading-tight">Search the register</h1>
    <form action="/clients" method="get" role="search" className="mt-2 flex items-start gap-2">
      <label htmlFor="client-name" className="sr-only">Client name</label>
      <input id="client-name" name="q" type="search" maxLength={100} required defaultValue={valid ? name : ""}
        className="register-field min-w-0 flex-1" placeholder="Client name" aria-describedby="client-search-help" autoComplete="off" />
      <button type="submit" className="register-primary h-[3.25rem] min-h-[3.25rem]! w-[3.375rem] shrink-0 p-0!">
        <Image src="/register/search.svg" alt="" width={24} height={24} unoptimized />
        <span className="sr-only">Search</span>
      </button>
    </form>
    <p id="client-search-help" className="mt-3 text-sm text-muted">Search registered client names. Clients with the same name have separate records.</p>
    {!valid && <p role="alert" className="register-callout mt-4 text-sm text-danger">Enter a client name of up to 100 characters.</p>}
    {valid && name && <section aria-label="Matching clients" className="mt-4">
      <h2 className="register-kicker">{rows.length} {rows.length === 1 ? "result" : "results"} on this page for “{name}”</h2>
      {rows.length === 0 ? <p className="register-ledger mt-1 py-4 text-sm text-muted">No matching registered clients.</p> : (
        <ul className="mt-1 divide-y divide-rule border-y-2 border-ink">
          {rows.map(row => (
            <li key={row.id}>
              <Link href={`/clients/${row.id}`} className="group block py-3 hover:bg-tint" aria-label={row.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="min-w-0 font-serif text-xl font-semibold">{row.name}</h3>
                  <p className="text-xs text-muted"><span className="font-mono">{row.engagementCount}</span> accepted {row.engagementCount === 1 ? "engagement" : "engagements"}</p>
                </div>
                <p className="mt-2 text-sm"><span className="capitalize">{row.kind}</span>{row.city && ` · ${row.city}`}</p>
                <p className="text-xs font-medium text-danger group-hover:underline">View profile <span aria-hidden="true">›</span></p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === CLIENT_SEARCH_LIMIT && <div className="mt-5 text-center"><Link className="register-secondary text-sm"
        href={`/clients?q=${encodeURIComponent(name)}&after=${encodeURIComponent(rows[rows.length - 1].id)}`}>More matching clients</Link></div>}
    </section>}
  </>;
}
