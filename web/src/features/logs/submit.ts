import type { Db } from "@/server/db";
import { assertChanged, editableDraftGate, intakeNow } from "@/server/db/queries/logs";
import { failure, idInput, withinFilingWindow, type LogResult } from "./schema";
import { objectMatches, type ProofRecord } from "./proof-storage";

export async function submitLog(db: Db, proofs: R2Bucket, actorId: string | null, logId: string): Promise<LogResult<{ logId: string; ref: string }>> {
  if (!actorId) return failure("unauthenticated");
  if (!idInput.safeParse(logId).success) return failure("invalid_input");
  const gate = editableDraftGate(actorId);
  const log = await db.$client.prepare(`SELECT id,ref,anchor_date FROM engagement_log WHERE id=? AND ${gate.text}`)
    .bind(logId, ...gate.args).first<{ id: string; ref: string; anchor_date: string }>();
  if (!log) return failure("conflict");
  if (!withinFilingWindow(log.anchor_date)) return failure("invalid_input", { anchorDate: ["The initial filing deadline has passed."] });
  const revision = await db.$client.prepare("SELECT id FROM log_revision WHERE log_id=? AND rev_no=1 AND kind='initial' AND decision IS NULL").bind(logId).first<{ id: string }>();
  if (!revision) return failure("conflict");
  const list = await db.$client.prepare("SELECT * FROM proof_file WHERE log_id=? AND status IN ('uploading','attached') ORDER BY id").bind(logId).all<ProofRecord>();
  if (list.results.length < 1) return { ...failure("invalid_input"), error: "Attach at least one proof file" };
  if (list.results.length > 5 || list.results.some(p => p.status !== "uploading" || p.uploaded_by !== actorId || p.revision_id !== null)) return failure("conflict");
  try {
    // No object data leaves this function. A reserved-but-inflight or missing upload cannot submit.
    for (const proof of list.results) if (!objectMatches(await proofs.head(proof.object_key), proof)) return failure("conflict");
    const statements: D1PreparedStatement[] = [
      db.$client.prepare(`UPDATE engagement_log SET draft_updated_at=draft_updated_at WHERE id=? AND ${gate.text}`).bind(logId, ...gate.args),
      assertChanged(db),
    ];
    for (const proof of list.results) {
      statements.push(db.$client.prepare(`UPDATE proof_file SET status='attached',revision_id=? WHERE id=? AND log_id=?
        AND status='uploading' AND revision_id IS NULL AND uploaded_by=? AND object_key=? AND sha256=? AND size_bytes=? AND mime=?`)
        .bind(revision.id, proof.id, logId, actorId, proof.object_key, proof.sha256, proof.size_bytes, proof.mime));
      statements.push(assertChanged(db));
    }
    statements.push(
      db.$client.prepare(`UPDATE log_revision SET submitted_at=${intakeNow} WHERE id=? AND log_id=? AND decision IS NULL`).bind(revision.id, logId),
      assertChanged(db),
      db.$client.prepare("INSERT INTO moderation_case(id,kind,subject_id,status) VALUES(?,'log',?,'open')").bind(crypto.randomUUID(), logId),
      db.$client.prepare("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES(?,?,'log_submitted','engagement_log',?)").bind(crypto.randomUUID(), actorId, logId),
      // Final SQL trigger checks content/proof set, consented engagement, Manila clock and quotas.
      // Repeating the live gate and forcing a nonzero result protects every earlier side effect.
      db.$client.prepare(`UPDATE engagement_log SET status='pending',first_submitted_at=${intakeNow},submitted_at=${intakeNow}
        WHERE id=? AND ${gate.text}`).bind(logId, ...gate.args),
      assertChanged(db),
    );
    await db.$client.batch(statements);
    return { ok: true, data: { logId, ref: log.ref } };
  } catch { return failure("conflict"); }
}
