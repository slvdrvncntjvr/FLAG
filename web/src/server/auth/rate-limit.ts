import { and, eq, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { authRateLimit } from "@/server/db/schema";

export const OTP_PATHS = new Set([
  "/email-otp/send-verification-otp", "/sign-in/email-otp", "/email-otp/check-verification-otp",
  "/email-otp/verify-email", "/email-otp/request-password-reset", "/email-otp/reset-password",
  "/forget-password/email-otp", "/email-otp/request-email-change", "/email-otp/change-email",
]);
export const OTP_SEND_PATHS = new Set([
  "/email-otp/send-verification-otp", "/email-otp/request-password-reset", "/forget-password/email-otp", "/email-otp/request-email-change",
]);
export const OTP_LIMIT = { window: 15 * 60, max: 5 };
// Code emails per trusted IP across all addresses. Tunable; shared NAT (campus, mobile CGNAT) needs headroom.
export const OTP_IP_SEND_LIMIT = { window: 15 * 60, max: 20 };

export function createAuthRateLimiter(db: Db, secret: string, now: () => number = Date.now) {
  const hmacKey = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const digest = await crypto.subtle.sign("HMAC", await hmacKey, new TextEncoder().encode(`flag:auth-rate-limit:v1:${key}`));
      const storedKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const timestamp = now();
      const expiresAt = timestamp + rule.window * 1000;
      const [, admitted] = await db.batch([
        db.delete(authRateLimit).where(lte(authRateLimit.expiresAt, timestamp)),
        db.insert(authRateLimit).values({ key: storedKey, count: 1, expiresAt })
          .onConflictDoUpdate({
            target: authRateLimit.key,
            set: {
              count: sql`CASE WHEN ${authRateLimit.expiresAt} <= ${timestamp} THEN 1 ELSE ${authRateLimit.count} + 1 END`,
              expiresAt: sql`CASE WHEN ${authRateLimit.expiresAt} <= ${timestamp} THEN ${expiresAt} ELSE ${authRateLimit.expiresAt} END`,
            },
            setWhere: or(lte(authRateLimit.expiresAt, timestamp), lt(authRateLimit.count, rule.max)),
          }).returning({ expiresAt: authRateLimit.expiresAt }),
      ]);
      if (admitted.length > 0) return { allowed: true, retryAfter: null };
      const [bucket] = await db.select({ expiresAt: authRateLimit.expiresAt }).from(authRateLimit)
        .where(and(eq(authRateLimit.key, storedKey), sql`${authRateLimit.count} >= ${rule.max}`));
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(((bucket?.expiresAt ?? expiresAt) - timestamp) / 1000)) };
    },
  };
}
