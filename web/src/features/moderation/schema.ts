import { z } from "zod";
import { ID_KINDS, VERIFICATION_RESULTS } from "@/server/db/schema";
import { hasNoVerificationReason } from "@/features/verification/privacy";
const caseId = z.string().min(1).max(200);
const expectedClaimUntil = z.iso.datetime({ precision: 3 });
export const claimInput = z.strictObject({ caseId });
export const leaseInput = z.strictObject({ caseId, expectedClaimUntil });
export const inspectionInput = leaseInput.extend({ idKind: z.enum(ID_KINDS), result: z.enum(VERIFICATION_RESULTS), nameMatch: z.boolean() });
export const decisionInput = leaseInput.extend({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(1).max(1000).refine(hasNoVerificationReason),
});
