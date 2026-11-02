import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { POLICY_VERSIONS } from "@/lib/policies";
import { removeDraftProof, uploadProof } from "@/features/logs/proofs";
import { runPrivateIntakeCleanup } from "@/features/logs/cleanup";
import { submitLog } from "@/features/logs/submit";
import { addProof, intakeFixture, uploadRequest } from "./private-intake-fixtures";

import { ageSyntheticDrafts, finiteSyntheticHold } from "./synthetic-retention-clock";

type Fixture = Awaited<ReturnType<typeof intakeFixture>>;
const oldActivity = "2026-01-01T00:00:00.000Z";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function withClient(db: Db, client: D1Database): Db {
  return new Proxy(db, { get(target, key, receiver) { return key === "$client" ? client : Reflect.get(target, key, receiver); } });
}
// Pause AFTER the final successful read, leaving the actual mutation and R2 calls real.
function afterEditableRead(db: Db) {
  const reached = deferred(), resume = deferred();
  const client = new Proxy(env.DB, { get(target, key) {
    if (key === "prepare") return (sql: string) => {
      const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(stmt, method) {
        if (method === "bind") return (...args: Parameters<D1PreparedStatement["bind"]>) => wrap(stmt.bind(...args));
        if (method === "first") return async (...args: Parameters<D1PreparedStatement["first"]>) => {
          const result = await stmt.first(...args);
          if (sql.startsWith("SELECT 1 FROM engagement_log WHERE id=? AND freelancer_id=? AND status='draft'")) {
            expect(result).not.toBeNull();
            reached.resolve();
            await resume.promise;
          }
          return result;
        };
        const value = Reflect.get(stmt, method); return typeof value === "function" ? value.bind(stmt) : value;
      } });
      return wrap(target.prepare(sql));
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db: withClient(db, client), reached: reached.promise, resume: resume.resolve };
}
function storage() {
  const remove = vi.fn((key: string) => env.PROOFS.delete(key));
  const bucket = new Proxy(env.PROOFS, { get(target, key) {
    if (key === "delete") return remove;
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  return { bucket, remove };
}
async function activity(f: Fixture) {
  return (await env.DB.prepare("SELECT draft_updated_at FROM engagement_log WHERE id=?").bind(f.logId).first<{ draft_updated_at: string }>())?.draft_updated_at;
}
async function proofState(id: string) {
  return env.DB.prepare("SELECT status,purge_attempts,purge_inflight FROM proof_file WHERE id=?").bind(id).first();
}
async function ageActivity(f: Fixture) {
  await ageSyntheticDrafts([f.logId], oldActivity);
}

describe("atomic explicit proof removal", () => {
  it.each(["ban", "role", "verification", "privacy", "terms", "freelancer_ack"] as const)("denies revocation of %s after the final read without touching activity or R2", async kind => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const barrier = afterEditableRead(f.db), r2 = storage();
    const pending = removeDraftProof(barrier.db, r2.bucket, f.freelancerId, id);
    await barrier.reached;
    const policy = kind === "privacy" || kind === "terms" || kind === "freelancer_ack" ? kind : null;
    const previous = policy ? POLICY_VERSIONS[policy] : null;
    try {
      if (kind === "ban") await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
      if (kind === "role") await env.DB.prepare("UPDATE user SET role='client' WHERE id=?").bind(f.freelancerId).run();
      if (kind === "verification") await env.DB.prepare("UPDATE freelancer_profile SET status='suspended' WHERE user_id=?").bind(f.freelancerId).run();
      // A policy rollout invalidates old receipts; immutable acceptance history is preserved.
      if (policy) Reflect.set(POLICY_VERSIONS, policy, "2099-01-01");
      barrier.resume();
      expect.soft(await pending).toMatchObject({ ok: false });
      expect.soft(await activity(f)).toBe(oldActivity);
      expect.soft(await proofState(id)).toEqual({ status: "uploading", purge_attempts: 0, purge_inflight: 0 });
      expect.soft(r2.remove).not.toHaveBeenCalled();
      expect.soft(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
    } finally {
      if (policy) Reflect.set(POLICY_VERSIONS, policy, previous);
      barrier.resume();
      await pending;
    }
  });

  it("records authorized removal as activity and removes only its own proof", async () => {
    const f = await intakeFixture(), id = await addProof(f), kept = await addProof(f);
    await ageActivity(f);
    const before = await env.DB.prepare("SELECT * FROM proof_file WHERE id=?").bind(id).first();
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, id)).toMatchObject({ ok: true });
    expect(await activity(f)).not.toBe(oldActivity);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
    expect(await env.PROOFS.head(`logs/${f.logId}/${kept}`)).not.toBeNull();
    expect(await env.DB.prepare("SELECT * FROM proof_file WHERE id=?").bind(id).first()).toEqual({ ...before, status: "purged", purge_attempts: 1, purge_inflight: 0 });
    expect(await proofState(kept)).toEqual({ status: "uploading", purge_attempts: 0, purge_inflight: 0 });
  });

  it.each(["missing proof", "other filer", "client", "anonymous"])("rejects %s without activity or storage effects", async kind => {
    const f = await intakeFixture(), other = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const r2 = storage();
    const actor = kind === "other filer" ? other.freelancerId : kind === "client" ? f.clientUserId : kind === "anonymous" ? null : f.freelancerId;
    expect(await removeDraftProof(f.db, r2.bucket, actor, kind === "missing proof" ? crypto.randomUUID() : id)).toMatchObject({ ok: false });
    expect(await activity(f)).toBe(oldActivity);
    expect(r2.remove).not.toHaveBeenCalled();
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
  });

  it.each(["zero-row claim", "later SQL error"])("rolls back parent and proof on %s inside the real D1 batch", async mode => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    let injected = false;
    const client = new Proxy(env.DB, { get(target, key) {
      if (key === "batch") return (statements: D1PreparedStatement[]) => {
        expect(statements).toHaveLength(4);
        injected = true;
        // The first mutation must execute in either case, and the claim must
        // execute before the injected final error in the second case.
        const changed = [...statements];
        if (mode === "zero-row claim") changed[2] = target.prepare("UPDATE proof_file SET status=status WHERE id='synthetic-missing-proof'");
        else changed.push(target.prepare("SELECT json('synthetic-removal-rollback')"));
        return target.batch(changed);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const r2 = storage();
    expect(await removeDraftProof(withClient(f.db, client), r2.bucket, f.freelancerId, id)).toMatchObject({ ok: false });
    expect(injected).toBe(true);
    expect(await activity(f)).toBe(oldActivity);
    expect(await proofState(id)).toEqual({ status: "uploading", purge_attempts: 0, purge_inflight: 0 });
    expect(r2.remove).not.toHaveBeenCalled();
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
  });

  it.each(["hold", "submission"])("preserves evidence when %s wins after the final read", async winner => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const barrier = afterEditableRead(f.db), r2 = storage();
    const pending = removeDraftProof(barrier.db, r2.bucket, f.freelancerId, id);
    await barrier.reached;
    try {
      if (winner === "hold") await finiteSyntheticHold(f.logId);
      else expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
      const before = await activity(f), state = await proofState(id);
      barrier.resume();
      expect(await pending).toMatchObject({ ok: false });
      expect(await activity(f)).toBe(before);
      expect(await proofState(id)).toEqual(state);
      expect(r2.remove).not.toHaveBeenCalled();
      expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
    } finally { barrier.resume(); await pending; }
  });

  it("rolls back activity if the target proof state changes after its read", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const barrier = afterEditableRead(f.db), r2 = storage();
    const pending = removeDraftProof(barrier.db, r2.bucket, f.freelancerId, id);
    await barrier.reached;
    try {
      await env.DB.prepare("UPDATE proof_file SET status='abandoned' WHERE id=?").bind(id).run();
      barrier.resume();
      expect(await pending).toMatchObject({ ok: false });
      expect(await activity(f)).toBe(oldActivity);
      expect(await proofState(id)).toEqual({ status: "abandoned", purge_attempts: 0, purge_inflight: 0 });
      expect(r2.remove).not.toHaveBeenCalled();
    } finally { barrier.resume(); await pending; }
  });

  it("lets exactly one concurrent removal own deletion without a losing activity touch", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const first = afterEditableRead(f.db), second = afterEditableRead(f.db);
    const deleting = deferred(), settle = deferred();
    const r2 = storage();
    r2.remove.mockImplementation(async key => { deleting.resolve(); await settle.promise; await env.PROOFS.delete(key); });
    const a = removeDraftProof(first.db, r2.bucket, f.freelancerId, id);
    const b = removeDraftProof(second.db, r2.bucket, f.freelancerId, id);
    await Promise.all([first.reached, second.reached]);
    try {
      first.resume();
      await deleting.promise;
      const acceptedAt = await activity(f);
      expect(acceptedAt).not.toBe(oldActivity);
      second.resume();
      expect(await b).toMatchObject({ ok: false });
      expect(await activity(f)).toBe(acceptedAt);
      expect(await proofState(id)).toEqual({ status: "pending_purge", purge_attempts: 1, purge_inflight: 1 });
      expect(r2.remove).toHaveBeenCalledTimes(1);
    } finally { first.resume(); second.resume(); settle.resolve(); await Promise.all([a, b]); }
    expect(await a).toMatchObject({ ok: true });
  });

  it("rejects a submission paused at HEAD when removal claims its reservation first", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    const checked = deferred(), resume = deferred();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "head") return async (objectKey: string) => {
        const object = await target.head(objectKey);
        checked.resolve(); await resume.promise;
        return object;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const pending = submitLog(f.db, bucket, f.freelancerId, f.logId);
    await checked.promise;
    try {
      expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, id)).toMatchObject({ ok: true });
      const acceptedAt = await activity(f);
      resume.resolve();
      expect(await pending).toMatchObject({ ok: false });
      expect(await activity(f)).toBe(acceptedAt);
      expect(await env.DB.prepare("SELECT status,first_submitted_at FROM engagement_log WHERE id=?").bind(f.logId).first()).toEqual({ status: "draft", first_submitted_at: null });
      expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE subject_id=?").bind(f.logId).all()).results).toHaveLength(0);
      expect((await env.DB.prepare("SELECT id FROM audit_event WHERE subject_id=?").bind(f.logId).all()).results).toHaveLength(0);
    } finally { resume.resolve(); await pending; }
  });

  it("allows an already-authorized removal to finish after revocation while its claim freezes hold changes", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const claimed = deferred(), resume = deferred();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "head") return async (objectKey: string) => {
        claimed.resolve(); await resume.promise;
        return target.head(objectKey);
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const pending = removeDraftProof(f.db, bucket, f.freelancerId, id);
    await claimed.promise;
    try {
      expect(await proofState(id)).toEqual({ status: "pending_purge", purge_attempts: 1, purge_inflight: 1 });
      const acceptedAt = await activity(f);
      expect(acceptedAt).not.toBe(oldActivity);
      await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
      await expect(finiteSyntheticHold(f.logId)).rejects.toThrow(/purge.*claimed/);
      resume.resolve();
      expect(await pending).toMatchObject({ ok: true });
      expect(await activity(f)).toBe(acceptedAt);
      expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
    } finally { resume.resolve(); await pending; }
  });

  it("retains accepted activity on delete failure and retries after revocation without extending retention", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const r2 = storage();
    r2.remove.mockRejectedValue(new Error("synthetic delete unavailable"));
    expect(await removeDraftProof(f.db, r2.bucket, f.freelancerId, id)).toMatchObject({ ok: false });
    const acceptedAt = await activity(f);
    expect(acceptedAt).not.toBe(oldActivity);
    expect(await proofState(id)).toEqual({ status: "pending_purge", purge_attempts: 1, purge_inflight: 0 });
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
    await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
    // Internal retry succeeds even though explicit actions are no longer authorized.
    await runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    expect(await proofState(id)).toEqual({ status: "purged", purge_attempts: 2, purge_inflight: 0 });
    expect(await activity(f)).toBe(acceptedAt);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
  });

  it("compensates a failed put after actor revocation without recording automatic activity", async () => {
    const f = await intakeFixture();
    let reservedAt: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        await target.put(...args);
        reservedAt = await activity(f);
        await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
        throw new Error("synthetic put completed but response failed");
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    expect(await activity(f)).toBe(reservedAt);
    const row = (await env.DB.prepare("SELECT id,object_key,status FROM proof_file WHERE log_id=?").bind(f.logId).first<{ id: string; object_key: string; status: string }>())!;
    expect(row.status).toBe("purged");
    expect(await env.PROOFS.head(row.object_key)).toBeNull();
  });

  it("preserves an unproven crashed purge owner and its accepted activity during later cleanup", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    const client = new Proxy(env.DB, { get(target, key) {
      if (key === "prepare") return (sql: string) => {
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(stmt, method) {
          if (method === "bind") return (...args: Parameters<D1PreparedStatement["bind"]>) => wrap(stmt.bind(...args));
          if (method === "first" && sql.startsWith("UPDATE proof_file SET purge_attempts=")) return async () => {
            await stmt.first(); // Persist ownership, then lose the invocation's result.
            throw new Error("synthetic owner crashed after D1 commit");
          };
          const value = Reflect.get(stmt, method); return typeof value === "function" ? value.bind(stmt) : value;
        } });
        return wrap(target.prepare(sql));
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const r2 = storage();
    expect(await removeDraftProof(withClient(f.db, client), r2.bucket, f.freelancerId, id)).toMatchObject({ ok: false });
    const acceptedAt = await activity(f);
    expect(acceptedAt).not.toBe(oldActivity);
    await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
    await runPrivateIntakeCleanup(f.db, r2.bucket, { limit: 25 });
    expect(await activity(f)).toBe(acceptedAt);
    expect(await proofState(id)).toEqual({ status: "pending_purge", purge_attempts: 1, purge_inflight: 1 });
    expect(r2.remove).not.toHaveBeenCalled();
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
  });

  it("retains a recently touched draft until 30 days after explicit removal", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    await ageActivity(f);
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, id)).toMatchObject({ ok: true });
    const acceptedAt = (await activity(f))!;
    // Move the synthetic activity against the real SQL clock, with all guards
    // restored before cleanup. No production clock/authorization is bypassed.
    async function cleanupAt(days: number) {
      if (days >= 30) await ageSyntheticDrafts([f.logId], new Date(Date.now() - days * 86400000).toISOString());
      return runPrivateIntakeCleanup(f.db, env.PROOFS, { limit: 25 });
    }
    await cleanupAt(1);
    expect(await activity(f)).toBe(acceptedAt);
    await cleanupAt(29.999);
    expect(await activity(f)).toBe(acceptedAt);
    expect(await proofState(id)).not.toBeNull();
    await cleanupAt(30);
    expect(await activity(f)).toBeUndefined();
    expect(await proofState(id)).toBeNull();
  });
});
