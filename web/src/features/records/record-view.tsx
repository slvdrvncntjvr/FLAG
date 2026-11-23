import { EMPTY_RECORD, type ClientRecord } from "./model";

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
      {!ownRecord && <p className="register-kicker mb-2">Client record</p>}
      <section aria-label="Record summary" className={ownRecord ? "border-b border-rule pb-4" : "register-panel"}>
        <h1 className="font-serif text-2xl leading-tight">{ownRecord ? "Your record" : record.name}</h1>
        {ownRecord && <p className="mt-1 text-sm font-medium">{record.name}</p>}
        <p className="mt-1 text-sm text-muted">Published experiences from the past 12 months. Each freelancer contributes one current rating.</p>
        {record.average === null ? (
          <p className="mt-4 border-t border-rule pt-4 text-sm text-muted">{EMPTY_RECORD}</p>
        ) : (
          <div className={ownRecord ? "mt-3 border-t-2 border-ink pt-3" : "mt-3"}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={ownRecord ? "font-serif text-[2.75rem] leading-none font-bold" : "font-serif text-5xl leading-none font-bold text-accent"}>
                {record.average}
              </span>
              <span className="text-sm text-muted"> / 5 average rating</span>
            </p>
            <p className="mt-2 text-sm">
              <span className="font-mono">{record.contributorCount}</span> {record.contributorCount === 1 ? "contributor" : "contributors"}
              <span className="px-1.5 text-muted" aria-hidden="true">·</span>
              <span className="font-mono">{record.publishedLogCount}</span> published {record.publishedLogCount === 1 ? "log" : "logs"}
            </p>
            {record.limited && <p className="mt-2 inline-block rounded-full bg-coupon px-3 py-1 text-xs font-medium text-accent">Limited record</p>}
          </div>
        )}
      </section>
      {record.average !== null && (
        <>
          <section aria-label="Outcomes across published logs" className={ownRecord ? "border-b border-rule py-3" : "register-panel mt-2"}>
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
            <h2 className={ownRecord ? "register-kicker" : "font-serif text-xl"}>Published experiences</h2>
            {record.logs.length === 0 && <p className="register-ledger mt-2 py-4 text-sm text-muted">No experiences on this page.</p>}
            <ol className={ownRecord ? "mt-2 divide-y divide-rule border-b border-rule" : "mt-3 space-y-3"}>
              {record.logs.map(log => (
                <li key={log.ref} className={ownRecord ? "py-4 first:pt-0" : "register-panel"}>
                  <article>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="font-serif text-lg font-semibold text-accent capitalize">{log.outcome}</h3>
                      {ownRecord && (
                        <span className="flex gap-1.5" aria-hidden="true">
                          {Array.from({ length: log.rating }, (_, index) => (
                            <span className="size-3 bg-[url(/register/rating-dot.svg)] bg-center bg-no-repeat" key={index} />
                          ))}
                        </span>
                      )}
                      <p className="ml-auto text-sm">
                        {!ownRecord && <span aria-hidden="true" className="mr-2 tracking-wide text-accent">{"★".repeat(log.rating)}{"☆".repeat(5 - log.rating)}</span>}
                        <span className="font-mono">{log.rating} / 5</span>
                      </p>
                    </div>
                    <p className="mt-1 text-sm"><span className="font-medium">{log.filerName}</span> <span className="font-mono text-muted">{log.ref}</span></p>
                    <p className="mt-2 text-xs text-muted">Published <RecordDate value={log.publishedAt} /> · Reviewed <RecordDate value={log.reviewedAt} /></p>
                    {log.updateApprovedAt && <p className="mt-1 text-xs text-muted">Current update approved <RecordDate value={log.updateApprovedAt} /></p>}
                    {log.updateEffectiveOn && <p className="mt-1 text-xs text-muted">Update effective <RecordDate value={log.updateEffectiveOn} /></p>}
                    <p className="mt-1 text-xs text-muted">Covered period: <RecordDate value={log.periodStart} /> to <RecordDate value={log.periodEnd} /></p>
                    <p className="mt-3 whitespace-pre-wrap text-sm">{log.facts}</p>
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
