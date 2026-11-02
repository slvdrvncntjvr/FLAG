import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerOrRedirect } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { candidateProofs, candidateRevision, loadReviewCase } from "@/server/db/queries/reviews";
import { CaseLeaseForm, LogDecisionForm, RiskHideForm } from "./log-forms";
export async function ReviewPage({ caseId, correction = false }: { caseId: string; correction?: boolean }) {
  const viewer = await viewerOrRedirect(), db = await getDb();
  const c = await loadReviewCase(db, viewer.id, caseId);
  if (!c || (c.kind === "correction") !== correction) notFound();
  const r = await candidateRevision(db, c);
  if (!r) notFound();
  const [proofs, tags, rounds, context, request] = await Promise.all([
    candidateProofs(db, c, r.id), db.$client.prepare("SELECT tag FROM log_tag WHERE revision_id=? ORDER BY tag").bind(r.id).all<{ tag: string }>(),
    db.$client.prepare("SELECT round_no,decision,reason,decided_at FROM review_round WHERE case_id=? ORDER BY round_no").bind(c.id).all<{ round_no: number; decision: string; reason: string; decided_at: string }>(),
    db.$client.prepare("SELECT e.title,l.anchor_kind,l.anchor_date,cp.display_name AS client_name FROM engagement_log l JOIN engagement e ON e.id=l.engagement_id JOIN client_profile cp ON cp.id=l.client_id WHERE l.id=?").bind(c.log_id).first<{ title: string; anchor_kind: string; anchor_date: string; client_name: string }>(),
    c.correction_request_id ? db.$client.prepare("SELECT new_evidence_note,hidden_at,hide_reason FROM correction_request WHERE id=?").bind(c.correction_request_id).first<{ new_evidence_note: string; hidden_at: string | null; hide_reason: string | null }>() : null,
  ]);
  const ownLease = c.status === "claimed" && c.claimed_by === viewer.id && !!c.claimed_until && c.claimed_until > new Date().toISOString();
  const claimable = c.status === "open" || (c.status === "claimed" && !!c.claimed_until && c.claimed_until <= new Date().toISOString());
  return <><Link href={correction ? "/moderation/corrections" : "/moderation/logs"} className="underline">{correction ? "Back to private correction queue" : "Back to log review queue"}</Link><h1 className="mt-5 font-serif text-3xl">{correction ? "Private correction review" : c.kind === "filer_update" ? "Filer update review" : "Engagement log review"}</h1>
    <p className="mt-3 font-mono">{c.ref} · {c.status}</p><p className="mt-2">Waiting since <time>{c.created_at}</time>. Claiming and resubmission preserve this queue age.</p>
    <dl className="my-6 space-y-3 border-y border-rule py-5"><div><dt className="text-muted">Named client and engagement</dt><dd>{context?.client_name} · {context?.title}</dd></div><div><dt className="text-muted">Filing anchor</dt><dd>{context?.anchor_kind.replaceAll("_", " ")} · {context?.anchor_date}</dd></div><div><dt className="text-muted">Covered work</dt><dd>{r.period_start} – {r.period_end}</dd></div><div><dt className="text-muted">Proposed rating and tags</dt><dd>{r.rating}/5 · {r.outcome} · {tags.results.map(t => t.tag).join(", ")}</dd></div><div><dt className="text-muted">Written facts</dt><dd className="whitespace-pre-wrap break-words">{r.facts}</dd></div>{r.effective_on && <div><dt>Update effective date</dt><dd>{r.effective_on}</dd></div>}</dl>
    {request && <section className="my-6 space-y-3 border-y border-rule py-4"><h2 className="font-serif text-xl">Private client evidence note</h2><p className="whitespace-pre-wrap break-words">{request.new_evidence_note}</p>{request.hidden_at && <p>Temporarily hidden: {request.hide_reason}</p>}</section>}
    {claimable && <CaseLeaseForm caseId={c.id} />}
    {ownLease && c.claimed_until && <><p className="font-mono">Your lease ends {c.claimed_until}</p><LogDecisionForm key={`${c.claimed_until}:${r.id}`} caseId={c.id} lease={c.claimed_until} revisionId={r.id} currentRevisionId={c.current_revision_id} requestId={c.correction_request_id ?? undefined}
      proofs={proofs.map(p => ({ id: p.id, sha256: p.sha256, mime: p.mime, size_bytes: p.size_bytes, kind: p.kind }))}
      fields={{ rating: r.rating, facts: r.facts, tags: tags.results.map(t => t.tag), periodStart: r.period_start, periodEnd: r.period_end, amountCentavos: r.amount_centavos }} />
      {c.correction_request_id && c.current_revision_id && !request?.hidden_at && <RiskHideForm caseId={c.id} lease={c.claimed_until} requestId={c.correction_request_id} currentRevisionId={c.current_revision_id} />}<CaseLeaseForm caseId={c.id} lease={c.claimed_until} /></>}
    {!ownLease && !claimable && <p className="my-6" role="status">{c.status === "awaiting_changes" ? "Waiting for participant changes." : c.status === "claimed" ? `Another moderator holds this claim until ${c.claimed_until}.` : "This case is closed."}</p>}
    {!!rounds.results.length && <section className="my-8"><h2 className="font-serif text-2xl">Private review history</h2><ol className="mt-4 divide-y divide-rule">{rounds.results.map(round => <li key={round.round_no} className="space-y-2 py-4"><p>Round {round.round_no}: {round.decision.replaceAll("_", " ")} · <time>{round.decided_at}</time></p><p className="whitespace-pre-wrap break-words">{round.reason}</p></li>)}</ol></section>}
  </>;
}
