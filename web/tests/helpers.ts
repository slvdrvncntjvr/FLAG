import { env } from "cloudflare:workers";
import { createAuth } from "@/server/auth/config";
import { createDb } from "@/server/db";

export const BASE = "http://localhost:3000";

export function setup() {
  const db = createDb(env.DB);
  const codes = new Map<string, string>();
  const auth = createAuth(
    { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.com" },
    db,
    { sendOtp: async (email, otp) => void codes.set(email, otp) },
  );

  // Each setup() is a distinct client IP so rate limits do not leak between tests.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

  async function post(path: string, body: unknown, cookie?: string) {
    return auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    );
  }

  async function signIn(email: string, extra: Record<string, unknown> = {}) {
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    const res = await post("/sign-in/email-otp", { email, otp: codes.get(email), ...extra });
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    const body = (await res.clone().json().catch(() => ({}))) as { user?: { id: string } };
    return { res, cookie, userId: body.user?.id };
  }

  return { db, auth, codes, post, signIn, ip };
}
