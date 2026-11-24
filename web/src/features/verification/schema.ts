import { z } from "zod";
import { hasNoVerificationPayload, hasNoVerificationUrlPayload } from "./privacy";

const webUrl = z.string().trim().max(2048).refine(hasNoVerificationUrlPayload).refine((value) => {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
});
export const verificationInput = z.strictObject({
  name: z.string().trim().min(1).max(160).refine((v) => !v.includes("@") && !/[\r\n\u0000-\u001f]/.test(v)).refine(hasNoVerificationPayload),
  city: z.string().trim().min(1).max(160).refine(hasNoVerificationPayload).optional(),
  portfolioLinks: z.array(z.strictObject({ url: webUrl, label: z.string().trim().min(1).max(100).refine(hasNoVerificationPayload).optional() })).min(1).max(10),
});
export type VerificationInput = z.infer<typeof verificationInput>;
export type FailureCode = "invalid_input" | "unauthenticated" | "forbidden" | "conflict" | "unavailable";
export type ReviewFailure = { ok: false; code: FailureCode; message: string };
export type ReviewResult<T extends object = object> = ({ ok: true } & T) | ReviewFailure;
const messages: Record<FailureCode, string> = {
  invalid_input: "Check the supplied fields. Do not include ID details or files.",
  unauthenticated: "Sign in to continue.", forbidden: "Your account cannot perform this review.",
  conflict: "The request or your account changed. Reload and try again.", unavailable: "Could not save this change. Try again.",
};
export function failure(code: FailureCode): ReviewFailure { return { ok: false, code, message: messages[code] }; }
