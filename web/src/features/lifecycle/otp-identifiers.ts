const otpTypes = ["sign-in", "email-verification", "forget-password", "change-email"] as const;

export function otpSubjectPredicate(identifier: string, email: string) {
  return `${identifier} IN (${otpTypes.map(type => `'${type}-otp-'||${email}`).join(",")})`;
}
