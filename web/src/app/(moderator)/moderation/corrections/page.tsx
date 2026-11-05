import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadLogReviewQueue } from "@/server/db/queries/reviews";

export const dynamic = "force-dynamic";

export default async function CorrectionQueue() {
  const viewer = await viewerOrRedirect();
  const cases = await loadLogReviewQueue(await getDb(), viewer.id, "correction");
  return <><h1 className="font-serif text-3xl">Private correction queue</h1>
    <p className="mt-3">Oldest first. Independent decisions target 48 hours; cases are overdue after 36 hours. Claims last 30 minutes.</p>
    <p className="mt-3">Only cases you can independently review appear here. The original publication reviewer and participants cannot claim a correction.</p>
    {!cases.length && <p className="mt-6">No eligible private correction reviews are waiting.</p>}
    <ol className="mt-6 divide-y divide-rule">{cases.map(c => <li key={c.id} className="space-y-2 py-5">
      <a className="block min-h-11 break-words py-2 underline" href={`/moderation/corrections/${encodeURIComponent(c.id)}`}>{c.ref} · correction</a>
      <p>{c.waitingHours} hours waiting{c.overdue && " · Overdue"} · {c.status.replaceAll("_", " ")}</p>
    </li>)}</ol>
  </>;
}
