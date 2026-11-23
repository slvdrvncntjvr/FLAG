import { verificationInput, type VerificationInput } from "./schema";

export function parseSubmittedProfile(value: string | null): VerificationInput | null {
  if (!value || value.length > 150_000) return null;
  try {
    const parsed = verificationInput.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
