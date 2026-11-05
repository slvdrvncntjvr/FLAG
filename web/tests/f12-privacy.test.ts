import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { POLICY_VERSIONS } from "@/lib/policies";
import { assessPrivacyRequest, executePrivacyRequest, placeRetentionHold, recordBackupDisposition, recordPrivacyOutcome, recordPrivacyRequest, releaseRetentionHold, verifyBackupDisposition } from "@/features/privacy/handlers";
import { deliverExport, prepareExport } from "@/features/privacy/exports";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { type Assessment } from "@/features/privacy/schema";

const db = createDb(env.DB);
const iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
async function actor(role: "admin" | "client" = "client") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO user(id,name,email,role) VALUES(?,'Synthetic privacy subject',?,?)").bind(id, `${id}@example.invalid`, role).run();
  for (const policy of ["privacy", "terms"] as const) await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)").bind(crypto.randomUUID(), id, policy, POLICY_VERSIONS[policy]).run();
  return id;
}
function assessment(subject: string, targets: Assessment["targets"] = [], exportKind?: "session" | "assessed_capability"): Assessment {
  return { targets, identity: { method: "non_id_control", evidenceReference: "synthetic-control-check", verifiedSubjectId: subject, verifiedAt: iso(-1000) },
    categories: ["identity", "authentication", "invitations", "publication", "proofs", "consent", "history", "backups"].map(category => ({ category: category as Assessment["categories"][number]["category"], disposition: "retain", basis: "Synthetic finite purpose pending verified copy handling", until: iso(86400000) })),
    backups: "unverified", ...(exportKind ? { export: { authKind: exportKind, handoverChannel: exportKind === "session" ? "subject_session" : "independently_verified_private_channel", handoverReference: "synthetic-private-handover", secureHandover: true, deadline: iso(3600000), categories: ["account", "policies"] as ("account" | "policies")[] } } : {}) };
}
async function request(admin: string, subject: string, kind = "export", a = assessment(subject, [], "session")) {
  const r = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind, receivedAt: iso(-1000), dueAt: iso(86400000) });
  expect(r.ok).toBe(true); if (!r.ok || !r.id) throw new Error("fixture request failed");
  expect(await assessPrivacyRequest(db, admin, r.id, a)).toEqual({ ok: true });
  return r.id;
}
describe("PRD-F12 actual privacy processing and private exports", () => {
  it("denies non-admins and revoked-policy processors without recording a request", async () => {
    const subject = await actor(), admin = await actor("admin");
    const input = { subjectUserId: subject, responsibleId: admin, kind: "export", receivedAt: iso(-1000), dueAt: iso(100000) };
    expect(await recordPrivacyRequest(db, subject, input)).toEqual({ ok: false, error: "forbidden" });
    await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(admin).run();
    expect(await recordPrivacyRequest(db, admin, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await env.DB.prepare("SELECT 1 FROM privacy_request WHERE subject_user_id=?").bind(subject).first()).toBeNull();
  });
  it("deactivates and revokes credentials without a USER cascade and refuses erasure-complete with unknown copies", async () => {
    const subject = await actor(), admin = await actor("admin");
    await env.DB.prepare("INSERT INTO session(id,user_id,token,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(), subject, crypto.randomUUID(), iso(86400000)).run();
    await env.DB.prepare("INSERT INTO account(id,user_id,provider_id,account_id,password) VALUES(?,?,'credential',?,'synthetic-secret')").bind(crypto.randomUUID(), subject, subject).run();
    const a = assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }]);
    const id = await request(admin, subject, "closure", a);
    expect((await executePrivacyRequest(db, env, admin, id)).ok).toBe(true);
    expect(await env.DB.prepare("SELECT name,email,deactivated_at FROM user WHERE id=?").bind(subject).first()).toMatchObject({ name: "Closed account", email: `${subject}@closed.invalid`, deactivated_at: expect.any(String) });
    expect(await env.DB.prepare("SELECT 1 FROM session WHERE user_id=?").bind(subject).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM account WHERE user_id=?").bind(subject).first()).toBeNull();
    expect((await env.DB.prepare("SELECT count(*) AS n FROM policy_acceptance WHERE user_id=?").bind(subject).first())?.n).toBe(2);
    expect(await env.DB.prepare("SELECT 1 FROM policy_acceptance WHERE user_id=? AND retired_at IS NULL").bind(subject).first()).toBeNull();
    expect(await recordPrivacyOutcome(db, admin, id, "completed", "All requested actions complete")).toEqual({ ok: false, error: "conflict" });
    expect(await recordPrivacyOutcome(db, admin, id, "deferred", "Credential revocation complete; backup inventory and finite shell purpose remain", iso(86400000))).toEqual({ ok: true });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("exports only assessed own metadata, requires same-subject session and consumes the token exactly once", async () => {
    const subject = await actor(), admin = await actor("admin"), other = await actor();
    const id = await request(admin, subject);
    await env.DB.prepare("INSERT INTO account(id,user_id,provider_id,account_id,access_token) VALUES(?,?,'synthetic',?,'NEVER-EXPORT-SECRET')").bind(crypto.randomUUID(), subject, subject).run();
    const d = await prepareExport(db, env.PROOFS, admin, id);
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, other)).status).toBe(404);
    const response = await deliverExport(db, env.PROOFS, d.deliveryId, d.token, subject);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.text(); expect(body).toContain(subject); expect(body).not.toContain("NEVER-EXPORT-SECRET"); expect(body).not.toContain(other);
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, subject)).status).toBe(404);
    const receipt = await env.DB.prepare("SELECT token_hash,object_key,purged_at FROM export_delivery WHERE id=?").bind(d.deliveryId).first();
    expect(receipt).toMatchObject({ token_hash: null, object_key: null, purged_at: expect.any(String) });
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
    expect(JSON.stringify((await env.DB.prepare("SELECT * FROM audit_event WHERE subject_id=?").bind(id).all()).results)).not.toContain(d.token);
    expect(await recordPrivacyOutcome(db, admin, id, "completed", "Token was consumed")).toEqual({ ok: false, error: "invalid_input" });
    expect(await recordPrivacyOutcome(db, admin, id, "completed", "Synthetic subject confirms receipt", undefined, "synthetic-receipt")).toEqual({ ok: true });
  });
  it("refuses stale identity and purges an artifact when an included source changes", async () => {
    const subject = await actor(), admin = await actor("admin"); const id = await request(admin, subject);
    const d = await prepareExport(db, env.PROOFS, admin, id);
    await env.DB.prepare("UPDATE user SET name='Changed synthetic name' WHERE id=?").bind(subject).run();
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, subject)).status).toBe(404);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
    const a = assessment(subject); a.identity.verifiedAt = iso(-2 * 86400000);
    expect(await assessPrivacyRequest(db, admin, id, a)).toEqual({ ok: false, error: "conflict" });
  });
  it("retains export writer tracking through closure and cleanup during a late PUT, then removes all copied bytes", async () => {
    const subject = await actor(), admin = await actor("admin"), id = await request(admin, subject);
    let key: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        key = args[0];
        const row = await env.DB.prepare("SELECT id,object_key,write_inflight FROM export_delivery WHERE privacy_request_id=?").bind(id).first<{ id: string }>();
        expect(row).toMatchObject({ object_key: key, write_inflight: 1 });
        const close = await request(admin, subject, "closure", assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }]));
        expect((await executePrivacyRequest(db, env, admin, close)).ok).toBe(true);
        await runMaintenance(env);
        expect(await env.DB.prepare("SELECT object_key,token_hash,write_inflight,purged_at FROM export_delivery WHERE id=?").bind(row!.id).first()).toEqual({ object_key: key, token_hash: null, write_inflight: 1, purged_at: null });
        await expect(env.DB.prepare("UPDATE export_delivery SET object_key=NULL,purged_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(row!.id).run()).rejects.toThrow();
        return target.put(...args);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(prepareExport(db, bucket, admin, id)).rejects.toThrow("export_unavailable");
    expect(key).toBeDefined();
    expect(await env.PROOFS.head(key!)).toBeNull();
    expect((await env.PROOFS.list({ prefix: "exports/" })).objects).toHaveLength(0);
    expect(await env.DB.prepare("SELECT object_key,token_hash,write_inflight,purged_at FROM export_delivery WHERE privacy_request_id=?").bind(id).first()).toEqual({ object_key: null, token_hash: null, write_inflight: 0, purged_at: expect.any(String) });
  });
  it("skips an assessed artifact purge during PUT while completing earlier unrelated due work", async () => {
    const subject = await actor(), admin = await actor("admin"), unrelated = await actor(), id = await request(admin, subject), policyId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy','synthetic-old-copy-race','2020-01-01T00:00:00.000Z')").bind(policyId, unrelated).run();
    let key: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        key = args[0];
        const d = await env.DB.prepare("SELECT id FROM export_delivery WHERE privacy_request_id=?").bind(id).first<{ id: string }>();
        const deletion = await request(admin, subject, "deletion", assessment(subject, [{ targetType: "export_delivery", targetId: d!.id, operation: "purge", dueAt: iso(-1000), basis: "assessed_erasure" }]));
        expect((await executePrivacyRequest(db, env, admin, deletion)).ok).toBe(true);
        expect(await env.DB.prepare("SELECT 1 FROM policy_acceptance WHERE id=?").bind(policyId).first()).toBeNull();
        expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE target_type='policy_acceptance' AND target_id=?").bind(policyId).first()).toEqual({ status: "completed" });
        expect(await env.DB.prepare("SELECT status,attempts FROM maintenance_task WHERE privacy_request_id=?").bind(deletion).first()).toEqual({ status: "planned", attempts: 0 });
        expect(await env.DB.prepare("SELECT object_key,write_inflight FROM export_delivery WHERE id=?").bind(d!.id).first()).toEqual({ object_key: key, write_inflight: 1 });
        return target.put(...args);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const delivery = await prepareExport(db, bucket, admin, id);
    await runMaintenance(env);
    expect(await env.PROOFS.head(key!)).toBeNull();
    expect((await deliverExport(db, env.PROOFS, delivery.deliveryId, delivery.token, subject)).status).toBe(404);
  });
  it("supports only separately assessed export capability after closure without restoring a session", async () => {
    const subject = await actor(), admin = await actor("admin");
    const close = await request(admin, subject, "closure", assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }]));
    expect((await executePrivacyRequest(db, env, admin, close)).ok).toBe(true);
    const id = await request(admin, subject, "export", assessment(subject, [], "assessed_capability"));
    const d = await prepareExport(db, env.PROOFS, admin, id);
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, null)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM session WHERE user_id=?").bind(subject).first()).toBeNull();
  });
  it("exports the scrubbed shell from the same closure request after exact redaction completes, bounded by pending purge", async () => {
    const subject = await actor(), admin = await actor("admin");
    const a = assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }], "assessed_capability");
    const shellDeadline = iso(600000);
    a.categories.find(c => c.category === "identity")!.until = shellDeadline;
    const id = await request(admin, subject, "closure", a);
    // An outstanding exact redaction denies the original identity projection.
    await expect(prepareExport(db, env.PROOFS, admin, id)).rejects.toThrow("source_expired");
    expect((await executePrivacyRequest(db, env, admin, id)).ok).toBe(true);
    const closed = await env.DB.prepare("SELECT deactivated_at FROM user WHERE id=?").bind(subject).first<{ deactivated_at: string }>();
    expect(closed?.deactivated_at).toEqual(expect.any(String));
    const d = await prepareExport(db, env.PROOFS, admin, id);
    expect(d.expiresAt).toBe(shellDeadline);
    const response = await deliverExport(db, env.PROOFS, d.deliveryId, d.token, null);
    expect(response.status).toBe(200);
    expect((await response.json() as { account: { deactivated_at: string; name: string } }).account).toMatchObject({ deactivated_at: closed!.deactivated_at, name: "Closed account" });
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, null)).status).toBe(404);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM session WHERE user_id=?").bind(subject).first()).toBeNull();
    const next = await prepareExport(db, env.PROOFS, admin, id);
    // A newly assessed earlier purge still revokes the copied scrubbed shell.
    await request(admin, subject, "deletion", assessment(subject, [{ targetType: "user", targetId: subject, operation: "purge", basis: "assessed_erasure", dueAt: iso(-1000) }]));
    expect((await deliverExport(db, env.PROOFS, next.deliveryId, next.token, null)).status).toBe(404);
    expect(await env.PROOFS.head(`exports/${next.deliveryId}`)).toBeNull();
    expect(await env.DB.prepare("SELECT deactivated_at FROM user WHERE id=?").bind(subject).first()).toEqual(closed);
  });
  it("does not waive an outstanding redaction using another request's completed action for the same subject", async () => {
    const subject = await actor(), admin = await actor("admin");
    const close = await request(admin, subject, "closure", assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }]));
    expect((await executePrivacyRequest(db, env, admin, close)).ok).toBe(true);
    const pending = await request(admin, subject, "closure", assessment(subject, [{ targetType: "user", targetId: subject, operation: "redact_identity", basis: "account_closure", dueAt: iso(-1000) }], "assessed_capability"));
    await expect(prepareExport(db, env.PROOFS, admin, pending)).rejects.toThrow("source_expired");
    expect(await env.DB.prepare("SELECT 1 FROM export_delivery WHERE privacy_request_id=?").bind(pending).first()).toBeNull();
  });
  it("honors exact holds and physically purges retired policy rows through the real bounded runner", async () => {
    const subject = await actor(), admin = await actor("admin"), policyId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy','synthetic-old','2020-01-01T00:00:00.000Z')").bind(policyId, subject).run();
    expect(await placeRetentionHold(db, admin, { targetType: "policy", targetId: policyId, kind: "legal", reason: "Synthetic bounded legal purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    await runMaintenance(env);
    expect(await env.DB.prepare("SELECT id FROM policy_acceptance WHERE id=?").bind(policyId).first()).not.toBeNull();
    const hold = await env.DB.prepare("SELECT id FROM retention_hold WHERE target_id=?").bind(policyId).first<{ id: string }>();
    expect(await releaseRetentionHold(db, admin, hold!.id)).toEqual({ ok: true });
    const result = await runMaintenance(env); expect(result.claimed).toBeLessThanOrEqual(25); expect(result.r2Deletes).toBeLessThanOrEqual(25);
    expect(await env.DB.prepare("SELECT id FROM policy_acceptance WHERE id=?").bind(policyId).first()).toBeNull();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("reports held assessed actions while purging unrelated targets, then resumes after release", async () => {
    const subject = await actor(), admin = await actor("admin");
    const heldPolicy = crypto.randomUUID(), readyPolicy = crypto.randomUUID(), dueAt = iso(-1000);
    for (const [policyId, version] of [[heldPolicy, "synthetic-held"], [readyPolicy, "synthetic-ready"]]) {
      await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy',?,?)")
        .bind(policyId, subject, version, iso(-1000)).run();
    }
    expect(await placeRetentionHold(db, admin, { targetType: "policy", targetId: heldPolicy, kind: "review", reason: "Synthetic exact policy hold", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    const id = await request(admin, subject, "deletion", assessment(subject, [heldPolicy, readyPolicy].map(targetId => ({
      targetType: "policy_acceptance", targetId, operation: "purge", basis: "assessed_erasure", dueAt,
    }))));
    const first = await executePrivacyRequest(db, env, admin, id);
    expect(first).toMatchObject({ ok: true, message: expect.stringContaining("1 held") });
    expect(first).toMatchObject({ message: expect.stringContaining("1 remain") });
    expect(await env.DB.prepare("SELECT id FROM policy_acceptance WHERE id=?").bind(heldPolicy).first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM policy_acceptance WHERE id=?").bind(readyPolicy).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=? AND target_id=?").bind(id, heldPolicy).first()).toBeNull();
    const hold = await env.DB.prepare("SELECT id FROM retention_hold WHERE target_id=?").bind(heldPolicy).first<{ id: string }>();
    expect(await releaseRetentionHold(db, admin, hold!.id)).toEqual({ ok: true });
    expect((await executePrivacyRequest(db, env, admin, id)).ok).toBe(true);
    expect(await env.DB.prepare("SELECT id FROM policy_acceptance WHERE id=?").bind(heldPolicy).first()).toBeNull();
    const receipts = await env.DB.prepare("SELECT target_id,status,attempts,due_at FROM maintenance_task WHERE privacy_request_id=? ORDER BY target_id").bind(id).all();
    expect(receipts.results).toHaveLength(2);
    for (const receipt of receipts.results) expect(receipt).toMatchObject({ status: "completed", attempts: 1, due_at: dueAt });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("requires exact backup scope, real elapsed expiry and physical-copy evidence beyond restore filtering", async () => {
    const subject = await actor(), admin = await actor("admin"), other = await actor();
    const policyId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy','synthetic-backup-purpose','2020-01-01T00:00:00.000Z')").bind(policyId, subject).run();
    const a = assessment(subject, [{ targetType: "policy_acceptance", targetId: policyId, operation: "purge", dueAt: iso(-1000), basis: "assessed_erasure" }]); a.backups = "inventoried";
    const requestId = await request(admin, subject, "deletion", a);
    expect((await executePrivacyRequest(db, env, admin, requestId)).ok).toBe(true);
    const b = { targetType: "user", targetId: subject, backupRef: "synthetic-copy", action: "restore_filter", basis: "Synthetic verified isolated copy handling", dueAt: iso(3600000) };
    expect(await recordBackupDisposition(db, admin, requestId, { ...b, targetId: other })).toEqual({ ok: false, error: "conflict" });
    expect(await recordBackupDisposition(db, admin, requestId, b)).toEqual({ ok: true });
    const filter = await env.DB.prepare("SELECT id FROM backup_disposition WHERE privacy_request_id=?").bind(requestId).first<{ id: string }>();
    expect(await verifyBackupDisposition(db, admin, filter!.id, "synthetic-filter-evidence")).toEqual({ ok: true });
    expect(await recordPrivacyOutcome(db, admin, requestId, "completed", "Restore filter applied")).toEqual({ ok: false, error: "conflict" });
    expect(await recordBackupDisposition(db, admin, requestId, { ...b, action: "expire" })).toEqual({ ok: true });
    const expiry = await env.DB.prepare("SELECT id FROM backup_disposition WHERE privacy_request_id=? AND action='expire'").bind(requestId).first<{ id: string }>();
    expect(await verifyBackupDisposition(db, admin, expiry!.id, "synthetic-future-expiry")).toEqual({ ok: false, error: "conflict" });
    expect(await recordBackupDisposition(db, admin, requestId, { ...b, action: "erase" })).toEqual({ ok: true });
    const erasure = await env.DB.prepare("SELECT id FROM backup_disposition WHERE privacy_request_id=? AND action='erase'").bind(requestId).first<{ id: string }>();
    expect(await verifyBackupDisposition(db, subject, erasure!.id, "synthetic-erasure")).toEqual({ ok: false, error: "forbidden" });
    expect(await verifyBackupDisposition(db, admin, erasure!.id, "synthetic-erasure")).toEqual({ ok: true });
    // An unverified copy receipt remains outstanding even if another action succeeded.
    expect(await recordPrivacyOutcome(db, admin, requestId, "completed", "Some copy actions verified")).toEqual({ ok: false, error: "conflict" });
    expect(await recordPrivacyOutcome(db, admin, requestId, "deferred", "Copy expiry awaits verification", iso(86400000))).toEqual({ ok: true });
  });
  it("consumes delivery on purge failure, returns no bytes and retains a retryable artifact receipt", async () => {
    const subject = await actor(), admin = await actor("admin"), requestId = await request(admin, subject);
    const d = await prepareExport(db, env.PROOFS, admin, requestId);
    const failing = new Proxy(env.PROOFS, { get(bucket, property) {
      if (property === "delete") return async () => { throw new Error("Synthetic settled export deletion failure"); };
      const value = Reflect.get(bucket, property); return typeof value === "function" ? value.bind(bucket) : value;
    } });
    const response = await deliverExport(db, failing, d.deliveryId, d.token, subject);
    expect(response.status).toBe(404); expect(await response.text()).toBe("");
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, subject)).status).toBe(404);
    expect(await env.DB.prepare("SELECT token_hash,purged_at FROM export_delivery WHERE id=?").bind(d.deliveryId).first()).toEqual({ token_hash: null, purged_at: null });
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).not.toBeNull();
    await runMaintenance(env);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
  });
  it("caps metadata copies at the earlier exact assessed source-erasure deadline", async () => {
    const subject = await actor(), admin = await actor("admin"), dueAt = iso(60000);
    const a = assessment(subject, [{ targetType: "user", targetId: subject, operation: "purge", dueAt, basis: "assessed_erasure" }], "session");
    const requestId = await request(admin, subject, "export", a);
    const d = await prepareExport(db, env.PROOFS, admin, requestId);
    expect(d.expiresAt).toBe(dueAt);
  });
  it("caps an export at another verified request's exact future source-erasure deadline", async () => {
    const subject = await actor(), admin = await actor("admin"), dueAt = iso(60000);
    const deletion = await request(admin, subject, "deletion", assessment(subject, [{ targetType: "user", targetId: subject, operation: "purge", dueAt, basis: "assessed_erasure" }]));
    expect((await executePrivacyRequest(db, env, admin, deletion)).ok).toBe(true);
    const id = await request(admin, subject), d = await prepareExport(db, env.PROOFS, admin, id);
    expect(d.expiresAt).toBe(dueAt);
  });
  it.each([60000, -1000])("revokes a prepared export when another verified request shortens its exact source deadline (%s ms), before physical maintenance", async delta => {
    const subject = await actor(), admin = await actor("admin"), id = await request(admin, subject);
    const d = await prepareExport(db, env.PROOFS, admin, id);
    await request(admin, subject, "deletion", assessment(subject, [{ targetType: "user", targetId: subject, operation: "purge", dueAt: iso(delta), basis: "assessed_erasure" }]));
    // No maintenance ran: source existence alone cannot justify disclosure.
    expect(await env.DB.prepare("SELECT 1 FROM user WHERE id=?").bind(subject).first()).not.toBeNull();
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, subject)).status).toBe(404);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
    expect(await env.DB.prepare("SELECT token_hash,object_key FROM export_delivery WHERE id=?").bind(d.deliveryId).first()).toEqual({ token_hash: null, object_key: null });
  });
  it("rejects a forged assessment targeting another subject without changing the received request", async () => {
    const subject = await actor(), other = await actor(), admin = await actor("admin");
    const r = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
    if (!r.ok || !r.id) throw new Error("fixture request failed");
    const a = assessment(subject, [{ targetType: "user", targetId: other, operation: "redact_identity", basis: "assessed_erasure", dueAt: iso(-1000) }]);
    expect(await assessPrivacyRequest(db, admin, r.id, a)).toEqual({ ok: false, error: "invalid_input" });
    expect(await env.DB.prepare("SELECT status,assessment FROM privacy_request WHERE id=?").bind(r.id).first()).toEqual({ status: "received", assessment: null });
    expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=?").bind(r.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT deactivated_at FROM user WHERE id=?").bind(other).first()).toEqual({ deactivated_at: null });
  });
  it("does not label an empty erasure plan completed", async () => {
    const subject = await actor(), admin = await actor("admin"), a = assessment(subject);
    a.backups = "inventoried";
    const requestId = await request(admin, subject, "deletion", a);
    expect(await recordPrivacyOutcome(db, admin, requestId, "completed", "No physical erasure was planned")).toEqual({ ok: false, error: "conflict" });
  });
});
