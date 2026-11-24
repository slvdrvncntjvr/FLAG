import { APIError } from "better-auth/api";
import { hasNoVerificationPayload } from "@/features/verification/privacy";

export async function validateAuthUserProfile(data: { name?: unknown; image?: unknown }) {
  const validName = data.name === undefined || (typeof data.name === "string" && hasNoVerificationPayload(data.name));
  let validImage = data.image === undefined || data.image === null || data.image === "";
  if (!validImage && typeof data.image === "string") {
    try {
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
