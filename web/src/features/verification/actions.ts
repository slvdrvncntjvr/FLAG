"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { failure, type ReviewResult } from "./schema";
import { submitVerification } from "./submit";

export async function requestVerification(_previous: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  let result: ReviewResult;
  try {
    const viewer = await requireOnboardedViewer().catch(() => null);
    if (!viewer) return failure("unauthenticated");
    if (viewer.role !== "freelancer") return failure("forbidden");
    const allowed = new Set(["name", "city", "portfolioUrl", "portfolioLabel"]);
    for (const [key, value] of form) {
      if (key.startsWith("$ACTION_")) continue;
      if (!allowed.has(key) || typeof value !== "string") return failure("invalid_input");
    }
    if (form.getAll("name").length !== 1 || form.getAll("city").length > 1) return failure("invalid_input");
    const urls = form.getAll("portfolioUrl"), labels = form.getAll("portfolioLabel");
    if (urls.length !== labels.length || urls.length < 1 || urls.length > 10) return failure("invalid_input");
    result = await submitVerification(await getDb(), viewer.id, {
      name: form.get("name"), city: form.get("city") || undefined,
      portfolioLinks: urls.map((url, index) => ({ url, label: labels[index] || undefined })),
    });
  } catch { return failure("unavailable"); }
  if (result.ok) {
    revalidatePath("/verification");
    revalidatePath("/home");
    revalidatePath("/moderation/verification");
    return { ok: true };
  }
  return result;
}
