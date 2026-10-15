import { env } from "cloudflare:workers";
import { createAuth } from "@/server/auth/config";
import { createDb } from "@/server/db";
import { clientProfile, engagement, engagementLog, freelancerProfile, user } from "@/server/db/schema";

export const BASE = "http://localhost:3000";
let clientNumber = 0;

export function setup() {
  const db = createDb(env.DB);
  const codes = new Map<string, string>();
  const auth = createAuth(
    { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.com" },
    db,
    { sendOtp: async (email, otp) => void codes.set(email, otp) },
  );

  // Each setup() is a distinct client IP so rate limits do not leak between tests.
  const client = ++clientNumber;
  const ip = `2001:db8::${client.toString(16)}`;

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

// Independent fixtures keep constraint tests below the action/validation layer.
export async function seedLog() {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  const freelancerId = `freelancer-${id}`;
  const clientUserId = `client-user-${id}`;
  const clientId = `client-${id}`;
  const engagementId = `engagement-${id}`;
  const logId = `log-${id}`;
  await db.batch([
    db.insert(user).values([
      { id: freelancerId, name: "Test Freelancer", email: `${freelancerId}@example.invalid`, role: "freelancer" },
      { id: clientUserId, name: "Test Client", email: `${clientUserId}@example.invalid`, role: "client" },
    ]),
    db.insert(freelancerProfile).values({ userId: freelancerId, displayName: "Test Freelancer", status: "verified" }),
    db.insert(clientProfile).values({ id: clientId, userId: clientUserId, displayName: "Test Client", kind: "individual" }),
    db.insert(engagement).values({
      id: engagementId, freelancerId, clientId, title: "Test project", clientNameHint: "Test Client",
      startedOn: "2026-10-01", status: "accepted", inviteTokenHash: `hash-${id}`,
      inviteExpiresAt: "2026-10-15T00:00:00.000Z", acceptedAt: "2026-10-01T00:00:00.000Z",
    }),
    db.insert(engagementLog).values({
      id: logId, ref: `FL-${id}`, engagementId, freelancerId, clientId,
      anchorKind: "completed", anchorDate: "2026-10-14",
    }),
  ]);
  return { db, logId, engagementId, freelancerId, clientId, clientUserId };
}
