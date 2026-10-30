import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { downloadProof, removeDraftProof, signatureMime, uploadProof } from "@/features/logs/proofs";
import { submitLog } from "@/features/logs/submit";
import { manilaDate, MAX_PROOF_BYTES } from "@/features/logs/schema";
import { addActor, addProof, intakeFixture, pdfBytes, uploadRequest } from "./private-intake-fixtures";

describe("private proof real-D1/R2 transport", () => {
  it("streams authorized attachments with safe headers and no path-name persistence", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    const row = await env.DB.prepare("SELECT object_key,sha256,size_bytes FROM proof_file WHERE id=?").bind(id).first<{ object_key: string; sha256: string; size_bytes: number }>();
    expect(row!.object_key).toBe(`logs/${f.logId}/${id}`);
    expect(row!.object_key).not.toContain("unsafe");
    for (const actor of [f.freelancerId, f.clientUserId, await addActor("moderator")]) {
      const response = await downloadProof(f.db, env.PROOFS, actor, id);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="proof-${id}.pdf"`);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    }
  });
  it("denies anonymous, outsider and bare admin before any bucket get", async () => {
    const f = await intakeFixture(), id = await addProof(f);
    let reads = 0;
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "get") return async () => { reads++; throw new Error("must not read"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    for (const actor of [null, await addActor("admin"), await addActor("freelancer")]) expect((await downloadProof(f.db, bucket, actor, id)).status).toBe(404);
    expect(reads).toBe(0);
    expect((await uploadProof(f.db, env.PROOFS, f.clientUserId, f.logId, uploadRequest())).status).toBe(404);
    expect((await uploadProof(f.db, env.PROOFS, await addActor("admin"), f.logId, uploadRequest())).status).toBe(404);
  });
  it.each(["unknown", "duplicate_file", "duplicate_kind", "extra", "empty", "signature"])("rejects invalid upload %s without reservation", async mode => {
    const f = await intakeFixture();
    const form = new FormData();
    form.append("file", new File([mode === "empty" ? "" : mode === "signature" ? "MZ executable renamed to pdf" : pdfBytes], "proof.pdf"));
    form.append("kind", mode === "unknown" ? "government_id" : "invoice");
    if (mode === "duplicate_file") form.append("file", new File([pdfBytes], "proof2.pdf"));
    if (mode === "duplicate_kind") form.append("kind", "invoice");
    if (mode === "extra") form.append("object_key", "logs/other/proof");
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, new Request("https://flag.invalid", { method: "POST", body: form }))).status).toBe(400);
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).all()).results).toHaveLength(0);
  });
  it("rejects actual oversized network bodies despite a forged short Content-Length", async () => {
    const f = await intakeFixture();
    const request = new Request("https://flag.invalid", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=bounded", "content-length": "1" },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_PROOF_BYTES + 16385)); controller.close(); } }) });
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, request)).status).toBe(413);
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).all()).results).toHaveLength(0);
  });
  it("enforces the exact file-byte boundary and checks signatures independently of MIME", async () => {
    const f = await intakeFixture();
    const bytes = new Uint8Array(MAX_PROOF_BYTES); bytes.set(pdfBytes); bytes.set(new TextEncoder().encode("%%EOF"), bytes.length - 5);
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest(bytes))).status).toBe(201);
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest(new Uint8Array(MAX_PROOF_BYTES + 1)))).status).toBe(413);
    expect(signatureMime(new TextEncoder().encode("%PDF-1.7\ntruncated"))).toBeNull();
    expect(signatureMime(new Uint8Array([255, 216, 255]))).toBeNull();
  });
  it("reserves only the final fifth slot under parallel uploads", async () => {
    const f = await intakeFixture();
    for (let i = 0; i < 4; i++) await addProof(f);
    const results = await Promise.all([uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest()), uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=? AND status='uploading'").bind(f.logId).all()).results).toHaveLength(5);
  });
  it("enforces the final daily attempt atomically and removal never resets quota", async () => {
    const f = await intakeFixture(), key = `private-upload:${f.freelancerId}:${manilaDate()}`;
    await env.DB.prepare("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES(?,19,?)").bind(key, Date.now() + 86400000).run();
    const results = await Promise.all([uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest()), uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())]);
    expect(results.map(r => r.status).sort()).toEqual([201, 429]);
    const row = await env.DB.prepare("SELECT id FROM proof_file WHERE log_id=?").bind(f.logId).first<{ id: string }>();
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, row!.id)).toMatchObject({ ok: true });
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())).status).toBe(429);
    expect((await env.DB.prepare("SELECT count FROM auth_rate_limit WHERE key=?").bind(key).first())?.count).toBe(20);
  });
  it("compensates a put that writes then fails and permits a replacement", async () => {
    const f = await intakeFixture();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => { await target.put(...args); throw new Error("synthetic response loss"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    const row = await env.DB.prepare("SELECT status,object_key FROM proof_file WHERE log_id=?").bind(f.logId).first<{ status: string; object_key: string }>();
    expect(row!.status).toBe("purged"); expect(await env.PROOFS.head(row!.object_key)).toBeNull();
    await addProof(f);
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
  });
  it("retains tracked metadata when object deletion fails and bounded cleanup retries it", async () => {
    const f = await intakeFixture();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => { await target.put(...args); throw new Error("synthetic put failure"); };
      if (key === "delete") return async () => { throw new Error("synthetic deletion failure"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest())).status).toBe(503);
    const failed = await env.DB.prepare("SELECT id,status FROM proof_file WHERE log_id=?").bind(f.logId).first<{ id: string; status: string }>();
    expect(failed!.status).toBe("pending_purge");
    // Retrying this SAME draft invokes bounded cleanup before the editable gate.
    await addProof(f);
    expect((await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(failed!.id).first())?.status).toBe("purged");
  });
  it("does not compensate away an upload concurrently attached by successful submission", async () => {
    const f = await intakeFixture();
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        const object = await target.put(...args);
        expect(await submitLog(f.db, target, f.freelancerId, f.logId)).toMatchObject({ ok: true });
        return object;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const response = await uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest());
    expect(response.status).toBe(201);
    const row = await env.DB.prepare("SELECT status,object_key FROM proof_file WHERE log_id=?").bind(f.logId).first<{ status: string; object_key: string }>();
    expect(row!.status).toBe("attached"); expect(await env.PROOFS.head(row!.object_key)).not.toBeNull();
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())).status).toBe(409);
  });
  it("aborts submission when a checked proof is removed before its atomic bind", async () => {
    const f = await intakeFixture(), proofId = await addProof(f);
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "head") return async (objectKey: string) => {
        const head = await target.head(objectKey);
        expect(await removeDraftProof(f.db, target, f.freelancerId, proofId)).toMatchObject({ ok: true });
        return head;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await submitLog(f.db, bucket, f.freelancerId, f.logId)).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE subject_id=?").bind(f.logId).all()).results).toHaveLength(0);
    expect((await downloadProof(f.db, env.PROOFS, f.clientUserId, proofId)).status).toBe(404);
  });
});
