import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { runPrivateIntakeCleanup } from "@/features/logs/cleanup";
import { removeDraftProof, uploadProof } from "@/features/logs/proofs";
import { saveLogDraft } from "@/features/logs/draft";
import { submitLog } from "@/features/logs/submit";
import { purgeClaimedProof } from "@/features/logs/proof-storage";
import { addProof, intakeFixture, pdfBytes, uploadRequest } from "./private-intake-fixtures";

async function agedProof(f: Awaited<ReturnType<typeof intakeFixture>>, tombstone = false, id = crypto.randomUUID()) {
  const key = `logs/${f.logId}/${id}`;
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare(`INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,status,uploaded_at)
    VALUES(?,?,'filer',?,?,'invoice','application/pdf',?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days'))`)
    .bind(id, f.logId, f.freelancerId, key, pdfBytes.length, checksum, tombstone ? "pending_purge" : "uploading").run();
  if (tombstone) await env.DB.prepare("UPDATE proof_file SET status='purged' WHERE id=?").bind(id).run();
  await env.PROOFS.put(key, pdfBytes, { sha256: checksum, httpMetadata: { contentType: "application/pdf" } });
  return id;
}

describe("bounded internal private-intake cleanup", () => {
  it("does not let an old finally release a newer purge owner", async () => {
    const f = await intakeFixture(), id = await agedProof(f);
    await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id=?").bind(id).run();
    let reacquired = false;
    function afterCompletion(statement: D1PreparedStatement): D1PreparedStatement {
      return new Proxy(statement, { get(target, key) {
        if (key === "bind") return (...values: Parameters<D1PreparedStatement["bind"]>) => afterCompletion(target.bind(...values));
        if (key === "run") return async () => {
          const result = await target.run();
          if (result.meta.changes === 1) {
            // A late-put compensator acquires the next generation immediately
            // after A finishes, before A's finally is allowed to resume.
            await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id=?").bind(id).run();
            await env.DB.prepare("UPDATE proof_file SET purge_attempts=purge_attempts+1,purge_inflight=1 WHERE id=?").bind(id).run();
            reacquired = true;
          }
          return result;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
    }
    const client = new Proxy(env.DB, { get(target, key) {
      if (key === "prepare") return (sql: string) => {
        const statement = target.prepare(sql);
        return sql.startsWith("UPDATE proof_file SET status='purged',purge_inflight=0") ? afterCompletion(statement) : statement;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const db = new Proxy(f.db, { get(target, key, receiver) { return key === "$client" ? client : Reflect.get(target, key, receiver); } });
    expect(await purgeClaimedProof(db, env.PROOFS, id)).toBe(true);
    expect(reacquired).toBe(true);
    expect(await env.DB.prepare("SELECT status,purge_attempts,purge_inflight FROM proof_file WHERE id=?").bind(id).first()).toEqual({ status: "pending_purge", purge_attempts: 2, purge_inflight: 1 });
  });

  it("keeps exclusive ownership until an overlapping late-put deletion settles", async () => {
    const f = await intakeFixture(), id = await agedProof(f);
    const key = `logs/${f.logId}/${id}`;
    const row = (await env.DB.prepare("SELECT sha256 FROM proof_file WHERE id=?").bind(id).first<{ sha256: string }>())!;
    await env.PROOFS.delete(key); // A reservation whose original put has not completed.
    await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id=?").bind(id).run();
    let deleteCalls = 0;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "delete") return async (objectKey: string) => {
        deleteCalls++;
        // A second caller cannot publish 'purged' while this caller can still delete.
        expect(await purgeClaimedProof(f.db, target, id)).toBe(false);
        expect(await env.DB.prepare("SELECT status,purge_inflight FROM proof_file WHERE id=?").bind(id).first()).toEqual({ status: "pending_purge", purge_inflight: 1 });
        await expect(env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.logId).run()).rejects.toThrow(/cleanup is in progress/);
        await target.put(objectKey, pdfBytes, { sha256: row.sha256, httpMetadata: { contentType: "application/pdf" } });
        await target.delete(objectKey);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await purgeClaimedProof(f.db, bucket, id)).toBe(true);
    expect(deleteCalls).toBe(1);
    expect(await env.DB.prepare("SELECT status,purge_inflight FROM proof_file WHERE id=?").bind(id).first()).toEqual({ status: "purged", purge_inflight: 0 });
    await env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.logId).run();
    // A still-later put is preserved under the hold; there is no stale second deleter.
    await env.PROOFS.put(key, pdfBytes, { sha256: row.sha256, httpMetadata: { contentType: "application/pdf" } });
    expect(await purgeClaimedProof(f.db, env.PROOFS, id)).toBe(false);
    expect(await env.PROOFS.head(key)).not.toBeNull();
  });

  it("skips an unproven in-flight owner while other cleanup progresses", async () => {
    const busy = await intakeFixture(), good = await intakeFixture();
    const busyId = await agedProof(busy), goodId = await agedProof(good);
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days') WHERE id IN (?,?)").bind(busy.logId, good.logId).run();
    await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id=?").bind(busyId).run();
    await env.DB.prepare("UPDATE proof_file SET purge_attempts=1,purge_inflight=1 WHERE id=?").bind(busyId).run();
    await runPrivateIntakeCleanup(good.db, env.PROOFS, { limit: 1 });
    expect(await env.PROOFS.head(`logs/${good.logId}/${goodId}`)).toBeNull();
    expect(await env.PROOFS.head(`logs/${busy.logId}/${busyId}`)).not.toBeNull();
    expect(await env.DB.prepare("SELECT status,purge_attempts,purge_inflight FROM proof_file WHERE id=?").bind(busyId).first()).toEqual({ status: "pending_purge", purge_attempts: 1, purge_inflight: 1 });
  });
  it.each(["mismatch", "head", "delete"])("rotates past a persistent %s failure with limit=1 and eventually retries it", async failure => {
    const bad = await intakeFixture(), good = await intakeFixture();
    const badId = await agedProof(bad, false, `a-${crypto.randomUUID()}`);
    const goodId = await agedProof(good, false, `z-${crypto.randomUUID()}`);
    const badKey = `logs/${bad.logId}/${badId}`, goodKey = `logs/${good.logId}/${goodId}`;
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days') WHERE id IN (?,?)").bind(bad.logId, good.logId).run();
    await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id IN (?,?)").bind(badId, goodId).run();
    if (failure === "mismatch") await env.PROOFS.put(badKey, "synthetic replacement", { httpMetadata: { contentType: "text/plain" } });
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "head" || key === "delete") return async (objectKey: string) => {
        if (objectKey === badKey && key === failure) throw new Error("synthetic storage failure");
        return key === "head" ? target.head(objectKey) : target.delete(objectKey);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    await runPrivateIntakeCleanup(bad.db, bucket, { limit: 1 });
    expect(await env.DB.prepare("SELECT status,purge_attempts FROM proof_file WHERE id=?").bind(badId).first()).toEqual({ status: "pending_purge", purge_attempts: 1 });
    expect(await env.PROOFS.head(goodKey)).not.toBeNull();
    await runPrivateIntakeCleanup(good.db, bucket, { limit: 1 });
    expect(await env.PROOFS.head(goodKey)).toBeNull();
    expect(await env.PROOFS.head(badKey)).not.toBeNull();
    const row = (await env.DB.prepare("SELECT sha256 FROM proof_file WHERE id=?").bind(badId).first<{ sha256: string }>())!;
    await env.PROOFS.put(badKey, pdfBytes, { sha256: row.sha256, httpMetadata: { contentType: "application/pdf" } });
    await runPrivateIntakeCleanup(bad.db, env.PROOFS, { limit: 1 });
    expect(await env.PROOFS.head(badKey)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(bad.logId).first()).toBeNull();
  });

  it("cleans idle proofs and drafts after timestamp-only hold release", async () => {
    const f = await intakeFixture(), id = await agedProof(f);
    const key = `logs/${f.logId}/${id}`;
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days'),hold_kind='legal',hold_placed_at='2026-10-01T00:00:00.000Z' WHERE id=?").bind(f.logId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(key)).not.toBeNull();
    await env.DB.prepare("UPDATE engagement_log SET hold_released_at=hold_placed_at WHERE id=?").bind(f.logId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(key)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
  });

  it("blocks reactivating a released hold after the purge claim and before R2 deletion", async () => {
    const f = await intakeFixture(), id = await agedProof(f);
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days'),hold_kind='legal',hold_placed_at='2026-10-01T00:00:00.000Z',hold_released_at='2026-10-02T00:00:00.000Z' WHERE id=?").bind(f.logId).run();
    let reactivationBlocked = false;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "delete") return async (objectKey: string) => {
        await expect(env.DB.prepare("UPDATE engagement_log SET hold_released_at=NULL WHERE id=?").bind(f.logId).run()).rejects.toThrow(/cleanup is in progress/);
        reactivationBlocked = true;
        return target.delete(objectKey);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    await runPrivateIntakeCleanup(f.db, bucket, { limit: 25 });
    expect(reactivationBlocked).toBe(true);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
  });
  it("preserves changed object identity and tracking until an exact-byte retry can purge", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    const row = (await env.DB.prepare("SELECT object_key,sha256 FROM proof_file WHERE id=?").bind(id).first<{ object_key: string; sha256: string }>())!;
    await env.PROOFS.put(row.object_key, "unexpected synthetic replacement", { httpMetadata: { contentType: "text/plain" } });
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, id)).toMatchObject({ ok: false });
    expect(await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(id).first()).toMatchObject({ status: "pending_purge" });
    expect(await env.PROOFS.head(row.object_key)).not.toBeNull();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(row.object_key)).not.toBeNull();
    await env.PROOFS.put(row.object_key, pdfBytes, { sha256: row.sha256, httpMetadata: { contentType: "application/pdf" } });
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(row.object_key)).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(id).first()).toMatchObject({ status: "purged" });
  });
  it("purges truly idle drafts with bytes, children and no untracked orphan", async () => {
    const f = await intakeFixture(), id = await agedProof(f);
    const objectKey = (await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(id).first<{ object_key: string }>())!.object_key;
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days') WHERE id=?").bind(f.logId).run();
    const result = await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(result.deletedObjects).toBeGreaterThanOrEqual(1);
    expect(await env.PROOFS.head(objectKey)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
    expect((await env.DB.prepare("SELECT id FROM log_revision WHERE log_id=?").bind(f.logId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).all()).results).toHaveLength(0);
  });
  it("preserves touched, held and submitted material regardless of age", async () => {
    const touched = await intakeFixture(), held = await intakeFixture(), pending = await intakeFixture();
    const t = await addProof(touched), h = await addProof(held), p = await addProof(pending);
    for (const f of [touched, held, pending]) await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days') WHERE id=?").bind(f.logId).run();
    expect(await saveLogDraft(touched.db, touched.freelancerId, { ...touched.input, logId: touched.logId })).toMatchObject({ ok: true });
    await env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(held.logId).run();
    expect(await submitLog(pending.db, env.PROOFS, pending.freelancerId, pending.logId)).toMatchObject({ ok: true });
    await runPrivateIntakeCleanup(touched.db, env.PROOFS, { limit: 25 });
    for (const id of [t, h, p]) {
      const row = await env.DB.prepare("SELECT status,object_key FROM proof_file WHERE id=?").bind(id).first<{ status: string; object_key: string }>();
      expect(row).not.toBeNull(); expect(await env.PROOFS.head(row!.object_key)).not.toBeNull();
    }
    expect(await removeDraftProof(held.db, env.PROOFS, held.freelancerId, h)).toMatchObject({ ok: false });
  });
  it("retains late-put tombstones and immediately reclaims exact bytes after a concurrent removal", async () => {
    const f = await intakeFixture();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        const row = await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=? AND status='uploading'").bind(f.logId).first<{ id: string }>();
        expect(await removeDraftProof(f.db, target, f.freelancerId, row!.id)).toMatchObject({ ok: true });
        return target.put(...args);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    const row = await env.DB.prepare("SELECT status,object_key FROM proof_file WHERE log_id=?").bind(f.logId).first<{ status: string; object_key: string }>();
    expect(row!.status).toBe("purged"); expect(await env.PROOFS.head(row!.object_key)).toBeNull();
    await addProof(f);
  });
  it("does not delete orphan-prefix objects unless older than30days and untracked/unheld", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    const orphanKey = `logs/${crypto.randomUUID()}/${crypto.randomUUID()}`;
    const parentKey = `logs/${f.logId}/${crypto.randomUUID()}`;
    await env.PROOFS.put(orphanKey, "synthetic orphan");
    await env.PROOFS.put(parentKey, "synthetic untracked parent object");
    const trackedKey = (await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(id).first<{ object_key: string }>())!.object_key;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "list") return async () => {
        const listed = await target.list({ prefix: "logs/", limit: 1000 });
        return { ...listed, truncated: false as const, objects: listed.objects.filter(o => [orphanKey, trackedKey, parentKey].includes(o.key)).map(o => ({ ...o, uploaded: new Date(Date.now() - 31 * 86400000) })) };
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { scanOrphans: true, limit: 25 });
    expect(await env.PROOFS.head(orphanKey)).not.toBeNull();
    await runPrivateIntakeCleanup(f.db, bucket, { scanOrphans: true, limit: 25 });
    expect(await env.PROOFS.head(orphanKey)).toBeNull(); expect(await env.PROOFS.head(trackedKey)).not.toBeNull();
    expect(await env.PROOFS.head(parentKey)).not.toBeNull();
  });
  it("claims a late-put tombstone before object deletion and blocks a competing new hold", async () => {
    const f = await intakeFixture();
    let observedStatus: string | undefined, holdBlocked = false;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        const row = await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=? AND status='uploading'").bind(f.logId).first<{ id: string }>();
        expect(await removeDraftProof(f.db, target, f.freelancerId, row!.id)).toMatchObject({ ok: true });
        return target.put(...args);
      };
      if (key === "delete") return async (objectKey: string) => {
        observedStatus = (await env.DB.prepare("SELECT status FROM proof_file WHERE object_key=?").bind(objectKey).first<{ status: string }>())?.status;
        try { await env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.logId).run(); }
        catch { holdBlocked = true; }
        // An unexpectedly successful hold never authorizes this fixture to erase the bytes.
        if (holdBlocked) await target.delete(objectKey);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    expect(observedStatus).toBe("pending_purge"); expect(holdBlocked).toBe(true);
  });
  it("preserves tracked late-put bytes when a hold wins before compensation claims them", async () => {
    const f = await intakeFixture();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        const row = await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=? AND status='uploading'").bind(f.logId).first<{ id: string }>();
        expect(await removeDraftProof(f.db, target, f.freelancerId, row!.id)).toMatchObject({ ok: true });
        await env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.logId).run();
        return target.put(...args);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    const row = await env.DB.prepare("SELECT status,object_key FROM proof_file WHERE log_id=?").bind(f.logId).first<{ status: string; object_key: string }>();
    expect(row!.status).toBe("purged");
    expect(await env.PROOFS.head(row!.object_key)).not.toBeNull();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(row!.object_key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).first()).not.toBeNull();
  });
  it("rechecks aged purged tombstone bytes before retirement, preserving them while held", async () => {
    const f = await intakeFixture(), id = await agedProof(f, true);
    const key = `logs/${f.logId}/${id}`;
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days'),hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.logId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM proof_file WHERE id=?").bind(id).first()).not.toBeNull();
    await env.DB.prepare("UPDATE engagement_log SET hold_kind=NULL WHERE id=?").bind(f.logId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await env.PROOFS.head(key)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
  });
  it("retires many aged failure tombstones in bounded progress before deleting their parent", async () => {
    const f = await intakeFixture();
    for (let i = 0; i < 12; i++) await agedProof(f, true);
    await env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days') WHERE id=?").bind(f.logId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 5 });
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).all()).results).toHaveLength(7);
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(f.logId).first()).not.toBeNull();
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 5 });
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 5 });
    expect(await env.DB.prepare("SELECT id FROM engagement_log WHERE id=?").bind(f.logId).first()).toBeNull();
  });
});
