"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { requireViewer } from "@/server/auth/guards";
import { acceptOnboarding } from "./accept";
import type { ActionResult } from "./schema";

export async function acceptPolicies(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) return { ok: false, message: "Sign in again to continue" };
  let result: ActionResult;
  try {
    result = await acceptOnboarding(await getDb(), viewer.id, Object.fromEntries(formData));
  } catch {
    return { ok: false, message: "Could not save your choices. Try again." };
  }
  if (result.ok) redirect("/home");
  return result;
}
