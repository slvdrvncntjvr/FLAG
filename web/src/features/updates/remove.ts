import type { Db } from "@/server/db";
import { assertChanged, intakeNow } from "@/server/db/queries/logs";
import { correctionGate, proposalGate } from "@/server/db/queries/proposals";
import { removeTrackedProof, purgeClaimedProof, trackedProof } from "@/features/logs/proof-storage";
import { failure, idInput, type LogResult } from "@/features/logs/schema";

export async function removeProposalEvidence(db: Db, bucket: R2Bucket, actor: string | null, logId: string, proofId: string): Promise<LogResult> {
  if (!actor || !idInput.safeParse(logId).success || !idInput.safeParse(proofId).success) return failure("not_found");
  try {
    const p = await trackedProof(db, proofId);
    if (!p || p.log_id !== logId || p.uploaded_by !== actor) return failure("not_found");
    const correction = p.owner_kind === "client";
    if (correction && p.status === "attached") return failure("conflict");
    const draft = !correction ? await db.$client.prepare("SELECT r.id,r.kind FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.log_id=? AND r.submitted_by=? AND r.state='draft' AND r.decision IS NULL AND ((l.status='ask_changes' AND r.kind='initial') OR (l.status='published' AND r.kind='filer_update')) ORDER BY r.rev_no DESC LIMIT 1")
      .bind(logId, actor).first<{ id: string; kind: "initial" | "filer_update" }>() : null;
    if (!correction && !draft) return failure("not_found");
    const gate = correction ? correctionGate(actor) : proposalGate(actor, draft!.kind);
    const scope = correction
      ? `EXISTS(SELECT 1 FROM correction_request cr JOIN engagement_log l ON l.id=cr.log_id WHERE cr.id=proof_file.correction_request_id AND cr.requested_by=? AND cr.status IN ('draft','ask_changes') AND ${gate.text})`
      : `EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=proof_file.log_id AND ${gate.text})`;
    const args = correction ? [actor, ...gate.args] : gate.args;
    const activity = correction
      ? db.$client.prepare(`UPDATE correction_request SET active_proof_ids=(SELECT json_group_array(value) FROM json_each(active_proof_ids) WHERE value!=?),updated_at=${intakeNow} WHERE id=? AND requested_by=? AND status IN ('draft','ask_changes') AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=correction_request.log_id AND ${gate.text})`).bind(proofId, p.correction_request_id, actor, ...gate.args)
      : db.$client.prepare(`UPDATE log_revision SET draft_updated_at=${intakeNow} WHERE id=? AND state='draft' AND decision IS NULL AND submitted_by=? AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=log_revision.log_id AND ${gate.text})`).bind(draft!.id, actor, ...gate.args);
    await db.$client.batch([db.$client.prepare(`UPDATE proof_file SET status=status WHERE id=? AND uploaded_by=? AND ${scope}`).bind(proofId, actor, ...args), assertChanged(db), activity, assertChanged(db)]);
    if (p.status === "attached") {
      // A revised proposal may deselect reused evidence; its original binding/bytes stay frozen.
      if (correction || !draft) return failure("conflict");
      await db.$client.batch([db.$client.prepare(`DELETE FROM revision_proof WHERE revision_id=? AND proof_id=? AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=? AND ${gate.text})`)
        .bind(draft.id, proofId, logId, ...gate.args), assertChanged(db)]);
      return { ok: true, data: {} };
    }
    if (p.revision_id && p.revision_id !== draft?.id) return failure("conflict");
    const removed = p.status === "pending_purge" ? await purgeClaimedProof(db, bucket, proofId) : await removeTrackedProof(db, bucket, proofId, actor);
    return removed ? { ok: true, data: {} } : failure("unavailable");
  } catch { return failure("conflict"); }
}
