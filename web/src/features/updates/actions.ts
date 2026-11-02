"use server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { requireVerifiedFreelancer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { failure, type LogResult } from "@/features/logs/schema";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { saveProposal, submitProposal } from "./handlers";
import { removeProposalEvidence } from "./remove";
import { requireOnboardedViewer } from "@/server/auth/guards";

export async function removeProposalProofAction(logId: string, proofId: string, _previous: LogResult | null, data: FormData): Promise<LogResult> {
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  try {
    const viewer = await requireOnboardedViewer();
    for (const [key, value] of data) if (!key.startsWith("$ACTION_") && (!["logId", "proofId"].includes(key) || typeof value !== "string" || data.getAll(key).length !== 1)) return failure("invalid_input");
    if (data.get("logId") !== logId || data.get("proofId") !== proofId) return failure("invalid_input");
    const { env } = await getCloudflareContext({ async: true });
    const result = await removeProposalEvidence(await getDb(), env.PROOFS, viewer.id, logId, proofId);
    if (result.ok) { revalidatePath(`/logs/${logId}`); revalidatePath(`/logs/${logId}/update`); revalidatePath(`/logs/${logId}/correction`); }
    return result;
  } catch { return failure("unavailable"); }
}
export async function proposalAction(_previous: LogResult | null, data: FormData): Promise<LogResult> {
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  try {
    const viewer = await requireVerifiedFreelancer();
    const allowed = ["operation", "logId", "revisionId", "kind", "expectedCurrentRevisionId", "rating", "tags", "facts", "periodStart", "periodEnd", "amountCentavos", "effectiveOn", "proofIds"];
    for (const [k, v] of data) if (!k.startsWith("$ACTION_") && (!allowed.includes(k) || typeof v !== "string" || (k !== "tags" && k !== "proofIds" && data.getAll(k).length !== 1) || v.length > (k === "facts" ? 2000 : 100))) return failure("invalid_input");
    const logId = String(data.get("logId")), db = await getDb();
    let result: LogResult;
    if (data.get("operation") === "submit") {
      const { env } = await getCloudflareContext({ async: true });
      result = await submitProposal(db, env.PROOFS, viewer.id, logId, String(data.get("revisionId")));
    } else if (data.get("operation") === "save") {
      if (!["initial", "filer_update"].includes(String(data.get("kind")))) return failure("invalid_input");
      const number = (key: string) => typeof data.get(key) === "string" && /^\d+$/.test(String(data.get(key))) ? Number(data.get(key)) : NaN;
      result = await saveProposal(db, viewer.id, {
        logId, expectedCurrentRevisionId: data.get("expectedCurrentRevisionId") || null,
        ...(data.get("revisionId") ? { revisionId: data.get("revisionId") } : {}),
        ...(data.get("effectiveOn") ? { effectiveOn: data.get("effectiveOn") } : {}),
        fields: { rating: number("rating"), tags: data.getAll("tags"), facts: data.get("facts"), periodStart: data.get("periodStart"), periodEnd: data.get("periodEnd"), amountCentavos: data.get("amountCentavos") === "" ? null : number("amountCentavos") },
        proofIds: data.getAll("proofIds"),
      }, data.get("kind") as "initial" | "filer_update");
    } else return failure("invalid_input");
    if (result.ok) { revalidatePath(`/logs/${logId}`); revalidatePath(`/logs/${logId}/update`); revalidatePath("/moderation/logs"); }
    return result;
  } catch { return failure("unavailable"); }
}
