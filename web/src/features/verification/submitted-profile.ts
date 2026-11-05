import { verificationInput, type VerificationInput } from "./schema";

// Missing/invalid legacy evidence is unavailable, never a reconstructed original.
// JSON escaping expands a UTF-16 code unit to at most six characters. All
// allowed strings total <= 21,800 code units (320 + 10 * 2148), plus small
// fixed object/array syntax. This bound admits every valid serialized input.
export function parseSubmittedProfile(value: string | null): VerificationInput | null {
  if (!value || value.length > 150_000) return null;
  try {
    const parsed = verificationInput.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
