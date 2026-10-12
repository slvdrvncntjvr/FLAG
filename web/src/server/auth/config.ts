import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendMail } from "@/server/mail";

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
    // In-memory per isolate; durable limits come with the Rate Limiting binding (SDD §5, LOG Q7).
    rateLimit: { enabled: true, window: 60, max: 20 },
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
          if (!result.sent && env.BETTER_AUTH_URL.startsWith("http://localhost")) {
            console.info(`[dev] sign-in code for ${email}: ${otp}`);
          }
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
