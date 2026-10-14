import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendMail } from "@/server/mail";
import { createAuthRateLimiter, OTP_LIMIT, OTP_PATHS } from "./rate-limit";

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
        if (!ctx.path || !OTP_PATHS.has(ctx.path)) return;
        // Better Auth logs and absorbs errors in background delivery callbacks.
        // Reject missing configuration synchronously, before it stores/sends a code.
        if (["/email-otp/send-verification-otp", "/email-otp/request-password-reset", "/email-otp/request-email-change"].includes(ctx.path) &&
            !options.sendOtp && !env.BREVO_API_KEY && !env.RESEND_API_KEY && !localConsole) {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
        }
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
        const ip = ctx.headers?.get("cf-connecting-ip") ?? "no-trusted-ip";
        const result = await limiter.consume(JSON.stringify(["otp", ip, ctx.path, email]), OTP_LIMIT);
        if (!result.allowed) throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Try again after fifteen minutes.",
        }, { "Retry-After": String(result.retryAfter), "X-Retry-After": String(result.retryAfter) });
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
        async sendVerificationOTP({ email, otp }) {
          if (options.sendOtp) return options.sendOtp(email, otp);
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
              throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
            }
          }
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
