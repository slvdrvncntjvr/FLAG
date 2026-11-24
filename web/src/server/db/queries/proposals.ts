import { engagementActor } from "./engagements";
import { filerGate } from "./logs";
import { noActiveLogHold } from "@/features/logs/holds";
import type { Db } from "@/server/db";
import { loadPrivateLog } from "./logs";
import type { CandidateRevision } from "./reviews";

export function proposalGate(actorId: string, kind: "initial" | "filer_update") {
  const actor = filerGate(actorId);
  return { text: `l.freelancer_id=? AND ${actor.text} AND ${noActiveLogHold("l")}
    AND l.status='${kind === "initial" ? "ask_changes" : "published"}'
    AND (l.expires_at IS NULL OR l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=l.engagement_id AND e.status='accepted' AND e.freelancer_id=l.freelancer_id AND e.client_id=l.client_id)
    AND NOT EXISTS(SELECT 1 FROM proof_file blocked WHERE blocked.log_id=l.id AND blocked.status='pending_purge')`, args: [actorId, ...actor.args] };
}
export function correctionGate(actorId: string) {
  const actor = engagementActor("client", actorId);
  return { text: `${actor.text} AND ${noActiveLogHold("l")} AND l.current_revision_id IS NOT NULL
    AND l.status IN ('published','hidden','withdrawn') AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND EXISTS(SELECT 1 FROM client_profile cp WHERE cp.id=l.client_id AND cp.user_id=?)`, args: [...actor.args, actorId] };
}

export async function loadFilerProposal(db: Db, actorId: string | null, logId: string) {
  if (!actorId) return null;
  const gate = proposalGate(actorId, "filer_update");
  if (!await db.$client.prepare(`SELECT 1 FROM engagement_log l WHERE l.id=? AND ${gate.text}`).bind(logId, ...gate.args).first()) return null;
  const log = await loadPrivateLog(db, actorId, logId);
  if (!log) return null;
  const revision = await db.$client.prepare("SELECT * FROM log_revision WHERE log_id=? AND kind='filer_update' AND state='draft' AND decision IS NULL ORDER BY rev_no DESC LIMIT 1").bind(logId).first<CandidateRevision>();
  const pending = await db.$client.prepare("SELECT c.id,c.status FROM moderation_case c WHERE c.log_id=? AND c.kind='filer_update' AND c.status IN ('open','claimed','awaiting_changes')").bind(logId).first<{ id: string; status: string }>();
  const tags = revision ? (await db.$client.prepare("SELECT tag FROM log_tag WHERE revision_id=? ORDER BY tag").bind(revision.id).all<{ tag: string }>()).results.map(t => t.tag) : log.tags;
  const proofs = await db.$client.prepare(`SELECT p.id,p.kind,p.mime,p.size_bytes,
    CASE WHEN EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=?) THEN 1 ELSE 0 END AS selected
    FROM proof_file p WHERE p.log_id=? AND p.uploaded_by=? AND p.owner_kind='filer' AND p.status='attached' AND p.purge_inflight=0 ORDER BY p.uploaded_at,p.id`)
    .bind(revision?.id ?? log.revisionId, logId, actorId).all<{ id: string; kind: string; mime: string; size_bytes: number; selected: number }>();
  const uploading = await db.$client.prepare("SELECT id,kind,mime,size_bytes FROM proof_file WHERE log_id=? AND uploaded_by=? AND owner_kind='filer' AND revision_id=? AND status='uploading' ORDER BY uploaded_at,id")
    .bind(logId, actorId, revision?.id ?? "").all<{ id: string; kind: string; mime: string; size_bytes: number }>();
  const date = await db.$client.prepare("SELECT COALESCE((SELECT MAX(effective_on) FROM log_revision WHERE log_id=l.id AND kind='filer_update' AND decision='approve'),date(l.published_at,'+8 hours')) AS previous FROM engagement_log l WHERE l.id=?").bind(logId).first<{ previous: string }>();
  return { log, revision, tags, proofs: proofs.results, uploading: uploading.results, pending, previousEffectiveOn: date!.previous };
}
