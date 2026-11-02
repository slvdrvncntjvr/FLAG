import { z } from "zod";
import { MAINTENANCE_OPERATIONS, MAINTENANCE_BASES, PRIVACY_REQUEST_KINDS, HOLD_TARGET_TYPES } from "@/server/db/schema";
import { hasNoVerificationReason } from "@/features/verification/privacy";

export const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const instant = z.iso.datetime({ precision: 3 });
const privateReason = z.string().trim().min(1).max(500).refine(hasNoVerificationReason, "Do not include ID details");
export const targetTypes = ["engagement_log", "log_revision", "proof_file", "moderation_case", "verification_case", "review_round", "proof_review", "correction_request", "privacy_request", "audit_event", "policy_acceptance", "engagement_consent", "retention_hold", "export_delivery", "maintenance_task", "backup_disposition", "user", "session", "account", "auth_verification", "freelancer_profile", "client_profile", "portfolio_link", "engagement"] as const;
export const target = z.object({ targetType: z.enum(targetTypes), targetId: id, operation: z.enum(MAINTENANCE_OPERATIONS), dueAt: instant }).strict();
export const assessedTarget = target.extend({ basis: z.enum(MAINTENANCE_BASES) });
export const assessment = z.object({
  targets: z.array(assessedTarget).max(100),
  identity: z.object({ method: z.enum(["authenticated_account", "non_id_control"]), evidenceReference: id, verifiedSubjectId: id, verifiedAt: instant }).strict(),
  categories: z.array(z.object({ category: z.enum(["identity", "authentication", "invitations", "publication", "proofs", "consent", "history", "backups"]), disposition: z.enum(["remove", "retain", "deny"]), basis: privateReason, until: instant }).strict()).min(1).max(20),
  backups: z.enum(["unverified", "inventoried"]),
  export: z.object({ authKind: z.enum(["session", "assessed_capability"]), handoverChannel: z.enum(["subject_session", "independently_verified_private_channel"]), handoverReference: id, secureHandover: z.boolean(), deadline: instant, categories: z.array(z.enum(["account", "profiles", "policies", "log_metadata"])).min(1).max(4) }).strict().optional(),
}).strict();
export const recordInput = z.object({ subjectUserId: id, responsibleId: id, kind: z.enum(PRIVACY_REQUEST_KINDS), receivedAt: instant, dueAt: instant, priorRequestId: id.optional() }).strict();
export const holdInput = z.object({ targetType: z.enum(HOLD_TARGET_TYPES), targetId: id, kind: z.enum(["review", "legal"]), reason: privateReason, reviewDueAt: instant, expiresAt: instant }).strict();
export const backupInput = z.object({ targetType: z.enum(targetTypes), targetId: id, backupRef: id, action: z.enum(["erase", "expire", "restore_filter"]), basis: privateReason, dueAt: instant }).strict();
export type Assessment = z.infer<typeof assessment>;
export type Target = z.infer<typeof target>;
export type PrivacyResult = { ok: true; id?: string; message?: string } | { ok: false; error: "forbidden" | "invalid_input" | "conflict" | "unavailable" };
export const failure = (error: Extract<PrivacyResult, { ok: false }>["error"]): PrivacyResult => ({ ok: false, error });
