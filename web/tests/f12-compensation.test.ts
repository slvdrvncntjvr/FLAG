import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { removeDraftProof, uploadProof } from "@/features/logs/proofs";
import { purgeClaimedProof, settleProofWrite } from "@/features/logs/proof-storage";
import { runPrivateIntakeCleanup } from "@/features/logs/cleanup";
import { addProof, intakeFixture, uploadRequest } from "./private-intake-fixtures";
import { finiteSyntheticHold } from "./synthetic-retention-clock";

describe("PRD-F12 settled compensation and finite hold fencing", () => {
  it("cannot reacquire a settled writer or settle a different immutable key", async () => {
    const f = await intakeFixture(), id = await addProof(f), key = `logs/${f.logId}/${id}`;
    await expect(settleProofWrite(f.db, id, key)).rejects.toThrow("proof_writer_settlement_lost");
    await expect(settleProofWrite(f.db, id, `logs/${f.logId}/different-proof`)).rejects.toThrow("proof_writer_settlement_lost");
    await expect(env.DB.prepare("UPDATE proof_file SET write_inflight=1 WHERE id=?").bind(id).run()).rejects.toThrow(/writer/);
    expect(await env.DB.prepare("SELECT write_inflight,object_key,status FROM proof_file WHERE id=?").bind(id).first()).toEqual({ write_inflight: 0, object_key: key, status: "uploading" });
    expect(await env.PROOFS.head(key)).not.toBeNull();
  });
  it.each(["log", "proof", "revision"] as const)("fences a new exact %s hold during ordinary compensation HEAD, then permits a finite hold after settlement", async type => {
    const f = await intakeFixture(), id = await addProof(f);
    const revision = await env.DB.prepare("SELECT id FROM log_revision WHERE log_id=?").bind(f.logId).first<{ id: string }>();
    if (type === "revision") await env.DB.prepare("UPDATE proof_file SET status='attached',revision_id=? WHERE id=?").bind(revision!.id, id).run();
    await env.DB.prepare("UPDATE proof_file SET status='pending_purge' WHERE id=?").bind(id).run();
    const targetId = type === "log" ? f.logId : type === "proof" ? id : revision!.id;
    let checked = false;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "head") return async (objectKey: string) => {
        const head = await target.head(objectKey);
        if (!checked) {
          checked = true;
          expect((await env.DB.prepare("SELECT purge_inflight FROM proof_file WHERE id=?").bind(id).first())?.purge_inflight).toBe(1);
          await expect(finiteSyntheticHold(targetId, type)).rejects.toThrow(/purge.*claimed/);
        }
        return head;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await purgeClaimedProof(f.db, bucket, id)).toBe(true);
    expect(checked).toBe(true);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
    await expect(finiteSyntheticHold(targetId, type)).resolves.toBeTypeOf("string");
  });

  it("retries a recent failed upload with real clocks and no extra permission for the same uploader", async () => {
    const f = await intakeFixture();
    const failing = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => { await target.put(...args); throw new Error("Synthetic settled put failure"); };
      if (key === "delete") return async () => { throw new Error("Synthetic settled delete failure"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, failing, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    const p = await env.DB.prepare("SELECT id,object_key,status,purge_inflight,uploaded_at FROM proof_file WHERE log_id=?").bind(f.logId).first<{ id: string; object_key: string; uploaded_at: string }>();
    expect(p).toMatchObject({ status: "pending_purge", purge_inflight: 0 });
    expect(Date.now() - Date.parse(p!.uploaded_at)).toBeLessThan(60000);
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())).status).toBe(201);
    expect(await env.PROOFS.head(p!.object_key)).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(p!.id).first())?.status).toBe("purged");
  });

  it("preserves a held recent failed removal while denying the revoked actor and retries only after release", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    const failing = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "delete") return async () => { throw new Error("Synthetic settled delete failure"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await removeDraftProof(f.db, failing, f.freelancerId, id)).toMatchObject({ ok: false });
    const holdId = await finiteSyntheticHold(id, "proof");
    await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())).status).toBe(409);
    await runPrivateIntakeCleanup(f.db, env.PROOFS);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).not.toBeNull();
    await env.DB.prepare("UPDATE retention_hold SET released_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(holdId).run();
    await runPrivateIntakeCleanup(f.db, env.PROOFS);
    expect(await env.PROOFS.head(`logs/${f.logId}/${id}`)).toBeNull();
    expect((await env.DB.prepare("SELECT purge_inflight,status FROM proof_file WHERE id=?").bind(id).first())).toEqual({ purge_inflight: 0, status: "purged" });
  });
});
