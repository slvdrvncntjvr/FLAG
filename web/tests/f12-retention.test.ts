import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { publishedFixture } from "./f04-log-review-fixtures";
import { addActor } from "./private-intake-fixtures";
import { recordPrivacyRequest, assessPrivacyRequest, executePrivacyRequest, placeRetentionHold, recordPrivacyOutcome, releaseRetentionHold } from "@/features/privacy/handlers";
import { prepareExport, deliverExport } from "@/features/privacy/exports";
import { createDb } from "@/server/db";
import { type Assessment } from "@/features/privacy/schema";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { intakeFixture } from "./private-intake-fixtures";
import { ageSyntheticDrafts, finiteSyntheticHold } from "./synthetic-retention-clock";

const db = createDb(env.DB), iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
async function assessed(subject: string, targets: Assessment["targets"], exportData = false) {
  const admin = await addActor("admin");
  const r = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: exportData ? "export" : "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!r.ok || !r.id) throw new Error("request_fixture");
  const a: Assessment = { targets, identity: { method: "non_id_control", evidenceReference: "synthetic-control", verifiedSubjectId: subject, verifiedAt: iso(-1000) }, categories: [{ category: "proofs", disposition: "remove", basis: "Individually assessed synthetic erasure", until: iso(86400000) }], backups: "unverified", ...(exportData ? { export: { authKind: "session", handoverChannel: "subject_session", handoverReference: "synthetic-handover", secureHandover: true, deadline: iso(86400000), categories: ["account", "policies", "log_metadata"] } as Assessment["export"] } : {}) };
  expect(await assessPrivacyRequest(db, admin, r.id, a)).toEqual({ ok: true });
  return { id: r.id, admin };
}
const purge = (targetType: Assessment["targets"][number]["targetType"], targetId: string): Assessment["targets"][number] => ({ targetType, targetId, operation: "purge", dueAt: iso(-1000), basis: "assessed_erasure" });
describe("PRD-F12 physical lifecycle and independent receipt retention", () => {
  it("finishes already-owned work when another candidate loses its claim race", async () => {
    const subject = await addActor("client");
    for (let i = 0; i < 2; i++) await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy',?,'2020-01-01T00:00:00.000Z')").bind(crypto.randomUUID(), subject, `synthetic-claim-race-${i}`).run();
    let attempts = 0;
    const database = new Proxy(env.DB, { get(target, property) {
      if (property === "prepare") return (sql: string) => {
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(s, key) {
          if (key === "bind") return (...args: Parameters<D1PreparedStatement["bind"]>) => wrap(s.bind(...args));
          if (key === "first" && sql.startsWith("UPDATE maintenance_task SET status='claimed'")) return async () => {
            if (++attempts === 2) throw new Error("Synthetic guard race before claim");
            return s.first();
          };
          const value = Reflect.get(s, key); return typeof value === "function" ? value.bind(s) : value;
        } });
        return wrap(target.prepare(sql));
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const result = await runMaintenance({ DB: database, PROOFS: env.PROOFS });
    expect(attempts).toBe(2); expect(result.claimed).toBe(1); expect(result.completed).toBe(1);
    expect((await env.DB.prepare("SELECT status FROM maintenance_task WHERE target_type='policy_acceptance'").all()).results.map(t => t.status).sort()).toEqual(["completed", "planned"]);
    await runMaintenance(env);
    expect(await env.DB.prepare("SELECT 1 FROM policy_acceptance WHERE user_id=? AND retired_at IS NOT NULL").bind(subject).first()).toBeNull();
  });
  it("caps unpublished metadata exports at the natural draft deadline and purges stale copies before delivery", async () => {
    const f = await intakeFixture(), activity = new Date(Date.now() - 30 * 86400000 + 60000).toISOString();
    await ageSyntheticDrafts([f.logId], activity);
    const p = await assessed(f.freelancerId, [], true), d = await prepareExport(db, env.PROOFS, p.admin, p.id);
    expect(d.expiresAt).toBe(new Date(Date.parse(activity) + 30 * 86400000).toISOString());
    await ageSyntheticDrafts([f.logId], new Date(Date.now() - 31 * 86400000).toISOString());
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, f.freelancerId)).status).toBe(404);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
  });
  it("keeps a late export PUT tracked while its included draft expires and maintenance runs", async () => {
    const f = await intakeFixture();
    const p = await assessed(f.freelancerId, [], true);
    let key: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        key = args[0];
        await ageSyntheticDrafts([f.logId], new Date(Date.now() - 31 * 86400000).toISOString());
        await runMaintenance(env);
        expect(await env.DB.prepare("SELECT object_key,write_inflight,purged_at FROM export_delivery WHERE privacy_request_id=?").bind(p.id).first()).toEqual({ object_key: key, write_inflight: 1, purged_at: null });
        return target.put(...args);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(prepareExport(db, bucket, p.admin, p.id)).rejects.toThrow("export_unavailable");
    expect(await env.PROOFS.head(key!)).toBeNull();
    expect(await env.DB.prepare("SELECT object_key,write_inflight,purged_at FROM export_delivery WHERE privacy_request_id=?").bind(p.id).first()).toEqual({ object_key: null, write_inflight: 0, purged_at: expect.any(String) });
  });
  it("fences exact log/proof and shared revision holds during a claimed proof's storage wait", async () => {
    const f = await publishedFixture();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    let checked = false;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "head") return async (key: string) => {
        const head = await target.head(key);
        if (!checked) {
          checked = true;
          for (const [type, id] of [["log", f.logId], ["proof", f.proofId], ["revision", f.revisionId]] as const) await expect(finiteSyntheticHold(id, type)).rejects.toThrow(/purge.*claimed/);
        }
        return head;
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await executePrivacyRequest(db, { DB: env.DB, PROOFS: bucket }, p.admin, p.id);
    expect(checked).toBe(true);
    expect(await env.PROOFS.head(`logs/${f.logId}/${f.proofId}`)).toBeNull();
  });
  it("purges actual R2 proof and cyclic D1 content while preserving detached minimal original-close history", async () => {
    const f = await publishedFixture();
    const original = await env.DB.prepare("SELECT closed_at FROM moderation_case WHERE id=?").bind(f.caseId).first<{ closed_at: string }>();
    const proof = await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    expect((await executePrivacyRequest(db, env, p.admin, p.id)).ok).toBe(true);
    expect(await env.PROOFS.head(proof!.object_key)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM proof_file WHERE id=?").bind(f.proofId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM log_revision WHERE id=?").bind(f.revisionId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT log_id,closed_at FROM moderation_case WHERE id=?").bind(f.caseId).first()).toEqual({ log_id: null, closed_at: original!.closed_at });
    expect((await env.DB.prepare("SELECT revision_id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toEqual([{ revision_id: null }]);
    expect((await env.DB.prepare("SELECT proof_id FROM proof_review WHERE round_id IN(SELECT id FROM review_round WHERE case_id=?)").bind(f.caseId).all()).results).toEqual([{ proof_id: null }]);
    expect((await env.DB.prepare("SELECT status FROM maintenance_task WHERE privacy_request_id=?").bind(p.id).all()).results.every(t => t.status === "completed")).toBe(true);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("retains bytes after R2 failure and retries only settled exact grants, then confirms physical absence", async () => {
    const f = await publishedFixture();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    let calls = 0;
    const failing = new Proxy(env.PROOFS, { get(bucket, property) { if (property === "delete") return async () => { calls++; throw new Error("synthetic settled R2 failure"); }; const value = Reflect.get(bucket, property); return typeof value === "function" ? value.bind(bucket) : value; } });
    await executePrivacyRequest(db, { DB: env.DB, PROOFS: failing }, p.admin, p.id);
    expect(calls).toBe(1);
    const tracked = await env.DB.prepare("SELECT status,purge_inflight,object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>();
    expect(tracked).toMatchObject({ status: "pending_purge", purge_inflight: 0 });
    expect(await env.PROOFS.head(tracked!.object_key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=? AND status='blocked'").bind(p.id).first()).not.toBeNull();
    await runMaintenance(env);
    await runMaintenance(env);
    expect(await env.PROOFS.head(tracked!.object_key)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("cannot claim held proof or erase it through another exact target", async () => {
    const f = await publishedFixture(), admin = await addActor("admin");
    expect(await placeRetentionHold(db, admin, { targetType: "proof", targetId: f.proofId, kind: "legal", reason: "Finite synthetic evidence purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId)]);
    await executePrivacyRequest(db, env, p.admin, p.id);
    expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=?").bind(p.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(f.proofId).first()).toEqual({ status: "attached" });
  });
  it("executes unchanged deferred assessment after hold release without rewriting its closed receipt", async () => {
    const f = await publishedFixture();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    expect(await placeRetentionHold(db, p.admin, { targetType: "log", targetId: f.logId, kind: "legal", reason: "Synthetic finite purpose", reviewDueAt: iso(3600000), expiresAt: iso(86400000) })).toEqual({ ok: true });
    expect(await recordPrivacyOutcome(db, p.admin, p.id, "deferred", "Held exact objects await finite review", iso(86400000))).toEqual({ ok: true });
    const receipt = await env.DB.prepare("SELECT * FROM privacy_request WHERE id=?").bind(p.id).first();
    const h = await env.DB.prepare("SELECT id FROM retention_hold WHERE target_id=?").bind(f.logId).first<{ id: string }>();
    expect(await releaseRetentionHold(db, p.admin, h!.id)).toEqual({ ok: true });
    expect((await executePrivacyRequest(db, env, p.admin, p.id)).ok).toBe(true);
    expect(await env.DB.prepare("SELECT * FROM privacy_request WHERE id=?").bind(p.id).first()).toEqual(receipt);
    expect(await env.DB.prepare("SELECT 1 FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM maintenance_task WHERE privacy_request_id=?").bind(p.id).all()).results.every(t => t.status === "completed")).toBe(true);
  });
  it("retries confirmed-absent R2 bytes after the later D1 dependency batch fails", async () => {
    const f = await publishedFixture();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    let deleted = false, failed = false;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "delete") return async (key: string) => { await target.delete(key); deleted = true; };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const database = new Proxy(env.DB, { get(target, property) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        if (deleted && !failed) { failed = true; throw new Error("Synthetic settled dependency batch failure"); }
        return target.batch(statements);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await executePrivacyRequest(createDb(database), { DB: database, PROOFS: bucket }, p.admin, p.id);
    expect(failed).toBe(true);
    const tracked = await env.DB.prepare("SELECT status,purge_inflight,object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>();
    expect(tracked).toMatchObject({ status: "purged", purge_inflight: 0 });
    expect(await env.PROOFS.head(tracked!.object_key)).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE target_type='proof_file' AND target_id=?").bind(f.proofId).first()).toEqual({ status: "blocked" });
    await runMaintenance(env); await runMaintenance(env);
    expect(await env.DB.prepare("SELECT 1 FROM proof_file WHERE id=?").bind(f.proofId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE target_type='proof_file' AND target_id=?").bind(f.proofId).first()).toEqual({ status: "completed" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("leaves durable backlog while enforcing the 25-claim invocation budget", async () => {
    const subject = await addActor("client");
    for (let i = 0; i < 30; i++) await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy',?,'2020-01-01T00:00:00.000Z')").bind(crypto.randomUUID(), subject, `synthetic-old-${i}`).run();
    const first = await runMaintenance(env);
    expect(first.claimed).toBe(25); expect(first.completed, JSON.stringify(first)).toBe(25); expect(first.r2Deletes).toBeLessThanOrEqual(25);
    expect(first.remaining).toBeGreaterThanOrEqual(5);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM policy_acceptance WHERE user_id=? AND retired_at IS NOT NULL").bind(subject).first())?.n).toBe(5);
    await runMaintenance(env);
    expect(await env.DB.prepare("SELECT 1 FROM policy_acceptance WHERE user_id=? AND retired_at IS NOT NULL").bind(subject).first()).toBeNull();
  });
  it("denies R2 deletion after processor revocation during HEAD and releases only its settled fence", async () => {
    const f = await publishedFixture();
    const p = await assessed(f.freelancerId, [purge("proof_file", f.proofId), purge("log_revision", f.revisionId), purge("engagement_log", f.logId)]);
    let revoked = false, deletes = 0;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "head") return async (key: string) => {
        const object = await target.head(key);
        if (!revoked) { revoked = true; await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(p.admin).run(); }
        return object;
      };
      if (property === "delete") return async (key: string) => { deletes++; await target.delete(key); };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await executePrivacyRequest(db, { DB: env.DB, PROOFS: bucket }, p.admin, p.id);
    expect(revoked).toBe(true); expect(deletes).toBe(0);
    const proof = await env.DB.prepare("SELECT status,purge_inflight,object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>();
    expect(proof).toMatchObject({ status: "pending_purge", purge_inflight: 0 });
    expect(await env.PROOFS.head(proof!.object_key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE privacy_request_id=? AND target_type='proof_file'").bind(p.id).first()).toEqual({ status: "blocked" });
    await env.DB.prepare("UPDATE user SET banned=0 WHERE id=?").bind(p.admin).run();
    await runMaintenance(env);
    expect(await env.PROOFS.head(proof!.object_key)).toBeNull();
  });
  it("intersects export lifetime with actual included-source expiry and refuses private artifact replay", async () => {
    const f = await publishedFixture();
    const retired = new Date(Date.now() + 60000); retired.setUTCFullYear(retired.getUTCFullYear() - 1);
    const policyId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version,retired_at) VALUES(?,?,'privacy','synthetic-retired',?)").bind(policyId, f.freelancerId, retired.toISOString()).run();
    const p = await assessed(f.freelancerId, [], true), d = await prepareExport(db, env.PROOFS, p.admin, p.id);
    expect(d.expiresAt).toBe(addTwelveMonthsUtc(retired));
    expect(Date.parse(d.expiresAt) - Date.now()).toBeLessThanOrEqual(60000);
    expect((await deliverExport(db, env.PROOFS, d.deliveryId, d.token, f.freelancerId)).status).toBe(200);
    expect(await env.PROOFS.head(`exports/${d.deliveryId}`)).toBeNull();
  });
});
