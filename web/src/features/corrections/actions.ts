"use server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { failure, type LogResult } from "@/features/logs/schema";
import { openCorrection, submitCorrection, selectCorrectionProofs } from "./handlers";
export async function correctionAction(_previous: LogResult | null, data: FormData): Promise<LogResult> {
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  try {
    const viewer = await requireOnboardedViewer();
    if (viewer.role !== "client") return failure("forbidden");
    for (const [k, v] of data) if (!k.startsWith("$ACTION_") && (!["operation", "logId", "requestId", "note", "expectedProofIds", "proofIds"].includes(k) || (k !== "proofIds" && data.getAll(k).length !== 1) || typeof v !== "string" || v.length > (k === "note" ? 1000 : k === "expectedProofIds" ? 600 : 100))) return failure("invalid_input");
    const logId = String(data.get("logId")), db = await getDb();
    let result: LogResult;
    if (data.get("operation") === "open") result = await openCorrection(db, viewer.id, { logId, note: data.get("note") });
    else if (data.get("operation") === "select") result = await selectCorrectionProofs(db, viewer.id, { requestId: data.get("requestId"), expectedProofIds: JSON.parse(String(data.get("expectedProofIds"))), proofIds: data.getAll("proofIds") });
    else if (data.get("operation") === "submit") {
      const { env } = await getCloudflareContext({ async: true });
      // The request's own relationship gate is authoritative; route ID is only for revalidation.
      result = await submitCorrection(db, env.PROOFS, viewer.id, String(data.get("requestId")));
    } else return failure("invalid_input");
    if (result.ok) { revalidatePath(`/logs/${logId}/correction`); revalidatePath("/moderation/logs"); }
    return result;
  } catch { return failure("unavailable"); }
}
