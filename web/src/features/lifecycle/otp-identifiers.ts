// Better Auth 1.7.7 email-otp/utils.mjs and routes.mjs use these exact
// scalar identifiers. Password reset is disabled, but old codes must be erased;
// the server-only generic creation API also supports scalar change-email.
// The separate old-email/new-email change flow is disabled in our auth config.
const otpTypes = ["sign-in", "email-verification", "forget-password", "change-email"] as const;

// Arguments are trusted SQL column expressions, never request values. Do not
// match email prefixes: another account may contain the entire subject email.
export function otpSubjectPredicate(identifier: string, email: string) {
  return `${identifier} IN (${otpTypes.map(type => `'${type}-otp-'||${email}`).join(",")})`;
}
