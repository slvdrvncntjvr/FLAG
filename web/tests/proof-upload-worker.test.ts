import { env } from "cloudflare:workers";
import { serializeSignedCookie } from "better-call";
import { describe, expect, it } from "vitest";
import { proofUploadHttp } from "@/server/proof-upload-http";
import { POLICY_VERSIONS } from "@/lib/policies";
import { assessPrivacyRequest, executePrivacyRequest, recordPrivacyRequest } from "@/features/privacy/handlers";
import { BASE, setup } from "./helpers";
import { addActor, intakeFixture, pdfBytes, uploadRequest } from "./private-intake-fixtures";

const secret = "test-secret-test-secret-test-secret";
const bindings = { ...env, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.com", PRIVATE_INTAKE_ENABLED: "true" };

async function sessionFor(userId: string) {
  const id = crypto.randomUUID(), token = crypto.randomUUID();
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  await env.DB.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES(?,?,?,?)").bind(id, userId, token, expires).run();
  const cookie = (await serializeSignedCookie("better-auth.session_token", token, secret, { path: "/", httpOnly: true })).split(";")[0];
  const ip = `2001:db8:${crypto.getRandomValues(new Uint16Array(1))[0].toString(16)}::1`;
  return { id, cookie, expires, ip };
}

function request(logId: string, session?: { cookie: string; ip: string }) {
  const upload = uploadRequest();
  const headers = new Headers(upload.headers);
  headers.set("origin", BASE);
  if (session) { headers.set("cookie", session.cookie); headers.set("cf-connecting-ip", session.ip); }
  return new Request(`${BASE}/api/logs/${logId}/proofs`, { method: "POST", headers, body: upload.body });
}

async function response(req: Request, overrides: Partial<CloudflareEnv> = {}) {
  const result = await proofUploadHttp(req, { ...bindings, ...overrides });
  expect(result).not.toBeNull();
  expect(result!.headers.get("Cache-Control")).toBe("private, no-store");
  expect(result!.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(result!.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  return result!;
}

describe("Worker proof POST with actual Better Auth, D1 and R2", () => {
  it("leaves other routes/methods to Next and denies early without reading the body or database", async () => {
    for (const path of ["/api/logs/a/proofs/", "/api/logs/a%2Fb/proofs", "/api/logs/a/proofs/extra", "/api/proofs/a", `/api/logs/${"a".repeat(101)}/proofs`]) {
      expect(await proofUploadHttp(new Request(BASE + path, { method: "POST" }), bindings)).toBeNull();
    }
    expect(await proofUploadHttp(new Request(BASE + "/api/logs/a/proofs"), bindings)).toBeNull();
    const unused = new Proxy(bindings, { get(target, key, receiver) { if (key === "DB" || key === "PROOFS") throw new Error("Unexpected binding access"); return Reflect.get(target, key, receiver); } });
    const anonymous = request("a");
    expect((await proofUploadHttp(anonymous, unused))?.status).toBe(404);
    expect(anonymous.bodyUsed).toBe(false);
    const foreign = request("a", { cookie: "invalid", ip: "192.0.2.1" }); foreign.headers.set("origin", "https://foreign.invalid");
    expect((await proofUploadHttp(foreign, unused))?.status).toBe(403);
    expect(foreign.bodyUsed).toBe(false);
    const disabled = request("a", { cookie: "invalid", ip: "192.0.2.1" });
    expect((await response(disabled, { PRIVATE_INTAKE_ENABLED: "false" })).status).toBe(503);
    expect(disabled.bodyUsed).toBe(false);
  });

  it("uploads exact bytes without publishing, and forwards a real rolling-session cookie", async () => {
    const f = await intakeFixture(), session = await sessionFor(f.freelancerId);
    const result = await response(request(f.logId, session));
    expect(result.status).toBe(201);
    const body = await result.json() as { data: { proofId: string } };
    const row = await env.DB.prepare("SELECT object_key,size_bytes,sha256 FROM proof_file WHERE id=?").bind(body.data.proofId).first<{ object_key: string; size_bytes: number; sha256: string }>();
    expect(row?.size_bytes).toBe(pdfBytes.length);
    const object = await env.PROOFS.get(row!.object_key);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(pdfBytes);
    expect(await env.DB.prepare("SELECT status,current_revision_id,published_at FROM engagement_log WHERE id=?").bind(f.logId).first()).toMatchObject({ status: "draft", current_revision_id: null, published_at: null });
    expect(result.headers.getSetCookie().some(value => value.startsWith("better-auth.session_token="))).toBe(true);
    const refreshed = await env.DB.prepare("SELECT expires_at FROM session WHERE id=?").bind(session.id).first<{ expires_at: string }>();
    expect(refreshed!.expires_at > session.expires).toBe(true);
  });

  it("rechecks live actor policy, verification, role, suspension and stored-session revocation", async () => {
    const f = await intakeFixture(), session = await sessionFor(f.freelancerId);
    const attempt = () => response(request(f.logId, session));
    await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
    expect((await attempt()).status).toBe(404);
    await env.DB.prepare("UPDATE user SET banned=0,role='client' WHERE id=?").bind(f.freelancerId).run();
    expect((await attempt()).status).toBe(409);
    await env.DB.prepare("UPDATE user SET role='freelancer' WHERE id=?").bind(f.freelancerId).run();
    await env.DB.prepare("UPDATE freelancer_profile SET status='pending' WHERE user_id=?").bind(f.freelancerId).run();
    expect((await attempt()).status).toBe(409);
    await env.DB.prepare("UPDATE freelancer_profile SET status='verified' WHERE user_id=?").bind(f.freelancerId).run();
    const version = POLICY_VERSIONS.privacy;
    try { Reflect.set(POLICY_VERSIONS, "privacy", "2099-01-01"); expect((await attempt()).status).toBe(409); }
    finally { Reflect.set(POLICY_VERSIONS, "privacy", version); }
    await env.DB.prepare("DELETE FROM session WHERE id=?").bind(session.id).run();
    expect((await attempt()).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM proof_file WHERE log_id=?").bind(f.logId).first()).toEqual({ n: 0 });
  });

  it("keeps unrelated, named-client and bare-admin sessions from uploading; a closed account fails closed", async () => {
    const f = await intakeFixture();
    for (const actorId of [f.clientUserId, await addActor("admin"), await addActor("freelancer")]) {
      expect((await response(request(f.logId, await sessionFor(actorId)))).status).toBe(404);
    }
    const session = await sessionFor(f.freelancerId);
    const admin = await addActor("admin"), iso = (delta: number) => new Date(Date.now() + delta).toISOString();
    const closure = await recordPrivacyRequest(f.db, admin, { subjectUserId: f.freelancerId, responsibleId: admin, kind: "closure", receivedAt: iso(-1000), dueAt: iso(86_400_000) });
    expect(closure.ok).toBe(true);
    if (!closure.ok || !closure.id) throw new Error("Synthetic closure request failed");
    expect(await assessPrivacyRequest(f.db, admin, closure.id, {
      identity: { method: "non_id_control", evidenceReference: "synthetic-control", verifiedSubjectId: f.freelancerId, verifiedAt: iso(-1000) },
      categories: ["identity", "authentication", "invitations", "publication", "proofs", "consent", "history", "backups"].map(category => ({ category, disposition: "retain", basis: "Synthetic finite test purpose", until: iso(86_400_000) })),
      targets: [{ targetType: "user", targetId: f.freelancerId, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }], backups: "unverified",
    })).toEqual({ ok: true });
    expect((await executePrivacyRequest(f.db, env, admin, closure.id)).ok).toBe(true);
    expect(await env.DB.prepare("SELECT deactivated_at IS NOT NULL AS closed FROM user WHERE id=?").bind(f.freelancerId).first()).toEqual({ closed: 1 });
    expect((await response(request(f.logId, session))).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM proof_file WHERE log_id=?").bind(f.logId).first()).toEqual({ n: 0 });
  });

  it("does not accept a forged cookie, and bounds infrastructure errors", async () => {
    const f = await intakeFixture(), session = await sessionFor(f.freelancerId);
    expect((await response(request(f.logId, { ...session, cookie: session.cookie + "forged" }))).status).toBe(404);
    const failed = await response(request(f.logId, session), { BETTER_AUTH_URL: "invalid URL with private content" });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private content");
    // The same normal auth handler still owns logout; the upload route cannot
    // create a replacement session for a revoked cookie.
    const auth = setup().auth;
    expect((await auth.handler(new Request(BASE + "/api/auth/sign-out", { method: "POST", headers: { cookie: session.cookie, origin: BASE, "content-type": "application/json", "cf-connecting-ip": session.ip }, body: "{}" }))).status).toBe(200);
    expect((await response(request(f.logId, session))).status).toBe(404);
  });
});
