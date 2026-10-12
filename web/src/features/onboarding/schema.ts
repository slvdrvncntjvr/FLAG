import { z } from "zod";

export const onboardingInput = z
  .object({
    role: z.enum(["freelancer", "client"]).optional(),
    privacy: z.literal("on", { error: "Accept the privacy notice to continue" }),
    terms: z.literal("on", { error: "Accept the terms to continue" }),
    ack_proof: z.literal("on").optional(),
    ack_not_legal: z.literal("on").optional(),
    ack_false_logs: z.literal("on").optional(),
  });

export type OnboardingInput = z.infer<typeof onboardingInput>;

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Partial<Record<keyof OnboardingInput, string>> };
