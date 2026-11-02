import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uploadProof } from "@/features/logs/proofs";
import { uploadProposalProof } from "@/features/updates/proofs";
import { saveProposal } from "@/features/updates/handlers";
import { openCorrection } from "@/features/corrections/handlers";
import { assessPrivacyRequest, executePrivacyRequest, recordPrivacyRequest } from "@/features/privacy/handlers";
import { runMaintenance } from "@/features/lifecycle/maintenance";
import { addActor, intakeFixture, uploadRequest } from "./private-intake-fixtures";
import { publishedFixture } from "./f04-log-review-fixtures";
import { finiteSyntheticHold } from "./synthetic-retention-clock";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { manilaDate } from "@/features/logs/schema";
import type { Db } from "@/server/db";

const iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
async function assessProof(db: Db, subject: string, proofId: string) {
  const admin = await addActor("admin");
  const request = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!request.ok || !request.id) throw new Error("Synthetic request failed");
  expect(await assessPrivacyRequest(db, admin, request.id, {
    targets: [{ targetType: "proof_file", targetId: proofId, operation: "purge", dueAt: iso(-1000), basis: "assessed_erasure" }],
    identity: { method: "non_id_control", verifiedSubjectId: subject, verifiedAt: iso(-1000), evidenceReference: "synthetic-verified-control" },
    categories: [{ category: "proofs", disposition: "remove", basis: "Synthetic exact evidence erasure", until: iso(86400000) }], backups: "unverified",
  })).toEqual({ ok: true });
  return { admin, id: request.id };
}
async function targetFixture(kind: "initial" | "update" | "counterproof") {
  if (kind === "initial") {
    const f = await intakeFixture();
    return { ...f, actor: f.freelancerId, upload: (bucket: R2Bucket) => uploadProof(f.db, bucket, f.freelancerId, f.logId, uploadRequest()) };
  }
  const f = await publishedFixture();
  if (kind === "counterproof") {
    const opened = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "Synthetic new counterproof establishes a documented invoice correction." });
    if (!opened.ok) throw new Error("Synthetic correction failed");
    return { ...f, actor: f.clientUserId, upload: (bucket: R2Bucket) => uploadProposalProof(f.db, bucket, f.clientUserId, { requestId: opened.data.requestId }, uploadRequest()) };
  }
  // Only the clock setup changes an existing genuinely approved publication.
  const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE name='pilot_log_update'").first<{ sql: string }>();
  if (!guard) throw new Error("Publication guard missing");
  const past = iso(-3 * 86400000);
  await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
  try { await env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(past, addTwelveMonthsUtc(past), f.logId).run(); }
  finally { await env.DB.prepare(guard.sql).run(); }
  const saved = await saveProposal(f.db, f.freelancerId, { logId: f.logId, expectedCurrentRevisionId: f.revisionId, effectiveOn: manilaDate(), proofIds: [], fields: {
    rating: 3, tags: ["Late Payment"], facts: "The documented final invoice was paid after the agreed delivery and deadline.", periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: null,
  } });
  if (!saved.ok) throw new Error("Synthetic update failed");
  return { ...f, actor: f.freelancerId, upload: (bucket: R2Bucket) => uploadProposalProof(f.db, bucket, f.freelancerId, { revisionId: saved.data.revisionId }, uploadRequest()) };
}

describe("PRD-F12 proof writer ownership across assessed destruction", () => {
  it.each(["initial", "update", "counterproof"] as const)("keeps a paused %s PUT tracked until settlement, then completes exact assessed deletion", async kind => {
    const f = await targetFixture(kind);
    let key: string | undefined, requestId: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        key = args[0];
        const p = await env.DB.prepare("SELECT id,write_inflight FROM proof_file WHERE object_key=?").bind(key).first<{ id: string; write_inflight: number }>();
        expect(p?.write_inflight).toBe(1);
        const request = await assessProof(f.db, f.actor, p!.id); requestId = request.id;
        expect((await executePrivacyRequest(f.db, env, request.admin, request.id)).ok).toBe(true);
        expect(await env.DB.prepare("SELECT object_key,write_inflight FROM proof_file WHERE id=?").bind(p!.id).first()).toEqual({ object_key: key, write_inflight: 1 });
        expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=? AND status='completed'").bind(request.id).first()).toBeNull();
        await expect(env.DB.prepare("DELETE FROM proof_file WHERE id=?").bind(p!.id).run()).rejects.toThrow(/writer/);
        await expect(env.DB.prepare("UPDATE maintenance_task SET status='claimed',claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),attempts=attempts+1 WHERE privacy_request_id=? AND status='planned'").bind(request.id).run()).rejects.toThrow(/writer/);
        return target.put(...args);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect((await f.upload(bucket)).status).toBe(201);
    expect(await env.PROOFS.head(key!)).not.toBeNull();
    await runMaintenance(env);
    expect(await env.PROOFS.head(key!)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM proof_file WHERE object_key=?").bind(key).first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM maintenance_task WHERE privacy_request_id=?").bind(requestId).first()).toEqual({ status: "completed" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it.each(["initial", "update", "counterproof"] as const)("preserves a held %s late PUT and its exact tracking after settlement", async kind => {
    const f = await targetFixture(kind);
    let key: string | undefined;
    const bucket = new Proxy(env.PROOFS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        key = args[0];
        const p = await env.DB.prepare("SELECT id FROM proof_file WHERE object_key=?").bind(key).first<{ id: string }>();
        const request = await assessProof(f.db, f.actor, p!.id);
        await executePrivacyRequest(f.db, env, request.admin, request.id);
        await finiteSyntheticHold(p!.id, "proof");
        return target.put(...args);
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const response = await f.upload(bucket);
    expect([201, 503]).toContain(response.status);
    await runMaintenance(env);
    expect(await env.PROOFS.head(key!)).not.toBeNull();
    expect(await env.DB.prepare("SELECT write_inflight FROM proof_file WHERE object_key=?").bind(key).first()).toEqual({ write_inflight: 0 });
  });
});
