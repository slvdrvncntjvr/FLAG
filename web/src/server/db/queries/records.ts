import type { Db } from "@/server/db";
import { idInput } from "@/features/logs/schema";
import { CLIENT_SEARCH_LIMIT, RECORD_PAGE_SIZE, type ClientMatch, type ClientRecord } from "@/features/records/model";
import { engagementActor } from "./engagements";
import { contentDeadlineCtes, contentDeadlineSql } from "./content-deadlines";

// Fixed identifiers only. julianday alone accepts bare numbers and normalizes
// impossible calendar dates, so also require the project's ISO calendar form.
function timestampSql(column: "l.published_at" | "l.expires_at" | "r.decided_at") {
  return `(${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*'
    AND date(substr(${column},1,10),'+0 days') IS substr(${column},1,10)
    AND julianday(${column}) IS NOT NULL)`;
}

// Fixed aliases l/r; shared boundary for lifecycle/publication integration.
export const eligibleRecordSql = `(l.status='published' AND julianday(l.published_at) IS NOT NULL
    AND ${timestampSql("l.published_at")} AND ${timestampSql("l.expires_at")} AND ${timestampSql("r.decided_at")})
  AND (julianday(l.published_at)<=julianday('now')
    AND julianday(l.expires_at)>julianday('now') AND julianday(l.expires_at)>julianday(l.published_at))
  AND ${contentDeadlineSql("revision", "r")}
  AND (r.decision IN ('approve','correct') AND r.decided_by IS NOT NULL AND r.invalidated_at IS NULL AND r.state='submitted'
    AND julianday(r.decided_at) IS NOT NULL AND julianday(r.decided_at)<=julianday('now'))
  AND EXISTS(SELECT 1 FROM user filer WHERE filer.id=l.freelancer_id
    AND (filer.deactivated_at IS NULL OR julianday(l.name_retention_until)>julianday('now')))
  AND NOT EXISTS(SELECT 1 FROM maintenance_task mt WHERE mt.status IN ('claimed','blocked')
    AND ((mt.target_type='engagement_log' AND mt.target_id=l.id) OR (mt.target_type='log_revision' AND mt.target_id=r.id)))
  AND (SELECT count(*) FROM revision_proof rp WHERE rp.revision_id=r.id) BETWEEN 1 AND 5
  AND EXISTS(SELECT 1 FROM review_round rr JOIN moderation_case mc ON mc.id=rr.case_id
    WHERE rr.revision_id=r.id AND rr.reviewer_id=r.decided_by AND rr.decided_at=r.decided_at
    AND rr.decision=r.decision AND mc.log_id=l.id AND mc.kind IN ('log','filer_update','correction') AND mc.status='decided'
    AND NOT EXISTS(SELECT 1 FROM revision_proof rp LEFT JOIN proof_file p ON p.id=rp.proof_id
      WHERE rp.revision_id=r.id AND (p.id IS NULL OR p.log_id!=l.id OR p.owner_kind!='filer' OR p.status!='attached' OR p.purge_inflight!=0
        OR NOT (${contentDeadlineSql("proof", "p")})
        OR EXISTS(SELECT 1 FROM maintenance_task mt WHERE mt.target_type='proof_file' AND mt.target_id=p.id AND mt.status IN ('claimed','blocked'))
        OR NOT EXISTS(SELECT 1 FROM proof_review pr WHERE pr.round_id=rr.id AND pr.proof_id=p.id
          AND pr.proof_sha256=p.sha256 AND pr.verdict='accepted'))))`;

// Every read repeats the live role, suspension and current-policy predicates in
// SQL. A page guard or a previously loaded Viewer is not data authorization.
export async function searchClientNames(db: Db, actorId: string | null, input: unknown, after: string | null = null): Promise<ClientMatch[]> {
  if (!actorId || typeof input !== "string") return [];
  if (after !== null && !idInput.safeParse(after).success) return [];
  const name = input.trim();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return [];
  const actor = engagementActor("freelancer", actorId);
  const escaped = name.replace(/[\\%_]/g, "\\$&");
  const result = await db.$client.prepare(`SELECT cp.id,cp.display_name AS name,cp.kind,cp.city,
    (SELECT count(*) FROM engagement e WHERE e.client_id=cp.id AND e.status='accepted') AS engagementCount
    FROM client_profile cp JOIN user client_user ON client_user.id=cp.user_id
    WHERE client_user.deactivated_at IS NULL AND length(trim(cp.display_name))>0 AND cp.display_name LIKE ? ESCAPE '\\' AND ${actor.text}
      AND (? IS NULL OR EXISTS(SELECT 1 FROM client_profile anchor WHERE anchor.id=? AND (
        cp.display_name COLLATE NOCASE>anchor.display_name COLLATE NOCASE OR
        (cp.display_name COLLATE NOCASE=anchor.display_name COLLATE NOCASE AND cp.id>anchor.id))))
    ORDER BY cp.display_name COLLATE NOCASE ASC,cp.id ASC LIMIT ?`)
    .bind(`%${escaped}%`, ...actor.args, after, after, CLIENT_SEARCH_LIMIT).all<ClientMatch>();
  return result.results;
}

export async function loadOwnClientRecordId(db: Db, actorId: string | null): Promise<string | null> {
  if (!actorId) return null;
  const actor = engagementActor("client", actorId);
  const row = await db.$client.prepare(`SELECT cp.id FROM client_profile cp
    WHERE cp.user_id=? AND ${actor.text}`).bind(actorId, ...actor.args).first<{ id: string }>();
  return row?.id ?? null;
}

// A single statement gives header, complete aggregates and the requested log
// page one coherent snapshot. Only allowlisted approved content leaves D1.
// Uses the reviewed lifecycle schema and approval receipts; preserved legacy
// rows with no genuine review receipts remain ineligible until actually reviewed.
export async function loadClientRecord(db: Db, actorId: string | null, clientId: string, requestedPage = 1): Promise<ClientRecord | null> {
  if (!actorId || !idInput.safeParse(clientId).success) return null;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 99999 ? requestedPage : 1;
  const freelancer = engagementActor("freelancer", actorId);
  const client = engagementActor("client", actorId);
  const row = await db.$client.prepare(`WITH ${contentDeadlineCtes}, target AS (
      SELECT cp.id,cp.display_name AS name FROM client_profile cp JOIN user cu ON cu.id=cp.user_id
      WHERE cp.id=? AND cu.deactivated_at IS NULL AND length(trim(cp.display_name))>0
      AND (${freelancer.text} OR (cp.user_id=? AND ${client.text}))
    ), eligible AS MATERIALIZED (
      SELECT l.ref,l.freelancer_id,l.published_at,r.id AS revision_id,r.rating,r.outcome,r.facts,
        r.period_start,r.period_end,r.decided_at,r.effective_on,r.kind,fp.display_name AS filer_name,
        row_number() OVER (PARTITION BY l.freelancer_id,l.client_id ORDER BY l.published_at DESC,l.ref ASC) AS vote
      FROM target cp JOIN engagement_log l ON l.client_id=cp.id
      JOIN log_revision r ON r.id=l.current_revision_id AND r.log_id=l.id
      JOIN freelancer_profile fp ON fp.user_id=l.freelancer_id
      WHERE ${eligibleRecordSql}
    ), summary AS (
      SELECT count(*) AS publishedLogCount,count(CASE WHEN vote=1 THEN 1 END) AS contributorCount,
        avg(CASE WHEN vote=1 THEN rating END) AS average,
        count(CASE WHEN outcome='negative' THEN 1 END) AS negative,
        count(CASE WHEN outcome='mixed' THEN 1 END) AS mixed,
        count(CASE WHEN outcome='positive' THEN 1 END) AS positive FROM eligible
    )
    SELECT target.id,target.name,summary.*,
      (SELECT json_group_array(json_object('tag',tag,'count',n)) FROM (
        SELECT t.tag,count(*) AS n FROM eligible e JOIN log_tag t ON t.revision_id=e.revision_id GROUP BY t.tag ORDER BY t.tag
      )) AS tagsJson,
      (SELECT json_group_array(json_object('ref',ref,'filerName',filer_name,'rating',rating,'outcome',outcome,
        'facts',facts,'periodStart',period_start,'periodEnd',period_end,'publishedAt',published_at,
        'reviewedAt',decided_at,'updateEffectiveOn',effective_on,'updateApprovedAt',CASE WHEN kind IN ('filer_update','correction') THEN decided_at ELSE NULL END,
        'tags',json((SELECT json_group_array(tag) FROM (SELECT tag FROM log_tag WHERE revision_id=entries.revision_id ORDER BY tag)))))
        FROM (SELECT * FROM eligible ORDER BY published_at DESC,ref ASC LIMIT ? OFFSET ?) entries) AS logsJson
    FROM target CROSS JOIN summary`)
    .bind(clientId, ...freelancer.args, actorId, ...client.args, RECORD_PAGE_SIZE, (page - 1) * RECORD_PAGE_SIZE)
    .first<{ id: string; name: string; publishedLogCount: number; contributorCount: number; average: number | null;
      negative: number; mixed: number; positive: number; tagsJson: string; logsJson: string }>();
  if (!row) return null;
  return { id: row.id, name: row.name, average: row.average === null ? null : row.average.toFixed(1),
    contributorCount: row.contributorCount, limited: row.contributorCount > 0 && row.contributorCount < 5,
    publishedLogCount: row.publishedLogCount, outcomes: { negative: row.negative, mixed: row.mixed, positive: row.positive },
    tags: JSON.parse(row.tagsJson) as ClientRecord["tags"], logs: JSON.parse(row.logsJson) as ClientRecord["logs"],
    page, pageCount: Math.ceil(row.publishedLogCount / RECORD_PAGE_SIZE) };
}
