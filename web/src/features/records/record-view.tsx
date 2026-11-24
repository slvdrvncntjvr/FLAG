import { EMPTY_RECORD, type ClientRecord } from "./model";
import { RegisterPageHeading } from "@/components/register-page-heading";

const outcomeColors = {
  positive: "bg-accent",
  mixed: "bg-[repeating-linear-gradient(135deg,var(--paper)_0_2px,var(--accent)_2px_3px)]",
  negative: "bg-danger",
};
const outcomes = ["positive", "mixed", "negative"] as const;

function RecordDate({ value }: { value: string }) {
  return <time dateTime={value} className="font-mono">{value.slice(0, 10)}</time>;
}

export function ClientRecordView({ record, ownRecord = false }: { record: ClientRecord; ownRecord?: boolean }) {
  return (
    <>
      <section aria-label="Record summary">
        <RegisterPageHeading title={ownRecord ? "Your record" : record.name} label={ownRecord ? record.name : "Client record"}>
          <p>Published experiences from the past 12 months. Each freelancer contributes one current rating.</p>
        </RegisterPageHeading>
        {record.average === null ? (
          <p className="register-empty text-sm">{EMPTY_RECORD}</p>
        ) : (
          <div className="register-record-metrics">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {record.publishedLogCount} published {record.publishedLogCount === 1 ? "log" : "logs"} · {record.contributorCount} {record.contributorCount === 1 ? "contributor" : "contributors"}
              </p>
              {record.limited && <p className="register-status mt-2">Limited record</p>}
            </div>
            <p className="text-sm text-muted"><strong className="font-mono text-ink">{record.average} / 5</strong> average rating</p>
          </div>
        )}
      </section>
      {record.average !== null && (
        <>
          <section aria-label="Outcomes across published logs" className="register-ledger mt-4 max-w-3xl py-4">
            <OutcomeMix counts={record.outcomes} />
          </section>
          <section aria-label="Tag counts" className="mt-5">
            <h2 className="register-kicker">Tags across published logs</h2>
            {record.tags.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {record.tags.map(({ tag, count }) => (
                  <li className="rounded-full bg-tint px-3 py-1" key={tag}>{tag}: <span className="font-mono">{count}</span></li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">No tags on published logs.</p>}
          </section>
          <section aria-label="Published experiences" className="mt-6">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Published experiences</h2>
            {record.logs.length === 0 && <p className="register-ledger mt-2 py-4 text-sm text-muted">No experiences on this page.</p>}
            <ol className="register-ledger max-w-4xl divide-y divide-rule">
              {record.logs.map(log => (
                <li key={log.ref} className="py-5">
                  <article>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-lg font-semibold tracking-tight">{log.filerName}</h3>
                      <p className="register-status"><span className="capitalize">{log.outcome}</span> <span className="font-mono">{log.rating} / 5</span></p>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted">{log.ref}</p>
                    <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{log.facts}</p>
                    <p className="mt-2 text-xs text-muted">Published <RecordDate value={log.publishedAt} /> · Reviewed <RecordDate value={log.reviewedAt} /></p>
                    {log.updateApprovedAt && <p className="mt-1 text-xs text-muted">Current update approved <RecordDate value={log.updateApprovedAt} /></p>}
                    {log.updateEffectiveOn && <p className="mt-1 text-xs text-muted">Update effective <RecordDate value={log.updateEffectiveOn} /></p>}
                    <p className="mt-1 text-xs text-muted">Covered period: <RecordDate value={log.periodStart} /> to <RecordDate value={log.periodEnd} /></p>
                    {log.tags.length > 0 && (
                      <ul aria-label="Experience tags" className="mt-2 flex flex-wrap gap-2 text-xs">
                        {log.tags.map(tag => <li key={tag} className="rounded-full bg-tint px-3 py-1">{tag}</li>)}
                      </ul>
                    )}
                  </article>
                </li>
              ))}
            </ol>
            {record.pageCount > 1 && (
              <nav aria-label="Experience pages" className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
                {record.page > 1 && <a className="register-secondary" href={`/clients/${record.id}?page=${record.page - 1}`}>Previous</a>}
                <span className="font-mono">Page {record.page} of {record.pageCount}</span>
                {record.page < record.pageCount && <a className="register-secondary" href={`/clients/${record.id}?page=${record.page + 1}`}>Next</a>}
              </nav>
            )}
          </section>
        </>
      )}
    </>
  );
}

function OutcomeMix({ counts }: { counts: ClientRecord["outcomes"] }) {
  return (
    <>
      <h2 className="text-sm font-semibold">Outcomes across published logs</h2>
      <div className="mt-2 flex h-4 overflow-hidden rounded-full border border-accent bg-paper" aria-hidden="true">
        {outcomes.map(outcome => counts[outcome] > 0 && (
          <span key={outcome} className={outcomeColors[outcome]} style={{ flexGrow: counts[outcome] }} />
        ))}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {outcomes.map(outcome => (
          <div className="flex items-baseline gap-1" key={outcome}>
            <dt className="capitalize">{outcome}</dt>
            <dd className="font-mono">{counts[outcome]}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
