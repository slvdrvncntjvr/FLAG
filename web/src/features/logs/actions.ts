"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedFreelancer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { loadPrivateLog } from "@/server/db/queries/logs";
import { saveLogDraft } from "./draft";
import { submitLog } from "./submit";
import { removeDraftProof } from "./proofs";
import { failure, idInput, type LogResult } from "./schema";
import { isPrivateIntakeEnabled } from "./rollout";

type Saved = LogResult<{ logId: string; ref: string }>;
type Target = { engagementId: string; logId?: string };

export async function saveDraftAction(target: Target, _previous: Saved | null, data: FormData): Promise<Saved> {
  const viewer = await requireVerifiedFreelancer().catch(() => null);
  if (!viewer) return failure("forbidden");
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  if (!validFields(data, ["engagementId", "logId", "anchorKind", "anchorDate", "rating", "facts", "periodStart", "periodEnd", "amountCentavos", "tags"], "tags") || !matchesTarget(target, data)) return failure("invalid_input");
  let result: Saved;
  try {
    result = await saveLogDraft(await getDb(), viewer.id, {
      engagementId: target.engagementId, ...(target.logId ? { logId: target.logId } : {}),
      anchorKind: data.get("anchorKind"), anchorDate: data.get("anchorDate"),
      rating: integer(data.get("rating")), facts: data.get("facts"),
      periodStart: data.get("periodStart"), periodEnd: data.get("periodEnd"),
      amountCentavos: data.get("amountCentavos") === "" ? null : integer(data.get("amountCentavos")),
      tags: data.getAll("tags"),
    });
  } catch { return failure("unavailable"); }
  if (result.ok) {
    revalidatePath("/engagements");
    revalidatePath(`/logs/${result.data.logId}`);
    if (!target.logId) redirect(`/logs/${result.data.logId}`);
  }
  return result;
}

export async function submitLogAction(logId: string, _previous: Saved | null, data: FormData): Promise<Saved> {
  const viewer = await requireVerifiedFreelancer().catch(() => null);
  if (!viewer) return failure("forbidden");
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  if (!validFields(data, ["logId"]) || !idInput.safeParse(logId).success || data.get("logId") !== logId) return failure("invalid_input");
  try {
    const { env } = await getCloudflareContext({ async: true });
    const result = await submitLog(await getDb(), env.PROOFS, viewer.id, logId);
    if (result.ok) { revalidatePath(`/logs/${logId}`); revalidatePath("/engagements"); }
    return result;
  } catch { return failure("unavailable"); }
}

export async function removeProofAction(logId: string, proofId: string, _previous: LogResult | null, data: FormData): Promise<LogResult> {
  const viewer = await requireVerifiedFreelancer().catch(() => null);
  if (!viewer) return failure("forbidden");
  if (!await isPrivateIntakeEnabled()) return failure("unavailable");
  if (!validFields(data, ["logId", "proofId"]) || data.get("logId") !== logId || data.get("proofId") !== proofId || !idInput.safeParse(logId).success || !idInput.safeParse(proofId).success) return failure("invalid_input");
  try {
    const db = await getDb();
    const log = await loadPrivateLog(db, viewer.id, logId);
    if (!log?.canEdit || !log.proofs.some(proof => proof.id === proofId)) return failure("not_found");
    const { env } = await getCloudflareContext({ async: true });
    const result = await removeDraftProof(db, env.PROOFS, viewer.id, proofId);
    if (result.ok) revalidatePath(`/logs/${logId}`);
    return result;
  } catch { return failure("unavailable"); }
}

function matchesTarget(target: Target, data: FormData) {
  return idInput.safeParse(target.engagementId).success && (!target.logId || idInput.safeParse(target.logId).success)
    && data.get("engagementId") === target.engagementId && (target.logId ? data.get("logId") === target.logId : !data.has("logId"));
}
function integer(value: FormDataEntryValue | null) {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
}
function validFields(data: FormData, fields: string[], repeated?: string) {
  const seen = new Set<string>();
  for (const [key, value] of data) {
    if (key.startsWith("$ACTION_")) continue;
    if (!fields.includes(key) || (seen.has(key) && key !== repeated) || typeof value !== "string" || value.length > (key === "facts" ? 2000 : 100)) return false;
    seen.add(key);
  }
  return data.getAll("tags").length <= 8;
}
