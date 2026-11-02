import { EMPTY_RECORD, type ClientRecord } from "./model";

function RecordDate({ value }: { value: string }) {
  return <time dateTime={value} className="font-mono">{value.slice(0, 10)}</time>;
}

export function ClientRecordView({ record }: { record: ClientRecord }) {
  return <>
    <h1 className="break-words font-serif text-2xl">{record.name}</h1>
    <p className="mt-2 text-sm">Published experiences from the past 12 months. Each freelancer contributes one current rating.</p>
    {record.average === null ? <p className="mt-8 border-y border-rule py-6">{EMPTY_RECORD}</p> : <>
      <section aria-label="Record summary" className="mt-6 border-y border-rule py-5">
        <p><span className="font-mono text-2xl">{record.average}</span> / 5 average rating</p>
        <p className="mt-2"><span className="font-mono">{record.contributorCount}</span> {record.contributorCount === 1 ? "contributor" : "contributors"}</p>
        {record.limited && <p className="mt-2 font-medium">Limited record</p>}
        <p className="mt-3"><span className="font-mono">{record.publishedLogCount}</span> published {record.publishedLogCount === 1 ? "log" : "logs"}</p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{(["positive", "mixed", "negative"] as const).map(outcome => <div key={outcome}>
          <dt className="capitalize">{outcome}</dt><dd className="font-mono">{record.outcomes[outcome]}</dd>
        </div>)}</dl>
      </section>
      <section aria-label="Tag counts" className="mt-6">
        <h2 className="font-serif text-xl">Tags across published logs</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{record.tags.map(({ tag, count }) => <li key={tag}>{tag}: <span className="font-mono">{count}</span></li>)}</ul>
      </section>
      <section aria-label="Published experiences" className="mt-8">
        <h2 className="font-serif text-xl">Published experiences</h2>
        {record.logs.length === 0 && <p className="mt-4">No experiences on this page.</p>}
        <ol className="mt-4 divide-y divide-rule">{record.logs.map(log => <li key={log.ref} className="break-words py-5">
          <article>
            <h3 className="font-medium">{log.filerName} <span className="font-mono">{log.ref}</span></h3>
            <p className="mt-2"><span className="font-mono">{log.rating}</span> / 5 · <span className="capitalize">{log.outcome}</span></p>
            <p className="mt-2 text-sm">Published <RecordDate value={log.publishedAt} /> · Reviewed <RecordDate value={log.reviewedAt} /></p>
            {log.updateApprovedAt && <p className="mt-2 text-sm">Current update approved <RecordDate value={log.updateApprovedAt} /></p>}
            {log.updateEffectiveOn && <p className="mt-2 text-sm">Update effective <RecordDate value={log.updateEffectiveOn} /></p>}
            <p className="mt-2 text-sm">Covered period: <RecordDate value={log.periodStart} /> to <RecordDate value={log.periodEnd} /></p>
            <p className="mt-4 whitespace-pre-wrap">{log.facts}</p>
            <ul aria-label="Experience tags" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">{log.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
          </article>
        </li>)}</ol>
        {record.pageCount > 1 && <nav aria-label="Experience pages" className="mt-4 flex flex-wrap items-center gap-5 border-t border-rule pt-4">
          {record.page > 1 && <a className="inline-block min-h-11 py-2 underline" href={`/clients/${record.id}?page=${record.page - 1}`}>Previous</a>}
          <span className="font-mono">Page {record.page} of {record.pageCount}</span>
          {record.page < record.pageCount && <a className="inline-block min-h-11 py-2 underline" href={`/clients/${record.id}?page=${record.page + 1}`}>Next</a>}
        </nav>}
      </section>
    </>}
  </>;
}
