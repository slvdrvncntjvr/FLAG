"use server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { currentAdmin } from "@/server/db/queries/privacy";
import { assignPrivacyRequest, assessPrivacyRequest, executePrivacyRequest, placeRetentionHold, recordBackupDisposition, recordPrivacyOutcome, recordPrivacyRequest, releaseRetentionHold, verifyBackupDisposition } from "./handlers";
import { prepareExport } from "./exports";
import { failure, type PrivacyResult } from "./schema";
import { runMaintenance } from "@/features/lifecycle/maintenance";

export type ActionResult = PrivacyResult | { ok: true; deliveryId: string; token: string; expiresAt: string };
export async function privacyAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await requireOnboardedViewer().catch(() => null);
  if (!viewer || viewer.role !== "admin") return failure("forbidden");
  const db = await getDb(); if (!await currentAdmin(db, viewer.id)) return failure("forbidden");
  const value = (key: string) => String(form.get(key) ?? "");
  // The staff fields are explicitly UTC, independent of the host's timezone.
  const utc = (key: string) => {
    const input = value(key);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(input)) throw new Error("invalid_utc_field");
    return new Date(`${input}Z`).toISOString();
  };
  const requestId = value("requestId"), op = value("operation");
  let result: ActionResult;
  try {
    const { env } = await getCloudflareContext({ async: true });
    switch (op) {
      case "record": result = await recordPrivacyRequest(db, viewer.id, { subjectUserId: value("subjectUserId"), responsibleId: value("responsibleId"), kind: value("kind"), receivedAt: utc("receivedAt"), dueAt: utc("dueAt"), ...(value("priorRequestId") ? { priorRequestId: value("priorRequestId") } : {}) }); break;
      case "assign": result = await assignPrivacyRequest(db, viewer.id, requestId, value("responsibleId")); break;
      case "assess": {
        const identity = { method: value("identityMethod"), evidenceReference: value("identityReference"), verifiedSubjectId: value("subjectId"), verifiedAt: utc("verifiedAt") };
        const chosen = form.getAll("target").map(String).map(v => JSON.parse(v) as { targetType: string; targetId: string });
        const dueAt = utc("targetDueAt");
        const targets = chosen.map(t => ({ ...t, operation: value(`op:${t.targetType}:${t.targetId}`), basis: value("basis"), dueAt }));
        const categories = ["identity", "authentication", "invitations", "publication", "proofs", "consent", "history", "backups"].map(category => ({ category, disposition: value(`disposition:${category}`), basis: value(`basis:${category}`), until: utc(`until:${category}`) }));
        result = await assessPrivacyRequest(db, viewer.id, requestId, { identity, targets, categories, backups: value("backups"), ...(value("exportKind") ? { export: { authKind: value("exportKind"), handoverChannel: value("handoverChannel"), handoverReference: value("handoverReference"), secureHandover: value("secureHandover") === "on", deadline: utc("exportDeadline"), categories: form.getAll("exportCategory").map(String) } } : {}) });
        break;
      }
      case "execute": result = await executePrivacyRequest(db, env, viewer.id, requestId); break;
      case "export": result = { ok: true, ...await prepareExport(db, env.PROOFS, viewer.id, requestId) }; break;
      case "outcome": {
        const status = value("status"); if (!["completed", "deferred", "denied"].includes(status)) return failure("invalid_input");
        result = await recordPrivacyOutcome(db, viewer.id, requestId, status as "completed" | "deferred" | "denied", value("reason"), value("followUpAt") ? utc("followUpAt") : undefined, value("deliveryConfirmed") === "on" ? value("deliveryReceiptReference") : undefined); break;
      }
      case "hold": result = await placeRetentionHold(db, viewer.id, { targetType: value("targetType"), targetId: value("targetId"), kind: value("kind"), reason: value("reason"), reviewDueAt: utc("reviewDueAt"), expiresAt: utc("expiresAt") }); break;
      case "releaseHold": result = await releaseRetentionHold(db, viewer.id, value("holdId")); break;
      case "retry": {
        // Explicit staff retry never takes over an unresolved claimed invocation.
        const r = await runMaintenance(env); result = { ok: true, message: `${r.completed} completed, ${r.blocked} blocked, ${r.remaining} outstanding.` }; break;
      }
      case "backup": {
        result = await recordBackupDisposition(db, viewer.id, requestId, { targetType: value("targetType"), targetId: value("targetId"), backupRef: value("backupRef"), action: value("action"), basis: value("reason"), dueAt: utc("dueAt") }); break;
      }
      case "verifyBackup": {
        if (value("confirmed") !== "on" || !value("evidenceReference")) return failure("invalid_input");
        result = await verifyBackupDisposition(db, viewer.id, value("backupId"), value("evidenceReference")); break;
      }
      default: return failure("invalid_input");
    }
  } catch { return failure("unavailable"); }
  revalidatePath("/admin/privacy");
  if (requestId) revalidatePath(`/admin/privacy/${encodeURIComponent(requestId)}`);
  return result;
}
