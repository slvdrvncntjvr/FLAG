import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, signOut } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { normalizeIP } from "@better-auth/core/utils/ip";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendMail } from "@/server/mail";
import { createAuthRateLimiter, OTP_IP_SEND_LIMIT, OTP_LIMIT, OTP_PATHS, OTP_SEND_PATHS } from "./rate-limit";

export type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  MAIL_FROM: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

type AuthOptions = {
  // Tests capture codes here instead of sending mail.
  sendOtp?: (email: string, otp: string) => Promise<void>;
};

export function createAuth(env: AuthEnv, db: Db, options: AuthOptions = {}) {
  const limiter = createAuthRateLimiter(db, env.BETTER_AUTH_SECRET);
  // Better Auth catches delivery callback errors. Track failures by its per-call
  // context so an after hook can return 503 without mixing concurrent requests.
  const failedDeliveries = new WeakSet<object>();
  const baseUrl = new URL(env.BETTER_AUTH_URL);
  const localConsole = baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { ...schema, verification: schema.authVerification },
    }),
    // PRD-F7: Google or an email code. No passwords.
    emailAndPassword: { enabled: false },
    socialProviders: google,
    user: {
      additionalFields: {
        // input: false makes Better Auth reject these keys in any sign-up or update body (AB-12).
        role: { type: "string", required: false, input: false },
        banned: { type: "boolean", required: false, defaultValue: false, input: false },
        banReason: { type: "string", required: false, input: false },
        phoneNumber: { type: "string", required: false, input: false },
        phoneNumberVerified: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true, window: 60, max: 20, customStorage: limiter,
      // OTP needs IP+email, which the library's IP+path key cannot express.
      customRules: Object.fromEntries([...OTP_PATHS].map((path) => [path, false as const])),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-out") {
          // Router origin/CSRF checks run first. Leave invalid bodies to the
          // library's own validation, without changing the session.
          if (!signOut.options.body.safeParse(ctx.body).success) return;
          const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
          if (token) {
            try {
              // Better Auth 1.7.7 absorbs deletion (and lookup) errors during
              // sign-out. Revoke directly in D1 before it can clear the retry
              // cookie and report success. No session delete hooks or secondary
              // storage are configured; Google has no provider end-session URL.
              await db.delete(schema.session).where(eq(schema.session.token, token));
            } catch {
              console.error("Sign-out session revocation failed");
              throw new APIError("SERVICE_UNAVAILABLE", {
                code: "SESSION_REVOCATION_FAILED",
                message: "Could not sign out. Try again later.",
              });
            }
          }
          // Keep the library endpoint responsible for its normal cookie cleanup.
          return;
        }
        if (!ctx.path || !OTP_PATHS.has(ctx.path)) return;
        // Better Auth logs and absorbs errors in background delivery callbacks.
        // Reject missing configuration synchronously, before it stores/sends a code.
        const sends = OTP_SEND_PATHS.has(ctx.path);
        if (sends && !options.sendOtp && !env.BREVO_API_KEY && !env.RESEND_API_KEY && !localConsole) {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
        }
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
        // One IPv6 /64 is one client, as in Better Auth's own limiter; otherwise each address gets a fresh bucket.
        const trusted = ctx.headers?.get("cf-connecting-ip");
        const ip = trusted ? normalizeIP(trusted, { ipv6Subnet: 64 }) : "no-trusted-ip";
        const result = await limiter.consume(JSON.stringify(["otp", ip, ctx.path, email]), OTP_LIMIT);
        // Per-email buckets alone let one client mail any number of addresses and drain the provider quota.
        const perIp = result.allowed && sends ? await limiter.consume(JSON.stringify(["otp-send-ip", ip]), OTP_IP_SEND_LIMIT) : result;
        if (!perIp.allowed) throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Try again after fifteen minutes.",
        }, { "Retry-After": String(perIp.retryAfter), "X-Retry-After": String(perIp.retryAfter) });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (!failedDeliveries.delete(ctx.context)) return;
        throw new APIError("SERVICE_UNAVAILABLE", {
          code: "EMAIL_DELIVERY_FAILED",
          message: "Could not send the sign-in code. Try again later.",
        });
      }),
    },
    // Cloudflare sets cf-connecting-ip; x-forwarded-for can be supplied by the client.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    databaseHooks: {
      session: {
        create: {
          // A suspended account cannot start a session.
          before: async (session) => {
            const row = await db.query.user.findFirst({
              columns: { banned: true },
              where: eq(schema.user.id, session.userId),
            });
            if (row?.banned) throw new APIError("FORBIDDEN", { message: "Account suspended" });
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }, ctx) {
          try {
            if (options.sendOtp) return await options.sendOtp(email, otp);
            const result = await sendMail(env, {
              to: email,
              subject: `${otp} is your FLAG sign-in code`,
              text: `Your FLAG sign-in code is ${otp}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
            });
            // Local development only: no mail key, so print the code to the dev server console.
            if (!result.sent) {
              if (localConsole) {
                console.info(`[dev] sign-in code for ${email}: ${otp}`);
              } else {
                throw new Error("mail_unavailable");
              }
            }
          } catch {
            // Do not pass provider errors, email addresses, or OTPs to the
            // library logger. The callback and after hook share this context.
            if (ctx) failedDeliveries.add(ctx.context);
            else throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
            console.error("Sign-in email delivery failed");
          }
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
