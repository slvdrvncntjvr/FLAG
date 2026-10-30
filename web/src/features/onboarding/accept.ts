import type { Db } from "@/server/db";
import { commitOnboarding, loadViewer } from "@/server/db/queries/viewer";
import { requiredPolicies } from "@/lib/policies";
import { onboardingInput, type ActionResult } from "./schema";

const ACK_FIELDS = ["ack_proof", "ack_not_legal", "ack_false_logs"] as const;

// PRD-F8. Pure of Next so the Workers test pool can call it with a local D1.
export async function acceptOnboarding(db: Db, userId: string, form: Record<string, unknown>): Promise<ActionResult> {
  const viewer = await loadViewer(db, userId);
  if (!viewer || viewer.banned) return { ok: false, message: "Sign in again to continue" };

  const parsed = onboardingInput.safeParse(form);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Some items are not accepted yet", fieldErrors };
  }

  const role = viewer.role ?? parsed.data.role;
  if (!role) return { ok: false, message: "Choose freelancer or client", fieldErrors: { role: "Choose one" } };

  if (role === "freelancer") {
    const fieldErrors: Record<string, string> = {};
    for (const f of ACK_FIELDS) if (parsed.data[f] !== "on") fieldErrors[f] = "Confirm this statement";
    if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Confirm all three statements", fieldErrors };
  }

  try {
    await commitOnboarding(db, userId, role, requiredPolicies(role));
  } catch {
    return { ok: false, message: "Could not save your choices. Try again." };
  }
  const refreshed = await loadViewer(db, userId);
  if (!refreshed || refreshed.banned) return { ok: false, message: "Sign in again to continue" };
  if (refreshed.role !== role || refreshed.missingPolicies.length > 0) {
    return { ok: false, message: "Your account changed. Reload this page and try again." };
  }
  return { ok: true };
}
