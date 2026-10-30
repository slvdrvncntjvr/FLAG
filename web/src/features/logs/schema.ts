import { z } from "zod";
import { ANCHOR_KINDS, LOG_TAGS, PROOF_KINDS } from "@/server/db/schema";
import { hasNoLogFactsPayload } from "@/features/verification/privacy";
export { ANCHOR_KINDS, LOG_TAGS, PROOF_KINDS } from "@/server/db/schema";

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const MAX_PROOFS = 5;
export const idInput = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");

// Complete validated drafts: uploads only begin after this content is persisted.
// No client-selected status, outcome, parties, object key or reference is accepted.
export const logDraftInput = z.strictObject({
  engagementId: idInput,
  logId: idInput.optional(),
  anchorKind: z.enum(ANCHOR_KINDS),
  anchorDate: dateInput,
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(LOG_TAGS)).min(1).max(8).refine(tags => new Set(tags).size === tags.length, "Choose each tag once."),
  facts: z.string().trim().min(40).max(2000)
    .refine(value => Array.from(value).length >= 40, "Write at least 40 characters.")
    .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    .refine(value => {
      try { encodeURIComponent(value); return hasNoLogFactsPayload(value); }
      catch { return false; }
    }, "Do not include government ID details."),
  periodStart: dateInput,
  periodEnd: dateInput,
  amountCentavos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.periodEnd < value.periodStart) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "End must be on or after start." });
});
export const proofKindInput = z.enum(PROOF_KINDS);
export type LogDraftInput = z.infer<typeof logDraftInput>;
export type LogFailureCode = "invalid_input" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "quota" | "unavailable" | "too_large";
export type LogFailure = { ok: false; code: LogFailureCode; error: string; fieldErrors?: Record<string, string[]> };
export type LogResult<T extends object = object> = { ok: true; data: T } | LogFailure;
const messages: Record<LogFailureCode, string> = {
  invalid_input: "Check the supplied fields.", unauthenticated: "Sign in to continue.",
  forbidden: "Your account cannot file a log.", not_found: "This log or proof is unavailable.",
  conflict: "The log or your account changed. Reload and try again.", quota: "The filing or proof limit has been reached.",
  unavailable: "Could not save this change. Try again.", too_large: "Each proof must be at most 10 MiB.",
};
export function failure(code: LogFailureCode, fieldErrors?: Record<string, string[]>): LogFailure {
  return { ok: false, code, error: messages[code], ...(fieldErrors ? { fieldErrors } : {}) };
}
export function outcomeForRating(rating: number): "negative" | "mixed" | "positive" {
  return rating <= 2 ? "negative" : rating === 3 ? "mixed" : "positive";
}
export function manilaDate(now = new Date()): string {
  // UTC+08:00 has no daylight-saving transition; calendar arithmetic stays in UTC.
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function withinFilingWindow(anchor: string, now = new Date()): boolean {
  if (!dateInput.safeParse(anchor).success) return false;
  const today = manilaDate(now);
  const deadline = new Date(`${anchor}T00:00:00.000Z`);
  deadline.setUTCDate(deadline.getUTCDate() + 15);
  return anchor <= today && today <= deadline.toISOString().slice(0, 10);
}
