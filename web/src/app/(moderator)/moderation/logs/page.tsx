import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadLogReviewQueue } from "@/server/db/queries/reviews";
export const dynamic = "force-dynamic";
export default async function Page() {
  const viewer = await viewerOrRedirect(), cases = await loadLogReviewQueue(await getDb(), viewer.id);
  return <><h1 className="font-serif text-3xl">Log review queue</h1><p className="mt-3">Oldest first. Overdue after 36 hours; decisions target 48 hours. Claims last 30 minutes.</p>
    {!cases.length && <p className="mt-6">No eligible log, update or correction reviews are waiting.</p>}
    <ol className="mt-6 divide-y divide-rule">{cases.map(c => <li key={c.id} className="space-y-2 py-5"><a className="block min-h-11 break-words py-2 underline" href={`/moderation/${c.kind === "correction" ? "corrections" : "logs"}/${encodeURIComponent(c.id)}`}>{c.ref} · {c.kind.replaceAll("_", " ")}</a><p>{c.waitingHours} hours waiting{c.overdue && " · Overdue"} · {c.status.replaceAll("_", " ")}</p></li>)}</ol></>;
}
