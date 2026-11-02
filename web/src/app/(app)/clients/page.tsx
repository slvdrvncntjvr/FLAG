import type { Metadata } from "next";
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
    return <><h1 className="font-serif text-2xl">Your client record</h1><p className="mt-4">Your client profile is created when you accept an engagement.</p></>;
  }
  if (viewer.role !== "freelancer") notFound();
  const { q, after } = await searchParams;
  const name = typeof q === "string" ? q.trim() : "";
  const valid = name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
  const rows = valid ? await searchClientNames(db, viewer.id, name, typeof after === "string" ? after : null) : [];
  return <>
    <h1 className="font-serif text-2xl">Client records</h1>
    <p className="mt-2">Search registered client names. Clients with the same name have separate records.</p>
    <form action="/clients" method="get" role="search" className="mt-6">
      <label htmlFor="client-name" className="block font-medium">Client name</label>
      <input id="client-name" name="q" type="search" maxLength={100} required defaultValue={valid ? name : ""}
        className="mt-2 min-h-11 w-full rounded-sm border border-rule bg-paper px-3 py-2" autoComplete="off" />
      <button type="submit" className="mt-3 min-h-11 rounded-sm border border-ink px-5 py-2">Search</button>
    </form>
    {!valid && <p role="alert" className="mt-4">Enter a client name of up to 100 characters.</p>}
    {valid && name && <section aria-label="Matching clients" className="mt-8">
      <h2 className="font-serif text-xl">Matching clients</h2>
      {rows.length === 0 ? <p className="mt-4">No matching registered clients.</p> : <ul className="mt-4 divide-y divide-rule">{rows.map(row => <li key={row.id} className="break-words py-4">
        <Link href={`/clients/${row.id}`} className="inline-block min-h-11 py-2 font-serif text-xl underline">{row.name}</Link>
        <p className="capitalize">{row.kind}{row.city ? ` · ${row.city}` : ""}</p>
        <p><span className="font-mono">{row.engagementCount}</span> accepted {row.engagementCount === 1 ? "engagement" : "engagements"}</p>
      </li>)}</ul>}
      {rows.length === CLIENT_SEARCH_LIMIT && <Link className="mt-4 inline-block min-h-11 py-2 underline"
        href={`/clients?q=${encodeURIComponent(name)}&after=${encodeURIComponent(rows[rows.length - 1].id)}`}>More matching clients</Link>}
    </section>}
  </>;
}
