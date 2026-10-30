import type { Db } from "@/server/db";
import { engagementActor } from "./engagements";
import { isOnboarded, loadViewer } from "./viewer";
import { idInput } from "@/features/logs/schema";
import { noActiveLogHold } from "@/features/logs/holds";

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
};
export type IntakeEngagement = { id: string; title: string; startedOn: string; endedAt: string | null; clientName: string; log: PrivateLog | null };

async function reader(db: Db, actorId: string | null) {
  if (!actorId) return null;
  const viewer = await loadViewer(db, actorId);
  return viewer && !viewer.banned && isOnboarded(viewer) ? viewer : null;
}
export async function loadPrivateLog(db: Db, actorId: string | null, logId: string): Promise<PrivateLog | null> {
  if (!idInput.safeParse(logId).success) return null;
  const viewer = await reader(db, actorId);
  if (!viewer) return null;
  const row = await db.$client.prepare(`SELECT l.id,l.ref,l.engagement_id AS engagementId,e.title,l.status,
    l.anchor_kind AS anchorKind,l.anchor_date AS anchorDate,l.first_submitted_at AS firstSubmittedAt,l.submitted_at AS submittedAt,
    r.rating,r.outcome,r.facts,r.period_start AS periodStart,r.period_end AS periodEnd,r.amount_centavos AS amountCentavos,
    l.freelancer_id AS filer,CASE WHEN ${noActiveLogHold("l")} THEN 0 ELSE 1 END AS hasActiveHold
    FROM engagement_log l JOIN engagement e ON e.id=l.engagement_id
    JOIN client_profile cp ON cp.id=l.client_id
    JOIN log_revision r ON r.log_id=l.id AND r.rev_no=1
    WHERE l.id=? AND l.status!='expired' AND (l.expires_at IS NULL OR l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND (l.freelancer_id=? OR cp.user_id=? OR ?='moderator')`)
    .bind(logId, viewer.id, viewer.id, viewer.role).first<Omit<PrivateLog, "tags" | "proofs" | "canEdit"> & { filer: string; hasActiveHold: number }>();
  if (!row) return null;
  const [tags, proofs] = await Promise.all([
    db.$client.prepare("SELECT t.tag FROM log_tag t JOIN log_revision r ON r.id=t.revision_id WHERE r.log_id=? AND r.rev_no=1 ORDER BY t.tag").bind(logId).all<{ tag: string }>(),
    db.$client.prepare(`SELECT id,kind,mime,size_bytes AS sizeBytes,status FROM proof_file WHERE log_id=? AND status IN ('uploading','attached') ORDER BY uploaded_at,id`).bind(logId).all<PrivateProof>(),
  ]);
  const { filer, hasActiveHold, ...safe } = row;
  return { ...safe, tags: tags.results.map(t => t.tag), proofs: proofs.results,
    canEdit: row.status === "draft" && !hasActiveHold && filer === viewer.id && viewer.role === "freelancer" && viewer.freelancerStatus === "verified" };
}
export async function loadLogForEngagement(db: Db, actorId: string | null, engagementId: string): Promise<IntakeEngagement | null> {
  if (!idInput.safeParse(engagementId).success || !actorId) return null;
  const gate = filerGate(actorId);
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
