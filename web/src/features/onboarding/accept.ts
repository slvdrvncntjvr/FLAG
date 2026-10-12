import type { Db } from "@/server/db";
import { chooseRole, loadViewer, recordAcceptances } from "@/server/db/queries/viewer";
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

  let role = viewer.role;
  if (role === null) {
    if (!parsed.data.role) return { ok: false, message: "Choose freelancer or client", fieldErrors: { role: "Choose one" } };
    if (!(await chooseRole(db, userId, parsed.data.role))) return { ok: false, message: "Your account type is already set" };
    role = parsed.data.role;
  }

  if (role === "freelancer") {
    const fieldErrors: Record<string, string> = {};
    for (const f of ACK_FIELDS) if (parsed.data[f] !== "on") fieldErrors[f] = "Confirm this statement";
    if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Confirm all three statements", fieldErrors };
  }

  const refreshed = await loadViewer(db, userId);
  await recordAcceptances(db, userId, refreshed?.missingPolicies ?? []);
  return { ok: true };
}
