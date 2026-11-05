"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb, type Db } from "@/server/db";
import { failure, type ReviewResult } from "@/features/verification/schema";
import { claimVerification, decideVerification, inspectVerification, releaseVerification } from "./handlers";

type Operation = "claim" | "release" | "inspect" | "decide";

async function run(operation: Operation, form: FormData): Promise<ReviewResult> {
  let result: ReviewResult;
  try {
    const viewer = await requireOnboardedViewer().catch(() => null);
    if (!viewer) return failure("unauthenticated");
    // Admin is deliberately not a reviewer role. The backend rechecks this atomically.
    if (viewer.role !== "moderator") return failure("forbidden");
    const fields = ["caseId", ...(operation !== "claim" ? ["expectedClaimUntil"] : []),
      ...(operation === "inspect" ? ["idKind", "result", "nameMatch", "liveInspection"] : []),
      ...(operation === "decide" ? ["decision", "reason"] : [])];
    const allowed = new Set(fields);
    for (const [key, value] of form) {
      if (key.startsWith("$ACTION_")) continue;
      if (!allowed.has(key) || typeof value !== "string") return failure("invalid_input");
    }
    if (fields.some(key => form.getAll(key).length !== 1)) return failure("invalid_input");
    const input: Record<string, unknown> = { caseId: form.get("caseId") };
    if (operation !== "claim") input.expectedClaimUntil = form.get("expectedClaimUntil");
    if (operation === "inspect") {
      if (form.get("liveInspection") !== "on" || !["yes", "no"].includes(String(form.get("nameMatch")))) return failure("invalid_input");
      Object.assign(input, { idKind: form.get("idKind"), result: form.get("result"), nameMatch: form.get("nameMatch") === "yes" });
    }
    if (operation === "decide") Object.assign(input, { decision: form.get("decision"), reason: form.get("reason") });
    const handlers: Record<Operation, (db: Db, actorId: string | null, input: unknown) => Promise<ReviewResult>> = {
      claim: claimVerification, release: releaseVerification, inspect: inspectVerification, decide: decideVerification,
    };
    result = await handlers[operation](await getDb(), viewer.id, input);
  } catch { return failure("unavailable"); }
  if (result.ok) {
    revalidatePath("/moderation/verification");
    // The server revalidates the submitted route only after schema/backend success.
    revalidatePath(`/moderation/verification/${encodeURIComponent(String(form.get("caseId")))}`);
    revalidatePath("/verification");
    revalidatePath("/home");
    return { ok: true };
  }
  return result;
}

export async function claimReview(_previous: ReviewResult | null, form: FormData): Promise<ReviewResult> { return run("claim", form); }
export async function releaseReview(_previous: ReviewResult | null, form: FormData): Promise<ReviewResult> { return run("release", form); }
export async function recordInspection(_previous: ReviewResult | null, form: FormData): Promise<ReviewResult> { return run("inspect", form); }
export async function decideReview(_previous: ReviewResult | null, form: FormData): Promise<ReviewResult> { return run("decide", form); }
