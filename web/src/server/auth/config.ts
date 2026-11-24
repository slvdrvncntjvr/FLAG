import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError, signOut } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { normalizeIP } from "@better-auth/core/utils/ip";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendMail } from "@/server/mail";
import { createAuthRateLimiter, OTP_IP_SEND_LIMIT, OTP_LIMIT, OTP_PATHS, OTP_SEND_PATHS } from "./rate-limit";
import { validateAuthUserProfile } from "./privacy";
import { authLogger, safeAuthError, withAuthSafety } from "./safety";

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
  sendOtp?: (email: string, otp: string) => Promise<void>;
};

const PASSWORD_PATHS = new Set([
  "/sign-up/email", "/sign-in/email", "/set-password", "/change-password", "/verify-password",
  "/request-password-reset", "/forget-password", "/reset-password", "/reset-password/:token",
  "/email-otp/request-password-reset", "/forget-password/email-otp", "/email-otp/reset-password",
]);

function denyPasswordAuth(): never {
  throw new APIError("FORBIDDEN", {
    code: "PASSWORD_AUTH_DISABLED",
    message: "Password authentication is unavailable. Use an email sign-in code.",
  });
}

async function requirePasswordlessAccount(data: { providerId?: string; password?: string | null }) {
  if (data.providerId === "credential" || data.password != null) denyPasswordAuth();
}

export function createAuth(env: AuthEnv, db: Db, options: AuthOptions = {}) {
  const limiter = createAuthRateLimiter(db, env.BETTER_AUTH_SECRET);
  const unavailableAccount = () => new APIError("FORBIDDEN", {
    code: "ACCOUNT_UNAVAILABLE", message: "This account is unavailable. Contact support.",
  });
  const ensureActiveAccount = async (userId: string) => {
    const current = await db.query.user.findFirst({
      columns: { deactivatedAt: true }, where: eq(schema.user.id, userId),
    });
    if (!current || current.deactivatedAt !== null) throw unavailableAccount();
  };
  const accountWrite = async (data: { providerId?: string; password?: string | null; userId?: string }) => {
    await requirePasswordlessAccount(data);
    if (data.userId) await ensureActiveAccount(data.userId);
  };
  const failedDeliveries = new WeakSet<object>();
  const baseUrl = new URL(env.BETTER_AUTH_URL);
  const localConsole = process.env.NODE_ENV !== "production" && baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return withAuthSafety(betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    logger: authLogger,
    onAPIError: {
      onError(error) { throw safeAuthError(error); },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { ...schema, verification: schema.authVerification },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: google,
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false },
        banned: { type: "boolean", required: false, defaultValue: false, input: false },
        deactivatedAt: { type: "string", required: false, input: false, returned: false },
        banReason: { type: "string", required: false, input: false },
        phoneNumber: { type: "string", required: false, input: false },
        phoneNumberVerified: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true, window: 60, max: 20, customStorage: limiter,
      customRules: Object.fromEntries([...OTP_PATHS].map((path) => [path, false as const])),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if ((ctx.path && (PASSWORD_PATHS.has(ctx.path) || ctx.path.startsWith("/reset-password/")))
          || ctx.body?.type === "forget-password" || ctx.query?.type === "forget-password") denyPasswordAuth();
        if (ctx.path === "/email-otp/check-verification-otp") throw new APIError("FORBIDDEN", {
          code: "OTP_CHECK_DISABLED",
          message: "Use the email sign-in or verification form.",
        });
        if (ctx.path === "/sign-out") {
          if (!signOut.options.body.safeParse(ctx.body).success) return;
          const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
          if (token) {
            try {
              await db.delete(schema.session).where(eq(schema.session.token, token));
            } catch {
              console.error("AUTH_SESSION_REVOCATION_FAILED");
              throw new APIError("SERVICE_UNAVAILABLE", {
                code: "SESSION_REVOCATION_FAILED",
                message: "Could not sign out. Try again later.",
              });
            }
          }
          return;
        }
        const signedToken = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
        if (signedToken) {
          const closedSession = await db.select({ id: schema.user.id }).from(schema.session)
            .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
            .where(and(eq(schema.session.token, signedToken), isNotNull(schema.user.deactivatedAt))).limit(1);
          if (closedSession.length) throw unavailableAccount();
        }
        if (!ctx.path || !OTP_PATHS.has(ctx.path)) return;
        const submittedEmail = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
        if (submittedEmail) {
          const closed = await db.query.user.findFirst({
            columns: { id: true }, where: and(eq(schema.user.email, submittedEmail), isNotNull(schema.user.deactivatedAt)),
          });
          if (closed) throw unavailableAccount();
        }
        const sends = OTP_SEND_PATHS.has(ctx.path);
        if (sends && !options.sendOtp && !env.BREVO_API_KEY && !env.RESEND_API_KEY && !localConsole) {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
        }
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
        const trusted = ctx.headers?.get("cf-connecting-ip");
        const ip = trusted ? normalizeIP(trusted, { ipv6Subnet: 64 }) : "no-trusted-ip";
        const result = await limiter.consume(JSON.stringify(["otp", ip, ctx.path, email]), OTP_LIMIT);
        const perIp = result.allowed && sends ? await limiter.consume(JSON.stringify(["otp-send-ip", ip]), OTP_IP_SEND_LIMIT) : result;
        if (!perIp.allowed) throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Try again after fifteen minutes.",
        }, { "Retry-After": String(perIp.retryAfter), "X-Retry-After": String(perIp.retryAfter) });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (failedDeliveries.delete(ctx.context)) throw new APIError("SERVICE_UNAVAILABLE", {
          code: "EMAIL_DELIVERY_FAILED",
          message: "Could not send the sign-in code. Try again later.",
        });
        const returned = ctx.context.returned;
        if (isAPIError(returned) && returned.statusCode >= 400) throw safeAuthError(returned);
      }),
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    databaseHooks: {
      account: {
        create: { before: accountWrite },
        update: { before: accountWrite },
      },
      user: {
        create: { before: validateAuthUserProfile },
        update: { before: async (data, ctx) => {
          const validated = await validateAuthUserProfile(data);
          const id = ctx?.path === "/update-user" ? ctx.context.session?.user.id : undefined;
          if (id) await ensureActiveAccount(id);
          if (id && typeof data.name === "string") {
            const current = await db.query.user.findFirst({ columns: { name: true }, where: eq(schema.user.id, id) });
            if (current && data.name !== current.name) {
              const profile = await db.query.freelancerProfile.findFirst({ columns: { status: true }, where: eq(schema.freelancerProfile.userId, id) });
              const review = await db.query.verificationCase.findFirst({ columns: { id: true }, where: and(eq(schema.verificationCase.freelancerId, id), isNull(schema.verificationCase.decidedAt)) });
              if (profile?.status === "verified" || review) throw new APIError("CONFLICT", {
                code: "REVIEWED_NAME_FIXED",
                message: "This name cannot be changed while under review or verified.",
              });
            }
          }
          return validated;
        } },
      },
      session: {
        create: {
          before: async (session) => {
            const row = await db.query.user.findFirst({
              columns: { banned: true, deactivatedAt: true },
              where: eq(schema.user.id, session.userId),
            });
            if (row?.banned) throw new APIError("FORBIDDEN", { message: "Account suspended" });
            if (!row || row.deactivatedAt !== null) throw unavailableAccount();
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
            if (!result.sent) {
              if (localConsole) {
                console.info(`[dev] sign-in code for ${email}: ${otp}`);
              } else {
                throw new Error("mail_unavailable");
              }
            }
          } catch {
            if (ctx) failedDeliveries.add(ctx.context);
            else throw new APIError("SERVICE_UNAVAILABLE", { message: "Sign-in email is unavailable. Try again later." });
            console.error("AUTH_EMAIL_DELIVERY_FAILED");
          }
        },
      }),
      nextCookies(),
    ],
  }));
}

export type Auth = ReturnType<typeof createAuth>;
