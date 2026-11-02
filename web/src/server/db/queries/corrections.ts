import type { Db } from "@/server/db";
import { isOnboarded, loadViewer } from "./viewer";
export async function loadCorrections(db: Db, actorId: string | null, logId: string) {
  if (!actorId) return null;
  const viewer = await loadViewer(db, actorId);
  if (!viewer || viewer.banned || !isOnboarded(viewer)) return null;
  const log = await db.$client.prepare(`SELECT l.id,l.ref,l.status,l.expires_at,l.freelancer_id,cp.user_id AS client_user_id FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id
    WHERE l.id=? AND (l.freelancer_id=? OR cp.user_id=? OR ?='moderator')`).bind(logId, actorId, actorId, viewer.role)
    .first<{ id: string; ref: string; status: string; expires_at: string | null; freelancer_id: string; client_user_id: string }>();
  if (!log) return null;
  const requests = await db.$client.prepare("SELECT id,status,new_evidence_note,active_proof_ids,created_at,submitted_at,closed_at FROM correction_request WHERE log_id=? ORDER BY created_at DESC,id LIMIT 30")
    .bind(logId).all<{ id: string; status: string; new_evidence_note: string; active_proof_ids: string; created_at: string; submitted_at: string | null; closed_at: string | null }>();
  const rounds = await db.$client.prepare(`SELECT rr.case_id,rr.round_no,rr.decision,rr.reason,rr.decided_at,c.correction_request_id FROM review_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.log_id=? AND c.kind='correction' ORDER BY rr.decided_at,rr.round_no`)
    .bind(logId).all<{ case_id: string; round_no: number; decision: string; reason: string; decided_at: string; correction_request_id: string }>();
  const proofs = await db.$client.prepare("SELECT id,correction_request_id,kind,mime,size_bytes,status FROM proof_file WHERE log_id=? AND owner_kind='client' AND status IN ('uploading','attached') ORDER BY uploaded_at,id")
    .bind(logId).all<{ id: string; correction_request_id: string; kind: string; mime: string; size_bytes: number; status: string }>();
  return { log, requests: requests.results, rounds: rounds.results, proofs: proofs.results, canRequest: viewer.role === "client" && actorId === log.client_user_id && !!log.expires_at && log.expires_at > new Date().toISOString() };
}
