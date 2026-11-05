import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { claimLogReview, decideLogReview, releaseLogReview } from "@/features/moderation/log-handlers";
import { loadLogReviewQueue } from "@/server/db/queries/reviews";
import { saveLogDraft } from "@/features/logs/draft";
import { submitLog } from "@/features/logs/submit";
import { addActor, addProof, intakeFixture } from "./private-intake-fixtures";
import { fixtureClock, pendingFixture, publication, reviewInput, reviewSecret } from "./f04-log-review-fixtures";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { POLICY_VERSIONS } from "@/lib/policies";
import { downloadReviewProof } from "@/features/moderation/proof-view";
import { manilaDate, withinFilingWindow } from "@/features/logs/schema";
import { downloadProof } from "@/features/logs/proofs";
import { loadPrivateLog } from "@/server/db/queries/logs";

describe("actual log review and publication", () => {
  it("denies related private readers an idle draft at its canonical deadline before cleanup", async () => {
    const f = await intakeFixture(), proofId = await addProof(f), moderator = await addActor("moderator");
    await fixtureClock("pilot_log_update", env.DB.prepare("UPDATE engagement_log SET draft_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') WHERE id=?").bind(f.logId));
    const get = vi.spyOn(env.PROOFS, "get");
    try {
      for (const actor of [f.freelancerId, f.clientUserId, moderator]) {
        expect(await loadPrivateLog(f.db, actor, f.logId)).toBeNull();
        const response = await downloadProof(f.db, env.PROOFS, actor, proofId);
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toContain("no-store");
      }
      expect(get).not.toHaveBeenCalled();
    } finally { get.mockRestore(); }
    expect((await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(proofId).first())!.status).toBe("uploading");
  });
  it("denies rejected initial content after its own deadline while retained bytes await cleanup", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "reject" }, reviewSecret)).toMatchObject({ ok: true });
    await fixtureClock("revision_update", env.DB.prepare("UPDATE log_revision SET decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') WHERE id=?").bind(input.revisionId));
    for (const actor of [f.freelancerId, f.clientUserId, f.moderatorId]) {
      expect(await loadPrivateLog(f.db, actor, f.logId)).toBeNull();
      expect((await downloadProof(f.db, env.PROOFS, actor, f.proofId)).status).toBe(404);
    }
    expect(await env.PROOFS.head((await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>())!.object_key)).toBeTruthy();
  });
  it.each(["approve", "ask_changes", "reject"] as const)("records %s with immutable exact-byte human receipts", async decision => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision }, reviewSecret)).toMatchObject({ ok: true });
    const log = await publication(f.logId);
    expect(log?.status).toBe(decision === "approve" ? "published" : decision === "ask_changes" ? "ask_changes" : "rejected");
    const c = await env.DB.prepare("SELECT status,closed_at,decision FROM moderation_case WHERE id=?").bind(f.caseId).first();
    expect(c).toMatchObject({ status: decision === "ask_changes" ? "awaiting_changes" : "decided", decision: decision === "ask_changes" ? null : decision });
    expect(c!.closed_at === null).toBe(decision === "ask_changes");
    const rr = await env.DB.prepare("SELECT id,decided_at FROM review_round WHERE case_id=?").bind(f.caseId).first<{ id: string; decided_at: string }>();
    expect((await env.DB.prepare("SELECT proof_id,proof_sha256,verdict FROM proof_review WHERE round_id=?").bind(rr!.id).all()).results).toEqual([{ proof_id: f.proofId, proof_sha256: input.proofVerdicts[0].sha256, verdict: "accepted" }]);
    await expect(env.DB.prepare("UPDATE review_round SET reason='changed' WHERE id=?").bind(rr!.id).run()).rejects.toThrow();
    if (decision === "approve") { expect(log!.current_revision_id).toBe(input.revisionId); expect(log!.expires_at).toBe(addTwelveMonthsUtc(log!.published_at)); }
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision }, reviewSecret)).toMatchObject({ ok: false });
  });
  it("preserves original submitted revision, anchor and first filing through ask-changes", async () => {
    const f = await pendingFixture();
    const anchorDate = manilaDate(new Date(Date.now() - 20 * 86400000));
    const firstSubmittedAt = new Date(Date.now() - 19 * 86400000).toISOString();
    const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_log_update'").first<{ sql: string }>();
    if (!guard) throw new Error("Original clock guard missing");
    // Advance the fixture's elapsed time after a real complete submission; all
    // original-clock guards are restored before review and resubmission actions.
    await expect(env.DB.prepare("UPDATE engagement_log SET anchor_date=?,first_submitted_at=? WHERE id=?").bind(anchorDate, firstSubmittedAt, f.logId).run()).rejects.toThrow();
    await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
    try { await env.DB.prepare("UPDATE engagement_log SET anchor_date=?,first_submitted_at=? WHERE id=?").bind(anchorDate, firstSubmittedAt, f.logId).run(); }
    finally { await env.DB.prepare(guard.sql).run(); }
    expect(withinFilingWindow(anchorDate)).toBe(false);
    const before = await publication(f.logId), input = await reviewInput(f, f.moderatorId, f.caseId);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "ask_changes" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, anchorDate, logId: f.logId, rating: 3 })).toMatchObject({ ok: true });
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
    const next = await reviewInput(f, f.moderatorId, f.caseId);
    expect(next.revisionId).not.toBe(input.revisionId);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...next, decision: "approve" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await publication(f.logId)).toMatchObject({ anchor_date: before!.anchor_date, first_submitted_at: before!.first_submitted_at });
    expect((await env.DB.prepare("SELECT rev_no,rating,decision FROM log_revision WHERE log_id=? ORDER BY rev_no").bind(f.logId).all()).results).toEqual([{ rev_no: 1, rating: 4, decision: "ask_changes" }, { rev_no: 2, rating: 3, decision: "approve" }]);
    expect((await env.DB.prepare("SELECT round_no FROM review_round WHERE case_id=? ORDER BY round_no").bind(f.caseId).all()).results).toEqual([{ round_no: 1 }, { round_no: 2 }]);
  });
  it.each(["receipt", "lease", "proof", "policy", "role", "ban", "revision"])("rolls back %s conflicts without rounds, publication or decision audit", async kind => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    if (kind === "receipt") input.proofVerdicts[0].viewToken += "tampered";
    if (kind === "lease") input.expectedClaimUntil = new Date(Date.now() + 3600000).toISOString();
    if (kind === "proof") await env.PROOFS.delete((await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(f.proofId).first<{ object_key: string }>())!.object_key);
    if (kind === "role") await env.DB.prepare("UPDATE user SET role='admin' WHERE id=?").bind(f.moderatorId).run();
    if (kind === "ban") await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.moderatorId).run();
    if (kind === "revision") input.expectedCurrentRevisionId = crypto.randomUUID();
    const originalPolicy = POLICY_VERSIONS.terms;
    try {
      // Simulate a notice-version deployment, preserving immutable acceptance evidence.
      if (kind === "policy") Object.defineProperty(POLICY_VERSIONS, "terms", { value: "2099-01-01", configurable: true, writable: true });
      expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false });
    } finally { Object.defineProperty(POLICY_VERSIONS, "terms", { value: originalPolicy, configurable: true, writable: true }); }
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
    expect(await publication(f.logId)).toMatchObject({ status: "pending", current_revision_id: null });
  });
  it("checks stale actor after R2 awaits, admits one decision winner and rolls back injected audit failure", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    const head = env.PROOFS.head.bind(env.PROOFS);
    const spy = vi.spyOn(env.PROOFS, "head").mockImplementation(async key => { await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.moderatorId).run(); return head(key); });
    try { expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false }); } finally { spy.mockRestore(); }
    await env.DB.prepare("UPDATE user SET banned=0 WHERE id=?").bind(f.moderatorId).run();
    const trigger = `fail_review_${crypto.randomUUID().replaceAll("-", "")}`;
    await env.DB.prepare(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_event WHEN NEW.action='review_decided' AND NEW.moderation_case_id='${f.caseId}' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`).run();
    try { expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false }); } finally { await env.DB.prepare(`DROP TRIGGER ${trigger}`).run(); }
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
    const results = await Promise.all([1, 2].map(() => decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)));
    expect(results.filter(r => r.ok)).toHaveLength(1);
  });
  it("requires an unconflicted actual moderator and CAS release, with oldest-first queue", async () => {
    const f = await pendingFixture(), g = await pendingFixture(), admin = await addActor("admin");
    expect(await claimLogReview(f.db, admin, { caseId: f.caseId })).toMatchObject({ ok: false });
    expect(await claimLogReview(f.db, f.freelancerId, { caseId: f.caseId })).toMatchObject({ ok: false });
    const queue = await loadLogReviewQueue(f.db, f.moderatorId);
    expect(queue.findIndex(c => c.id === f.caseId)).toBeLessThan(queue.findIndex(c => c.id === g.caseId));
    const input = await reviewInput(f, f.moderatorId, f.caseId);
    expect(await releaseLogReview(f.db, f.moderatorId, { caseId: f.caseId, expectedClaimUntil: input.expectedClaimUntil })).toMatchObject({ ok: true });
    expect(await releaseLogReview(f.db, f.moderatorId, { caseId: f.caseId, expectedClaimUntil: input.expectedClaimUntil })).toMatchObject({ ok: false });
  });
  it("rejects absent human retrieval, incomplete proof verdicts, unsupported approval and ID reasons", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    for (const bad of [
      { ...input, proofVerdicts: [] },
      { ...input, proofVerdicts: [{ ...input.proofVerdicts[0], viewToken: "unviewed" }] },
      { ...input, proofVerdicts: [{ ...input.proofVerdicts[0], verdict: "reject" }] },
      { ...input, reason: "The full government ID number is SSS 123-45-6789." },
    ]) expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...bad, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
  });
  it("rechecks the exact lease after proof HEAD and prevents using another reviewer's receipt", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId), replacement = await addActor("moderator");
    const head = env.PROOFS.head.bind(env.PROOFS), spy = vi.spyOn(env.PROOFS, "head").mockImplementation(async key => { await releaseLogReview(f.db, f.moderatorId, { caseId: f.caseId, expectedClaimUntil: input.expectedClaimUntil }); return head(key); });
    try { expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false }); } finally { spy.mockRestore(); }
    const next = await reviewInput(f, replacement, f.caseId);
    expect(await decideLogReview(f.db, env.PROOFS, replacement, { ...next, proofVerdicts: input.proofVerdicts, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false });
    expect(await decideLogReview(f.db, env.PROOFS, replacement, { ...next, decision: "approve" }, reviewSecret)).toMatchObject({ ok: true });
  });
  it("admits one concurrent claimant with a 30-minute lease and one claim audit", async () => {
    const f = await pendingFixture(), other = await addActor("moderator"), started = Date.now();
    const results = await Promise.all([f.moderatorId, other].map(actor => claimLogReview(f.db, actor, { caseId: f.caseId })));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    const winner = results.find(result => result.ok)!;
    if (!winner.ok) throw new Error("No claimant");
    expect(Date.parse(winner.data.claimUntil) - started).toBeGreaterThanOrEqual(29 * 60_000);
    expect(Date.parse(winner.data.claimUntil) - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect((await env.DB.prepare("SELECT id FROM audit_event WHERE action='moderation_claimed' AND moderation_case_id=?").bind(f.caseId).all()).results).toHaveLength(1);
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
  });
  it("rejects a newly accepted same-client relationship acquired during evidence inspection", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    await env.DB.prepare("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES(?,'Synthetic staff former freelancer','verified')").bind(f.moderatorId).run();
    const head = env.PROOFS.head.bind(env.PROOFS);
    const spy = vi.spyOn(env.PROOFS, "head").mockImplementation(async key => {
      const engagementId = crypto.randomUUID(), acceptanceId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,?,'Synthetic later engagement','Synthetic client','2026-10-01',?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))").bind(engagementId, f.moderatorId, crypto.randomUUID()),
        env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'client_consent',?)").bind(acceptanceId, f.clientUserId, POLICY_VERSIONS.client_consent),
        env.DB.prepare("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)").bind(engagementId, acceptanceId),
      ]);
      return head(key);
    });
    try { expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: false }); }
    finally { spy.mockRestore(); }
    expect((await env.DB.prepare("SELECT id FROM engagement WHERE freelancer_id=? AND client_id=? AND status='accepted'").bind(f.moderatorId, f.clientId).all()).results).toHaveLength(1);
    expect(await publication(f.logId)).toMatchObject({ status: "pending", current_revision_id: null, published_at: null, expires_at: null });
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM audit_event WHERE action='review_decided' AND moderation_case_id=?").bind(f.caseId).all()).results).toHaveLength(0);
  });
  it("does not issue a byte-view receipt after the claimant loses authorization during R2 GET", async () => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    const get = env.PROOFS.get.bind(env.PROOFS);
    const spy = vi.spyOn(env.PROOFS, "get").mockImplementation(async (...args) => {
      const object = await get(...args);
      await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.moderatorId).run();
      return object;
    });
    try {
      const response = await downloadReviewProof(f.db, env.PROOFS, f.moderatorId, f.proofId, { caseId: f.caseId, revisionId: input.revisionId, expectedClaimUntil: input.expectedClaimUntil }, reviewSecret);
      expect(response.status).toBe(404);
      expect(response.headers.get("X-FLAG-Proof-View")).toBeNull();
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(await response.text()).toBe("");
    } finally { spy.mockRestore(); }
  });
});
