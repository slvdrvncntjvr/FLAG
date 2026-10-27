import { z } from "zod";
import { hasNoVerificationPayload, hasNoVerificationUrlPayload } from "@/features/verification/privacy";

export const INVITE_TTL_DAYS = 14;
export const INVITE_DAY_LIMIT = 10;
export const INVITE_WEEK_LIMIT = 30;
export const PENDING_INVITE_COOKIE = "flag-pending-invite";
export const INVITE_RETURN_PATH = "/invite/continue";
export const INVITE_CONTINUATION_SECONDS = 15 * 60;
export const tokenInput = z.string().regex(/^[a-f0-9]{64}$/);
export const idInput = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const safeText = (max: number) => z.string().trim().min(1).max(max)
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v)).refine(hasNoVerificationPayload);
const optionalText = (max: number) => z.preprocess(v => v === "" ? undefined : v, safeText(max).optional());
// The shared component-aware recognizer permits ordinary numeric business
// identifiers while rejecting recognizable full ID/encoded image payloads.
// This URL is only parser input: never fetched, stored or shown.
const registration = z.string().trim().min(1).max(100)
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v))
  .refine(v => hasNoVerificationUrlPayload(`https://validation.invalid/${encodeURIComponent(v)}`));
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
});
export const createInput = z.strictObject({ title: safeText(160), clientNameHint: safeText(160), startedOn: dateInput });
export const acceptInput = z.strictObject({
  consent: z.literal("on"), associate: z.literal("on"),
  displayName: optionalText(160), kind: z.enum(["individual", "business"]).optional(),
  city: optionalText(160), registrationNo: z.preprocess(v => v === "" ? undefined : v, registration.optional()),
});
export type AcceptInput = z.infer<typeof acceptInput>;
export type EngagementResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };
export function failed(message = "This invitation or your account changed. Reload and try again."): EngagementResult<never> {
  return { ok: false, message };
}

export async function hashInvite(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function newInviteToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

// Uses the existing client_consent policy meaning/version; no legal scope change.
export const CONSENT_TEXT = "I consent to this engagement being logged on FLAG with a 1 to 5 rating and supporting proof. A moderator reviews each log before other signed-in members can see it. FLAG is an awareness tool, not legal advice, dispute resolution or payment enforcement.";
