"use server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { failure, type LogResult } from "@/features/logs/schema";
import { claimLogReview, releaseLogReview, decideLogReview, decideCorrection, hideCorrectionRisk } from "./log-handlers";

export async function logReviewAction(_previous: LogResult | null, form: FormData): Promise<LogResult> {
  try {
    const viewer = await requireOnboardedViewer();
    if (viewer.role !== "moderator") return failure("forbidden");
    const allowed = ["operation", "caseId", "expectedClaimUntil", "revisionId", "expectedCurrentRevisionId", "decision", "reason", "proofVerdicts", "requestId", "fields", "riskKind"];
    for (const [key, value] of form) if (!key.startsWith("$ACTION_") && (!allowed.includes(key) || form.getAll(key).length !== 1 || typeof value !== "string" || value.length > (key === "proofVerdicts" ? 45000 : key === "fields" ? 5000 : 1000))) return failure("invalid_input");
    const op = String(form.get("operation")), db = await getDb(), caseId = form.get("caseId"), expectedClaimUntil = form.get("expectedClaimUntil");
    let result: LogResult;
    if (op === "claim") result = await claimLogReview(db, viewer.id, { caseId });
    else if (op === "release") result = await releaseLogReview(db, viewer.id, { caseId, expectedClaimUntil });
    else if (op === "hide") result = await hideCorrectionRisk(db, viewer.id, { caseId, expectedClaimUntil, requestId: form.get("requestId"), expectedCurrentRevisionId: form.get("expectedCurrentRevisionId"), reason: form.get("reason"), riskKind: form.get("riskKind") });
    else {
      const { env } = await getCloudflareContext({ async: true });
      const shared = { caseId, expectedClaimUntil, expectedCurrentRevisionId: form.get("expectedCurrentRevisionId") || null, decision: form.get("decision"), reason: form.get("reason"), proofVerdicts: JSON.parse(String(form.get("proofVerdicts"))) };
      if (op === "log") result = await decideLogReview(db, env.PROOFS, viewer.id, { ...shared, revisionId: form.get("revisionId") }, env.BETTER_AUTH_SECRET);
      else if (op === "correction") result = await decideCorrection(db, env.PROOFS, viewer.id, { ...shared, requestId: form.get("requestId"), ...(form.get("fields") ? { fields: JSON.parse(String(form.get("fields"))) } : {}) }, env.BETTER_AUTH_SECRET);
      else return failure("invalid_input");
    }
    if (result.ok) {
      revalidatePath("/moderation/logs");
      revalidatePath("/moderation/corrections");
      revalidatePath(`/moderation/logs/${String(caseId)}`);
      revalidatePath(`/moderation/corrections/${String(caseId)}`);
      revalidatePath("/logs"); revalidatePath("/clients"); revalidatePath("/home");
    }
    return result;
  } catch { return failure("unavailable"); }
}
