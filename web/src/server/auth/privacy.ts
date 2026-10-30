import { APIError } from "better-auth/api";
import { hasNoVerificationPayload } from "@/features/verification/privacy";

// Better Auth's OTP, update-user and provider flows all use the user database
// hooks. Throw rather than return false: update-user otherwise reports success
// and can populate a cookie with rejected values after a skipped write.
export async function validateAuthUserProfile(data: { name?: unknown; image?: unknown }) {
  const validName = data.name === undefined || (typeof data.name === "string" && hasNoVerificationPayload(data.name));
  let validImage = data.image === undefined || data.image === null || data.image === "";
  if (!validImage && typeof data.image === "string") {
    try {
      // No avatar feature is approved. Accept provider web links for sign-in
      // compatibility, then discard the whole value, including any payload in
      // its query/fragment. No decoding exception can preserve hidden content.
      const url = new URL(data.image);
      validImage = url.protocol === "https:" || url.protocol === "http:";
    } catch {
      validImage = false;
    }
  }
  if (!validName || !validImage) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_USER_PROFILE",
      message: "Check the supplied profile fields. Do not include ID details or files.",
    });
  }
  if (data.image !== undefined) return { data: { image: null } };
}
