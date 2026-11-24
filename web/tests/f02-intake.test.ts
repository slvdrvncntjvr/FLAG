import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { saveLogDraft } from "@/features/logs/draft";
import { submitLog } from "@/features/logs/submit";
import { loadLogForEngagement, loadOwnPrivateLogLinks, loadPrivateLog } from "@/server/db/queries/logs";
import { addActor, addProof, intakeFixture } from "./private-intake-fixtures";
import { seedLog } from "./helpers";
import { POLICY_VERSIONS } from "@/lib/policies";

async function extraEngagement(f: Awaited<ReturnType<typeof intakeFixture>>, sameClient: boolean) {
  const id = crypto.randomUUID(), clientUser = sameClient ? f.clientUserId : crypto.randomUUID();
  if (!sameClient) {
    await env.DB.prepare("INSERT INTO user(id,name,email,role) VALUES(?,'Synthetic client',?,'client')").bind(clientUser, `${clientUser}@example.invalid`).run();
    await env.DB.prepare("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES(?,?,'Synthetic client','individual')").bind(crypto.randomUUID(), clientUser).run();
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,?,'Additional project','Synthetic client','2026-10-01',?,?)").bind(id, f.freelancerId, `hash-${id}`, new Date(Date.now() + 86400000).toISOString()),
    env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'client_consent',?)").bind(`consent-${id}`, clientUser, POLICY_VERSIONS.client_consent),
    env.DB.prepare("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)").bind(id, `consent-${id}`),
  ]);
  const input = { ...f.input, engagementId: id };
  const saved = await saveLogDraft(f.db, f.freelancerId, input);
  if (!saved.ok) throw new Error("Additional synthetic draft failed");
  return { ...f, engagementId: id, input, ...saved.data };
}

describe("private log real-D1 intake", () => {
  it("persists, edits and submits one complete private initial revision atomically", async () => {
    const f = await intakeFixture();
    const edited = await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, rating: 2, amountCentavos: 50000 });
    expect(edited).toMatchObject({ ok: true, data: { logId: f.logId, ref: f.ref } });
    const detail = await loadPrivateLog(f.db, f.freelancerId, f.logId);
    expect(detail).toMatchObject({ rating: 2, outcome: "negative", amountCentavos: 50000, status: "draft", canEdit: true });
    expect((await loadLogForEngagement(f.db, f.freelancerId, f.engagementId))?.log?.id).toBe(f.logId);
    expect(await loadOwnPrivateLogLinks(f.db, f.clientUserId)).toContainEqual({ id: f.logId, engagementId: f.engagementId });
    await addProof(f);
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
    const log = await env.DB.prepare("SELECT status,first_submitted_at,submitted_at,current_revision_id,published_at FROM engagement_log WHERE id=?").bind(f.logId).first();
    expect(log).toMatchObject({ status: "pending", current_revision_id: null, published_at: null });
    expect(log!.first_submitted_at).toBe(log!.submitted_at);
    expect((await env.DB.prepare("SELECT * FROM moderation_case WHERE subject_id=? AND kind='log'").bind(f.logId).all()).results).toHaveLength(1);
    expect((await env.DB.prepare("SELECT * FROM audit_event WHERE subject_id=? AND action='log_submitted'").bind(f.logId).all()).results).toHaveLength(1);
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false });
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, rating: 1 })).toMatchObject({ ok: false });
  });
  it("rejects no-proof submission, new duplicate log, anchor reset and cross-target edits without writes", async () => {
    const f = await intakeFixture(), other = await intakeFixture();
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false, error: "Attach at least one proof file" });
    expect(await saveLogDraft(f.db, f.freelancerId, f.input)).toMatchObject({ ok: false });
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, anchorKind: "terminated" })).toMatchObject({ ok: false });
    expect(await saveLogDraft(f.db, other.freelancerId, { ...f.input, logId: f.logId })).toMatchObject({ ok: false });
    expect(await saveLogDraft(f.db, f.freelancerId, { ...other.input, logId: f.logId })).toMatchObject({ ok: false });
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.rating).toBe(4);
    expect(await loadPrivateLog(f.db, other.freelancerId, f.logId)).toBeNull();
    expect(await loadPrivateLog(f.db, await addActor("admin"), f.logId)).toBeNull();
    expect((await loadPrivateLog(f.db, await addActor("moderator"), f.logId))?.id).toBe(f.logId);
  });
  it.each(["banned", "unverified", "wrong_role"])("rechecks %s inside domain writes", async kind => {
    const f = await intakeFixture();
    await addProof(f);
    if (kind === "banned") await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run();
    if (kind === "unverified") await env.DB.prepare("UPDATE freelancer_profile SET status='suspended' WHERE user_id=?").bind(f.freelancerId).run();
    if (kind === "wrong_role") await env.DB.prepare("UPDATE user SET role='client' WHERE id=?").bind(f.freelancerId).run();
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, rating: 1 })).toMatchObject({ ok: false });
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT status FROM engagement_log WHERE id=?").bind(f.logId).first())?.status).toBe("draft");
  });
  it("refuses legacy verified actors missing current policies even with historical acceptance", async () => {
    const f = await seedLog();
    for (const policy of ["privacy", "terms", "freelancer_ack"]) await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,'2020-01-01')").bind(crypto.randomUUID(), f.freelancerId, policy).run();
    expect(await loadLogForEngagement(f.db, f.freelancerId, f.engagementId)).toBeNull();
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false });
    expect(await saveLogDraft(f.db, f.freelancerId, {
      engagementId: f.engagementId, logId: f.logId, anchorKind: "completed", anchorDate: "2026-10-14", rating: 4,
      tags: ["Professional"], facts: "The agreed project was completed and all obligations were met.",
      periodStart: "2026-10-01", periodEnd: "2026-10-14",
    })).toMatchObject({ ok: false });
  });
  it("rolls back proof binding and case insertion if an audit write aborts", async () => {
    const f = await intakeFixture(); await addProof(f);
    const trigger = `fail_intake_${crypto.randomUUID().replaceAll("-", "")}`;
    await env.DB.prepare(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_event WHEN NEW.subject_id='${f.logId}' BEGIN SELECT RAISE(ABORT,'synthetic audit abort'); END`).run();
    try {
      expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false });
      expect((await env.DB.prepare("SELECT status,revision_id FROM proof_file WHERE log_id=?").bind(f.logId).first())).toEqual({ status: "uploading", revision_id: null });
      expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE subject_id=?").bind(f.logId).all()).results).toHaveLength(0);
    } finally { await env.DB.prepare(`DROP TRIGGER ${trigger}`).run(); }
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
  });
  it("serializes parallel submission and leaves one case, one audit and no publication", async () => {
    const f = await intakeFixture(); await addProof(f);
    const results = await Promise.all([submitLog(f.db, env.PROOFS, f.freelancerId, f.logId), submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE subject_id=?").bind(f.logId).all()).results).toHaveLength(1);
    await expect(env.DB.prepare("UPDATE engagement_log SET status='published' WHERE id=?").bind(f.logId).run()).rejects.toThrow();
    await expect(env.DB.prepare("UPDATE log_revision SET facts='Changed by raw SQL' WHERE log_id=?").bind(f.logId).run()).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM log_tag WHERE revision_id=(SELECT id FROM log_revision WHERE log_id=?)").bind(f.logId).run()).rejects.toThrow();
  });
  it("keeps reference allocation unique, increasing and rolls back rejected allocations", async () => {
    const f = await intakeFixture(), g = await intakeFixture();
    expect(Number(g.ref.slice(3))).toBeGreaterThan(Number(f.ref.slice(3)));
    const before = (await env.DB.prepare("SELECT count FROM auth_rate_limit WHERE key='log-reference-sequence'").first())?.count;
    expect(await saveLogDraft(f.db, f.freelancerId, f.input)).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT count FROM auth_rate_limit WHERE key='log-reference-sequence'").first())?.count).toBe(before);
  });
  it("allocates distinct monotonic references across simultaneous new drafts", async () => {
    const f = await intakeFixture();
    const created = await Promise.all([extraEngagement(f, false), extraEngagement(f, false), extraEngagement(f, false)]);
    expect(new Set(created.map(row => row.ref)).size).toBe(3);
    expect(created.every(row => Number(row.ref.slice(3)) > Number(f.ref.slice(3)))).toBe(true);
  });
  it.each(["pair", "weekly"])("serializes the last %s quota slot with complete rollback for the loser", async quota => {
    const f = await intakeFixture();
    const initial = quota === "pair" ? 2 : 9;
    for (let index = 0; index < initial; index++) {
      const next = index === 0 ? f : await extraEngagement(f, quota === "pair");
      await addProof(next);
      expect(await submitLog(next.db, env.PROOFS, next.freelancerId, next.logId)).toMatchObject({ ok: true });
    }
    const first = await extraEngagement(f, quota === "pair"), second = await extraEngagement(f, quota === "pair");
    await addProof(first); await addProof(second);
    const results = await Promise.all([submitLog(first.db, env.PROOFS, f.freelancerId, first.logId), submitLog(second.db, env.PROOFS, f.freelancerId, second.logId)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    const loser = results[0].ok ? second : first;
    expect((await env.DB.prepare("SELECT status,revision_id FROM proof_file WHERE log_id=?").bind(loser.logId).first())).toEqual({ status: "uploading", revision_id: null });
    expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE kind='log' AND subject_id=?").bind(loser.logId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM audit_event WHERE action='log_submitted' AND subject_id=?").bind(loser.logId).all()).results).toHaveLength(0);
  });
});
