import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RegisterIcon } from "@/components/register-icon";
import { RegisterPageHeading } from "@/components/register-page-heading";
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
        <RegisterPageHeading title="Your client record" label="Private register" />
        <p className="register-empty text-sm"><RegisterIcon name="record" /> Your client profile is created when you accept an engagement.</p>
      </>
    );
  }
  if (viewer.role !== "freelancer") notFound();
  const { q, after } = await searchParams;
  const name = typeof q === "string" ? q.trim() : "";
  const valid = name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
  const rows = valid ? await searchClientNames(db, viewer.id, name, typeof after === "string" ? after : null) : [];
  return <>
    <RegisterPageHeading title="Search the register" label="Client records">
      <p id="client-search-help">Search registered client names. Clients with the same name have separate records.</p>
    </RegisterPageHeading>
    <form action="/clients" method="get" role="search" className="register-search-form max-w-2xl">
      <label htmlFor="client-name" className="register-kicker block">Client name</label>
      <div className="mt-2 flex items-stretch gap-1">
        <input id="client-name" name="q" type="search" maxLength={100} required defaultValue={valid ? name : ""}
          className="register-field min-w-0 flex-1" placeholder="Enter a registered name" aria-describedby="client-search-help" autoComplete="off" />
        <button type="submit" className="register-primary shrink-0 text-sm">
          <RegisterIcon name="search" /> Search
        </button>
      </div>
    </form>
    {!valid && <p role="alert" className="register-callout mt-4 text-sm text-danger">Enter a client name of up to 100 characters.</p>}
    {valid && name && <section aria-label="Matching clients" className="mt-4">
      <h2 className="register-kicker">{rows.length} {rows.length === 1 ? "result" : "results"} on this page for “{name}”</h2>
      {rows.length === 0 ? <p className="register-empty mt-2 text-sm"><RegisterIcon name="search" /> No matching registered clients.</p> : (
        <ul className="register-ledger mt-2 divide-y divide-rule">
          {rows.map(row => (
            <li key={row.id}>
              <Link href={`/clients/${row.id}`} className="group grid gap-1 px-2 py-3 hover:bg-tint" aria-labelledby={`name-${row.id}`} aria-describedby={`client-${row.id} count-${row.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 id={`name-${row.id}`} className="min-w-0 text-xl font-semibold">{row.name}</h3>
                  <p id={`count-${row.id}`} className="text-xs text-muted"><span className="font-mono">{row.engagementCount}</span> accepted {row.engagementCount === 1 ? "engagement" : "engagements"}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p id={`client-${row.id}`} className="text-sm"><span className="capitalize">{row.kind}</span>{row.city && ` · ${row.city}`}</p>
                  <p aria-hidden="true" className="flex items-center gap-1 text-xs font-semibold text-accent group-hover:underline">View profile <RegisterIcon name="arrow" className="size-3.5!" /></p>
                </div>
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
