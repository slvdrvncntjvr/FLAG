import type { Db } from "@/server/db";
import { engagementActor } from "./engagements";
import { isOnboarded, loadViewer } from "./viewer";
import { idInput } from "@/features/logs/schema";
import { noActiveLogHold } from "@/features/logs/holds";
import { hasLifecycleSchema } from "./schema-capabilities";
import { contentDeadlineCtes, contentDeadlineSql } from "./content-deadlines";
import type { ProofRecord } from "@/features/logs/proof-storage";

export const intakeNow = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// Gates are repeated INSIDE conditional writes; a stale session/view model is not authority.
export function filerGate(actorId: string) {
  const actor = engagementActor("freelancer", actorId);
  return {
    text: `${actor.text} AND EXISTS(SELECT 1 FROM freelancer_profile fp WHERE fp.user_id=? AND fp.status='verified')`,
    args: [...actor.args, actorId],
  };
}
export function editableDraftGate(actorId: string) {
  const actor = filerGate(actorId);
  return {
    text: `freelancer_id=? AND status='draft' AND first_submitted_at IS NULL AND ${noActiveLogHold()}
      AND NOT EXISTS(SELECT 1 FROM proof_file blocked WHERE blocked.log_id=engagement_log.id AND blocked.status='pending_purge')
      AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=engagement_log.engagement_id AND e.status='accepted'
        AND e.freelancer_id=engagement_log.freelancer_id AND e.client_id=engagement_log.client_id)
      AND ${actor.text}`,
    args: [actorId, ...actor.args],
  };
}
// A zero-row conditional write must roll back all preceding statements in a batch.
// json() on invalid JSON raises in SQLite/D1; unlike an ignored UPDATE it cannot commit partial work.
export function assertChanged(db: Db) {
  return db.$client.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('private-intake-conflict') END AS applied");
}
export type PrivateProof = { id: string; kind: string; mime: string; sizeBytes: number; status: string };
export type PrivateLog = {
  id: string; ref: string; engagementId: string; title: string; status: string;
  anchorKind: "completed" | "terminated" | "missed_milestone"; anchorDate: string;
  firstSubmittedAt: string | null; submittedAt: string | null;
  rating: number; outcome: string; facts: string; periodStart: string; periodEnd: string;
  amountCentavos: number | null; tags: string[]; proofs: PrivateProof[]; canEdit: boolean;
  revisionId: string; reviewHistory: { decision: string; reason: string; decidedAt: string }[];
  draftReady: boolean;
};
export type IntakeEngagement = { id: string; title: string; startedOn: string; endedAt: string | null; clientName: string; log: PrivateLog | null };

async function reader(db: Db, actorId: string | null) {
  if (!actorId) return null;
  const viewer = await loadViewer(db, actorId);
  return viewer && !viewer.banned && isOnboarded(viewer) ? viewer : null;
}
// The retention views account for shared evidence and independent proposal clocks.
// Keep legacy deployed-schema reads compatible; lifecycle writers never use this fallback.
export async function contentWithinDeadline(db: Db, kind: "revision" | "proof", id: string): Promise<boolean> {
  if (!await hasLifecycleSchema(db)) return true;
  const table = kind === "revision" ? "log_revision" : "proof_file";
  const alias = kind === "revision" ? "r" : "p";
  return !!await db.$client.prepare(`WITH ${contentDeadlineCtes} SELECT 1 FROM ${table} ${alias} WHERE ${alias}.id=? AND ${contentDeadlineSql(kind, alias)}`).bind(id).first();
}
// Both page reads and proof delivery select the same authorized log revision.
// Fixed SQL aliases only; every actor/object value remains a bound parameter.
const privateLogJoins = `JOIN engagement e ON e.id=l.engagement_id
    JOIN client_profile cp ON cp.id=l.client_id
    JOIN log_revision r ON r.log_id=l.id AND r.id=COALESCE(l.current_revision_id,(SELECT newest.id FROM log_revision newest WHERE newest.log_id=l.id AND newest.kind='initial' ORDER BY newest.rev_no DESC LIMIT 1))`;
function privateLogPredicate(pilot: boolean) {
  return `l.status!='expired' AND (l.expires_at IS NULL OR l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ${pilot ? `AND ${contentDeadlineSql("revision", "r")}` : ""}
      AND (l.freelancer_id=? OR cp.user_id=? OR ?='moderator')`;
}
export async function loadReadableProof(db: Db, actorId: string, proofId: string): Promise<ProofRecord | null> {
  const viewer = await reader(db, actorId);
  if (!viewer) return null;
  const pilot = await hasLifecycleSchema(db);
  // Authorize bytes without constructing unrelated page tags, evidence lists
  // or review history. The same query checks the selected revision AND proof.
  return db.$client.prepare(`${pilot ? `WITH ${contentDeadlineCtes}` : ""}
    SELECT p.* FROM proof_file p JOIN engagement_log l ON l.id=p.log_id ${privateLogJoins}
    WHERE p.id=? AND p.status IN ('uploading','attached') AND ${privateLogPredicate(pilot)}
      ${pilot ? `AND ${contentDeadlineSql("proof", "p")}` : ""}`)
    .bind(proofId, viewer.id, viewer.id, viewer.role).first<ProofRecord>();
}
export async function loadPrivateLog(db: Db, actorId: string | null, logId: string): Promise<PrivateLog | null> {
  if (!idInput.safeParse(logId).success) return null;
  const viewer = await reader(db, actorId);
  if (!viewer) return null;
  // Existing private reads must survive a disabled-intake deployment at 0008/0009.
  // Probe schema capability on this D1 binding; do not cache across databases/migrations.
  const pilot = await hasLifecycleSchema(db);
  const row = await db.$client.prepare(`${pilot ? `WITH ${contentDeadlineCtes}` : ""} SELECT l.id,l.ref,l.engagement_id AS engagementId,e.title,l.status,
    l.anchor_kind AS anchorKind,l.anchor_date AS anchorDate,l.first_submitted_at AS firstSubmittedAt,l.submitted_at AS submittedAt,
    r.rating,r.outcome,r.facts,r.period_start AS periodStart,r.period_end AS periodEnd,r.amount_centavos AS amountCentavos,
    r.id AS revisionId,${pilot ? "r.state='draft' AND r.decision IS NULL" : "l.status='draft'"} AS draftReady,l.freelancer_id AS filer,CASE WHEN ${pilot ? noActiveLogHold("l") : "(l.hold_kind IS NULL OR (l.hold_released_at IS NOT NULL AND l.hold_released_at>=l.hold_placed_at))"} THEN 0 ELSE 1 END AS hasActiveHold
    FROM engagement_log l ${privateLogJoins}
    WHERE l.id=? AND ${privateLogPredicate(pilot)}`)
    .bind(logId, viewer.id, viewer.id, viewer.role).first<Omit<PrivateLog, "tags" | "proofs" | "canEdit"> & { filer: string; hasActiveHold: number }>();
  if (!row) return null;
  const [tags, proofs, history] = await Promise.all([
    db.$client.prepare("SELECT tag FROM log_tag WHERE revision_id=? ORDER BY tag").bind(row.revisionId).all<{ tag: string }>(),
    db.$client.prepare(`${pilot ? `WITH ${contentDeadlineCtes}` : ""} SELECT id,kind,mime,size_bytes AS sizeBytes,status FROM proof_file p WHERE log_id=? AND owner_kind='filer' AND status IN ('uploading','attached')
      ${pilot ? `AND ${contentDeadlineSql("proof", "p")}` : ""}
      AND (revision_id=? OR (revision_id IS NULL AND ?='draft')${pilot ? " OR EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=? AND rp.proof_id=p.id)" : ""}) ORDER BY uploaded_at,id`)
      .bind(logId, row.revisionId, row.status, ...(pilot ? [row.revisionId] : [])).all<PrivateProof>(),
    pilot ? db.$client.prepare(`SELECT rr.decision,rr.reason,rr.decided_at AS decidedAt FROM review_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.log_id=? AND c.kind='log' ORDER BY rr.round_no`).bind(logId)
      .all<{ decision: string; reason: string; decidedAt: string }>() : Promise.resolve({ results: [] }),
  ]);
  if (pilot && !await contentWithinDeadline(db, "revision", row.revisionId)) return null;
  const { filer, hasActiveHold, ...safe } = row;
  return { ...safe, draftReady: !!row.draftReady, tags: tags.results.map(t => t.tag), proofs: proofs.results, reviewHistory: history.results,
    canEdit: ["draft", "ask_changes"].includes(row.status) && !hasActiveHold && filer === viewer.id && viewer.role === "freelancer" && viewer.freelancerStatus === "verified" };
}
export async function loadLogForEngagement(db: Db, actorId: string | null, engagementId: string): Promise<IntakeEngagement | null> {
  if (!idInput.safeParse(engagementId).success || !actorId) return null;
  // Legacy capability affects this read only. All mutators retain the full live SQL gate.
  const pilot = await hasLifecycleSchema(db);
  const gate = pilot ? filerGate(actorId) : {
    text: "EXISTS(SELECT 1 FROM freelancer_profile fp WHERE fp.user_id=? AND fp.status='verified')",
    args: [actorId],
  };
  if (!pilot) {
    const viewer = await reader(db, actorId);
    if (!viewer || viewer.role !== "freelancer" || viewer.freelancerStatus !== "verified") return null;
  }
  const row = await db.$client.prepare(`SELECT e.id,e.title,e.started_on AS startedOn,e.ended_at AS endedAt,cp.display_name AS clientName
    FROM engagement e JOIN client_profile cp ON cp.id=e.client_id WHERE e.id=? AND e.freelancer_id=? AND e.status='accepted' AND ${gate.text}`)
    .bind(engagementId, actorId, ...gate.args).first<Omit<IntakeEngagement, "log">>();
  if (!row) return null;
  const log = await db.$client.prepare("SELECT id FROM engagement_log WHERE engagement_id=?").bind(engagementId).first<{ id: string }>();
  return { ...row, log: log ? await loadPrivateLog(db, actorId, log.id) : null };
}

export async function loadOwnPrivateLogLinks(db: Db, actorId: string | null): Promise<{ engagementId: string; id: string }[]> {
  const viewer = await reader(db, actorId);
  if (!viewer) return [];
  const result = await db.$client.prepare(`SELECT l.id,l.engagement_id AS engagementId FROM engagement_log l
    JOIN client_profile cp ON cp.id=l.client_id WHERE l.freelancer_id=? OR cp.user_id=? ORDER BY l.created_at DESC,l.id LIMIT 100`)
    .bind(viewer.id, viewer.id).all<{ engagementId: string; id: string }>();
  return result.results;
}
