import type { Db } from "@/server/db";
import { assertChanged, editableDraftGate, filerGate, intakeNow } from "@/server/db/queries/logs";
import { failure, logDraftInput, outcomeForRating, withinFilingWindow, type LogResult } from "./schema";

export async function saveLogDraft(db: Db, actorId: string | null, input: unknown): Promise<LogResult<{ logId: string; ref: string }>> {
  if (!actorId) return failure("unauthenticated");
  const parsed = logDraftInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fields[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
    return failure("invalid_input", fields);
  }
  const f = parsed.data;
  if (!withinFilingWindow(f.anchorDate)) return failure("invalid_input", { anchorDate: ["File within 15 calendar days of the first eligible event; future dates are not allowed."] });
  const logId = f.logId ?? crypto.randomUUID(), revisionId = crypto.randomUUID();
  const gate = filerGate(actorId), edit = editableDraftGate(actorId);
  const args = [f.rating, outcomeForRating(f.rating), f.facts, f.periodStart, f.periodEnd, f.amountCentavos ?? null];
  try {
    const statements: D1PreparedStatement[] = [];
    if (!f.logId) {
      // Persistent high-water mark, never a standalone allocation. Rejected drafts roll this back.
      statements.push(db.$client.prepare(`INSERT INTO auth_rate_limit(key,count,expires_at)
        SELECT 'log-reference-sequence',MAX(1042,COALESCE(MAX(CAST(substr(ref,4) AS INTEGER))+1,1042)),9007199254740991
        FROM engagement_log WHERE ref GLOB 'FL-[0-9]*' AND substr(ref,4) NOT GLOB '*[^0-9]*'
        ON CONFLICT(key) DO UPDATE SET count=MAX(auth_rate_limit.count+1,excluded.count),expires_at=excluded.expires_at`));
      statements.push(db.$client.prepare(`INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date,draft_updated_at)
        SELECT ?,'FL-'||(SELECT count FROM auth_rate_limit WHERE key='log-reference-sequence'),e.id,e.freelancer_id,e.client_id,?,?,${intakeNow}
        FROM engagement e WHERE e.id=? AND e.freelancer_id=? AND e.status='accepted' AND ${gate.text}
          AND e.started_on<=? AND e.started_on<=? AND ?<=date('now','+8 hours')
          AND NOT EXISTS(SELECT 1 FROM engagement_log WHERE engagement_id=e.id)`)
        .bind(logId, f.anchorKind, f.anchorDate, f.engagementId, actorId, ...gate.args, f.anchorDate, f.periodStart, f.periodEnd));
      statements.push(assertChanged(db));
      statements.push(db.$client.prepare(`INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,amount_centavos,submitted_by)
        VALUES(?,?,1,'initial',?,?,?,?,?,?,?)`).bind(revisionId, logId, ...args, actorId));
    } else {
      statements.push(db.$client.prepare(`UPDATE engagement_log SET draft_updated_at=${intakeNow} WHERE id=? AND engagement_id=?
        AND anchor_kind=? AND anchor_date=? AND ${edit.text}
        AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=engagement_log.engagement_id AND e.started_on<=? AND ?<=date('now','+8 hours'))`)
        .bind(logId, f.engagementId, f.anchorKind, f.anchorDate, ...edit.args, f.periodStart, f.periodEnd));
      statements.push(assertChanged(db));
      statements.push(db.$client.prepare(`UPDATE log_revision SET rating=?,outcome=?,facts=?,period_start=?,period_end=?,amount_centavos=?
        WHERE log_id=? AND rev_no=1 AND kind='initial' AND decision IS NULL`).bind(...args, logId));
      statements.push(assertChanged(db));
      statements.push(db.$client.prepare("DELETE FROM log_tag WHERE revision_id=(SELECT id FROM log_revision WHERE log_id=? AND rev_no=1)").bind(logId));
    }
    for (const tag of f.tags) statements.push(db.$client.prepare(`INSERT INTO log_tag(revision_id,tag) SELECT id,? FROM log_revision WHERE log_id=? AND rev_no=1`).bind(tag, logId));
    statements.push(db.$client.prepare("SELECT id,ref FROM engagement_log WHERE id=? AND freelancer_id=?").bind(logId, actorId));
    const results = await db.$client.batch(statements);
    const saved = results.at(-1)!.results[0] as { id: string; ref: string } | undefined;
    return saved ? { ok: true, data: { logId: saved.id, ref: saved.ref } } : failure("conflict");
  } catch { return failure("conflict"); }
}
