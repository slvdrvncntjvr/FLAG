import { z } from "zod";
import { idInput, logDraftInput, dateInput } from "@/features/logs/schema";
import { hasNoLogFactsPayload } from "@/features/verification/privacy";
import { leaseInput } from "./schema";

export const privateReason = z.string().trim().min(1).max(1000)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
  .refine(value => { try { encodeURIComponent(value); return hasNoLogFactsPayload(value); } catch { return false; } }, "Do not include government ID details.");
export const revisionFields = z.strictObject({
  rating: logDraftInput.shape.rating, tags: logDraftInput.shape.tags,
  facts: logDraftInput.shape.facts, periodStart: dateInput, periodEnd: dateInput,
  amountCentavos: logDraftInput.shape.amountCentavos,
}).refine(v => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "End must be on or after start." });
export const proofVerdictInput = z.strictObject({
  proofId: idInput, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.enum(["accept", "reject", "unclear"]), reason: privateReason,
  viewToken: z.string().min(1).max(3000),
});
export const logReviewInput = leaseInput.extend({
  revisionId: idInput, expectedCurrentRevisionId: idInput.nullable(),
  decision: z.enum(["approve", "ask_changes", "reject"]), reason: privateReason,
  proofVerdicts: z.array(proofVerdictInput).min(1).max(10)
    .refine(v => new Set(v.map(p => p.proofId)).size === v.length),
});
export const correctionReviewInput = leaseInput.extend({
  requestId: idInput, expectedCurrentRevisionId: idInput,
  decision: z.enum(["uphold", "ask_changes", "correct", "withdraw"]), reason: privateReason,
  proofVerdicts: z.array(proofVerdictInput).min(1).max(10)
    .refine(v => new Set(v.map(p => p.proofId)).size === v.length),
  fields: revisionFields.optional(),
}).refine(v => (v.decision === "correct") === !!v.fields, { message: "Supply corrected fields only for correction." });
export const proposalInput = z.strictObject({
  logId: idInput, expectedCurrentRevisionId: idInput.nullable(),
  revisionId: idInput.optional(), fields: revisionFields,
  effectiveOn: dateInput.optional(),
  proofIds: z.array(idInput).max(5).refine(v => new Set(v).size === v.length),
});
export const correctionDraftInput = z.strictObject({
  logId: idInput, note: privateReason, newEvidenceNote: privateReason.optional(),
});
