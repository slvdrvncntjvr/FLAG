import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadLogReviewQueue } from "@/server/db/queries/reviews";
export const dynamic = "force-dynamic";
export default async function Page() {
  const viewer = await viewerOrRedirect(), cases = await loadLogReviewQueue(await getDb(), viewer.id);
  return <>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="font-serif text-2xl">Log review queue</h1>
      <p className="register-kicker">{cases.length} awaiting review</p>
    </header>
    <p className="mt-2 text-sm text-muted">Oldest first. Overdue after 36 hours; decisions target 48 hours. Claims last 30 minutes.</p>
    {!cases.length && <p className="register-panel mt-6 text-sm text-muted">No eligible log, update or correction reviews are waiting.</p>}
    {cases.length > 0 && <ol className="register-ledger mt-4 divide-y divide-rule">{cases.map(c => (
      <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
        <a className="block py-2 font-semibold text-accent underline-offset-4 hover:underline" href={`/moderation/${c.kind === "correction" ? "corrections" : "logs"}/${encodeURIComponent(c.id)}`}>{c.ref} · {c.kind.replaceAll("_", " ")}</a>
        <p className={c.overdue ? "text-sm font-medium text-danger" : "text-sm text-muted"}>
          {c.waitingHours} hours waiting{c.overdue && " · Overdue"} · {c.status.replaceAll("_", " ")}
        </p>
      </li>
    ))}</ol>}
  </>;
}
