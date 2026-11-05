import type { Db } from "@/server/db";
import type { ProofRecord } from "@/features/logs/proof-storage";
import { moderatorPredicate, nowSql } from "./moderation";
import { contentWithinDeadline } from "./logs";
import { contentDeadlineCtes, contentDeadlineSql } from "./content-deadlines";

// Alias c is always the exact moderation case being changed. Values are bound.
export function caseGate(actorId: string) {
  return {
    text: `c.kind IN ('log','filer_update','correction') AND ${moderatorPredicate.text}
      AND EXISTS(SELECT 1 FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id
        WHERE l.id=COALESCE(c.log_id,CASE WHEN c.kind='log' THEN c.subject_id END)
        AND l.freelancer_id!=? AND cp.user_id!=?
        AND NOT EXISTS(SELECT 1 FROM engagement e WHERE e.client_id=l.client_id AND e.freelancer_id=? AND (e.status='accepted' OR e.accepted_at IS NOT NULL))
        AND (c.kind!='correction' OR (NOT EXISTS(SELECT 1 FROM review_round rr JOIN moderation_case original ON original.id=rr.case_id
          WHERE original.kind='log' AND COALESCE(original.log_id,original.subject_id)=l.id AND rr.decision='approve' AND rr.reviewer_id=?)
          AND NOT EXISTS(SELECT 1 FROM moderation_case original WHERE original.kind='log' AND COALESCE(original.log_id,original.subject_id)=l.id
            AND original.status='decided' AND original.decision='approve' AND original.decided_by=?))))`,
    args: [...moderatorPredicate.args(actorId), actorId, actorId, actorId, actorId, actorId],
  };
}
export function caseLease(actorId: string, lease: string) {
  const gate = caseGate(actorId);
  return { text: `${gate.text} AND c.status='claimed' AND c.claimed_by=? AND c.claimed_until=? AND c.claimed_until>${nowSql}`, args: [...gate.args, actorId, lease] };
}
export type CaseRow = {
  id: string; kind: "log" | "filer_update" | "correction"; subject_id: string; status: string;
  claimed_by: string | null; claimed_until: string | null; created_at: string; log_id: string;
  correction_request_id: string | null; ref: string; current_revision_id: string | null;
  published_at: string | null; expires_at: string | null; log_status: string;
  freelancer_id: string; client_id: string; name_retention_until: string | null;
  active_proof_ids: string | null;
};
export type CandidateRevision = { id: string; log_id: string; rev_no: number; kind: string; rating: number; outcome: string; facts: string; period_start: string; period_end: string; amount_centavos: number | null; effective_on: string | null; decision: string | null; state: string };
export async function loadReviewCase(db: Db, actorId: string | null, caseId: string): Promise<CaseRow | null> {
  if (!actorId) return null;
  const gate = caseGate(actorId);
  return db.$client.prepare(`SELECT c.id,c.kind,c.subject_id,c.status,c.claimed_by,c.claimed_until,c.created_at,
    l.id AS log_id,c.correction_request_id,l.ref,l.current_revision_id,l.published_at,l.expires_at,l.status AS log_status,
    l.freelancer_id,l.client_id,l.name_retention_until,cr.active_proof_ids
    FROM moderation_case c JOIN engagement_log l ON l.id=COALESCE(c.log_id,CASE WHEN c.kind='log' THEN c.subject_id END)
    LEFT JOIN correction_request cr ON cr.id=c.correction_request_id
    WHERE c.id=? AND ${gate.text}`).bind(caseId, ...gate.args).first<CaseRow>();
}
export async function candidateRevision(db: Db, c: CaseRow) {
  const revision = await db.$client.prepare(c.kind === "correction"
    ? "SELECT * FROM log_revision WHERE id=? AND log_id=?"
    : "SELECT * FROM log_revision WHERE log_id=? AND (moderation_case_id=? OR (?='log' AND kind='initial' AND moderation_case_id IS NULL)) ORDER BY rev_no DESC LIMIT 1")
    .bind(...(c.kind === "correction" ? [c.current_revision_id, c.log_id] : [c.log_id, c.id, c.kind])).first<CandidateRevision>();
  return revision && await contentWithinDeadline(db, "revision", revision.id) ? revision : null;
}
export async function candidateProofs(db: Db, c: CaseRow, revisionId: string): Promise<ProofRecord[]> {
  const result = await db.$client.prepare(`WITH ${contentDeadlineCtes} SELECT p.* FROM proof_file p
    JOIN log_revision r ON r.id=? AND r.log_id=p.log_id
    WHERE p.log_id=? AND p.status='attached'
    AND ${contentDeadlineSql("revision", "r")} AND ${contentDeadlineSql("proof", "p")}
    AND (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=?)
      OR (p.revision_id=? AND p.owner_kind='filer')
      OR (?='correction' AND p.correction_request_id=? AND p.owner_kind='client'
        AND EXISTS(SELECT 1 FROM correction_request cr,json_each(cr.active_proof_ids) selected WHERE cr.id=p.correction_request_id AND selected.value=p.id))) ORDER BY p.id`)
    .bind(revisionId, c.log_id, revisionId, revisionId, c.kind, c.correction_request_id).all<ProofRecord>();
  return result.results;
}
export async function loadLogReviewQueue(db: Db, actorId: string | null, kind: "correction" | null = null) {
  if (!actorId) return [];
  const gate = caseGate(actorId);
  const rows = await db.$client.prepare(`SELECT c.id,c.kind,c.status,c.created_at,c.claimed_by,c.claimed_until,l.ref,${nowSql} AS server_now
    FROM moderation_case c JOIN engagement_log l ON l.id=COALESCE(c.log_id,CASE WHEN c.kind='log' THEN c.subject_id END)
    WHERE c.status IN ('open','claimed','awaiting_changes') AND ${gate.text} AND (? IS NULL OR c.kind=?) ORDER BY c.created_at,c.id LIMIT 100`)
    .bind(...gate.args, kind, kind).all<{ id: string; kind: string; status: string; created_at: string; claimed_by: string | null; claimed_until: string | null; ref: string; server_now: string }>();
  return rows.results.map(r => ({ ...r, waitingHours: Math.max(0, Math.floor((Date.parse(r.server_now) - Date.parse(r.created_at)) / 3600000)), overdue: Date.parse(r.server_now) - Date.parse(r.created_at) > 36 * 3600000 }));
}
