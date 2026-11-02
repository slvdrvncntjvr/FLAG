import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { saveProposal, submitProposal } from "@/features/updates/handlers";
import { uploadProposalProof } from "@/features/updates/proofs";
import { decideCorrection, decideLogReview } from "@/features/moderation/log-handlers";
import { openCorrection, submitCorrection } from "@/features/corrections/handlers";
import { manilaDate } from "@/features/logs/schema";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { addActor, uploadRequest } from "./private-intake-fixtures";
import { correctionFields, fixtureClock, publishedFixture, publication, reviewInput, reviewSecret } from "./f04-log-review-fixtures";
import { downloadProof } from "@/features/logs/proofs";
import { downloadReviewProof } from "@/features/moderation/proof-view";
import { loadPrivateLog } from "@/server/db/queries/logs";

async function updateFixture() {
  const f = await publishedFixture();
  // The clock fixture alone backdates an already genuinely approved publication.
  // Restore the exact guard before exercising any proposal/review action.
  const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_log_update'").first<{ sql: string }>();
  if (!guard) throw new Error("Publication guard unavailable");
  const past = new Date(Date.now() - 3 * 86400000).toISOString();
  await expect(env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(past, addTwelveMonthsUtc(past), f.logId).run()).rejects.toThrow();
  await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
  try { await env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(past, addTwelveMonthsUtc(past), f.logId).run(); }
  finally { await env.DB.prepare(guard.sql).run(); }
  const fields = { rating: 2, tags: ["Late Payment"], facts: "The final agreed invoice remained unpaid after delivery and the documented reminder.", periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: 50000 };
  const input = { logId: f.logId, expectedCurrentRevisionId: f.revisionId, fields, effectiveOn: manilaDate(), proofIds: [f.proofId] };
  return { ...f, fields, proposal: input };
}
describe("actual immutable filer updates", () => {
  it("rechecks rejected proposal expiry after R2 and preserves shared active-publication evidence", async () => {
    const f = await updateFixture(), saved = await saveProposal(f.db, f.freelancerId, f.proposal);
    if (!saved.ok) throw new Error("Proposal failed");
    const uploaded = await uploadProposalProof(f.db, env.PROOFS, f.freelancerId, { revisionId: saved.data.revisionId }, uploadRequest(new TextEncoder().encode("%PDF-1.7\nPrivate synthetic later invoice for this proposed update.\n%%EOF")));
    expect(uploaded.status).toBe(201);
    const proofId = (await uploaded.json() as { data: { proofId: string } }).data.proofId;
    expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, saved.data.revisionId)).toMatchObject({ ok: true });
    const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE log_id=? AND kind='filer_update'").bind(f.logId).first<{ id: string }>();
    const input = await reviewInput(f, f.moderatorId, c!.id);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "reject" }, reviewSecret)).toMatchObject({ ok: true });
    const key = (await env.DB.prepare("SELECT object_key FROM proof_file WHERE id=?").bind(proofId).first<{ object_key: string }>())!.object_key;
    const get = env.PROOFS.get.bind(env.PROOFS), spy = vi.spyOn(env.PROOFS, "get").mockImplementation(async (...args) => {
      const object = await get(...args);
      if (args[0] === key) await fixtureClock("revision_update", env.DB.prepare("UPDATE log_revision SET decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') WHERE id=?").bind(saved.data.revisionId));
      return object;
    });
    try {
      expect((await downloadProof(f.db, env.PROOFS, f.freelancerId, proofId)).status).toBe(404);
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    for (const actor of [f.freelancerId, f.clientUserId, f.moderatorId]) {
      expect((await loadPrivateLog(f.db, actor, f.logId))?.revisionId).toBe(f.revisionId);
      expect((await downloadProof(f.db, env.PROOFS, actor, proofId)).status).toBe(404);
      expect((await downloadProof(f.db, env.PROOFS, actor, f.proofId)).status).toBe(200);
    }
    const reviewed = await downloadReviewProof(f.db, env.PROOFS, f.moderatorId, proofId, { caseId: c!.id, revisionId: saved.data.revisionId, expectedClaimUntil: input.expectedClaimUntil }, reviewSecret);
    expect(reviewed.status).toBe(404); expect(reviewed.headers.get("X-FLAG-Proof-View")).toBeNull();
    expect(await env.PROOFS.head(key)).toBeTruthy();
  });
  it.each(["approve", "ask_changes", "reject"] as const)("supports %s while keeping original clocks and frozen evidence origin", async decision => {
    const f = await updateFixture(), before = await publication(f.logId);
    const saved = await saveProposal(f.db, f.freelancerId, f.proposal);
    expect(saved).toMatchObject({ ok: true }); if (!saved.ok) throw new Error("Proposal failed");
    expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, saved.data.revisionId)).toMatchObject({ ok: true });
    expect(await publication(f.logId)).toEqual(before);
    const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE log_id=? AND kind='filer_update'").bind(f.logId).first<{ id: string }>();
    const input = await reviewInput(f, f.moderatorId, c!.id);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision }, reviewSecret)).toMatchObject({ ok: true });
    const after = await publication(f.logId);
    expect(after).toMatchObject({ published_at: before!.published_at, expires_at: before!.expires_at, status: "published" });
    expect(after!.current_revision_id).toBe(decision === "approve" ? saved.data.revisionId : before!.current_revision_id);
    expect((await env.DB.prepare("SELECT revision_id FROM proof_file WHERE id=?").bind(f.proofId).first())!.revision_id).toBe(f.revisionId);
    if (decision === "ask_changes") {
      const next = await saveProposal(f.db, f.freelancerId, { ...f.proposal, fields: { ...f.fields, rating: 3 } });
      expect(next).toMatchObject({ ok: true }); if (!next.ok) throw new Error("Resubmission failed");
      expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, next.data.revisionId)).toMatchObject({ ok: true });
      expect((await env.DB.prepare("SELECT subject_id FROM moderation_case WHERE id=?").bind(c!.id).first())!.subject_id).toBe(saved.data.revisionId);
      expect((await env.DB.prepare("SELECT rating,decision FROM log_revision WHERE id=?").bind(saved.data.revisionId).first())).toEqual({ rating: 2, decision: "ask_changes" });
    }
  });
  it("supports new exact-draft proof uploads, rejects cross-party/ID data and stale submission", async () => {
    const f = await updateFixture(), saved = await saveProposal(f.db, f.freelancerId, { ...f.proposal, proofIds: [] });
    expect(saved).toMatchObject({ ok: true }); if (!saved.ok) throw new Error("Proposal failed");
    const revisionId = saved.data.revisionId;
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { revisionId }, uploadRequest())).status).toBe(404);
    expect((await uploadProposalProof(f.db, env.PROOFS, f.freelancerId, { revisionId }, uploadRequest())).status).toBe(201);
    expect((await env.DB.prepare("SELECT revision_id,status FROM proof_file WHERE log_id=? AND status='uploading'").bind(f.logId).first())).toEqual({ revision_id: revisionId, status: "uploading" });
    const head = env.PROOFS.head.bind(env.PROOFS), spy = vi.spyOn(env.PROOFS, "head").mockImplementation(async key => { await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.freelancerId).run(); return head(key); });
    try { expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, revisionId)).toMatchObject({ ok: false }); } finally { spy.mockRestore(); }
    expect((await env.DB.prepare("SELECT state FROM log_revision WHERE id=?").bind(revisionId).first())!.state).toBe("draft");
    expect((await env.DB.prepare("SELECT id FROM moderation_case WHERE log_id=? AND kind='filer_update'").bind(f.logId).all()).results).toHaveLength(0);
    await env.DB.prepare("UPDATE user SET banned=0 WHERE id=?").bind(f.freelancerId).run();
    expect(await saveProposal(f.db, f.freelancerId, { ...f.proposal, revisionId, fields: { ...f.fields, facts: "The full government ID number is SSS 123-45-6789 and the invoice was disputed." } })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await saveProposal(f.db, f.clientUserId, { ...f.proposal, revisionId })).toMatchObject({ ok: false });
    expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, revisionId)).toMatchObject({ ok: true });
  });
  it("uses maximum approved update effective date even through a correction with NULL effective date", async () => {
    const f = await updateFixture(), yesterday = manilaDate(new Date(Date.now() - 86400000));
    const saved = await saveProposal(f.db, f.freelancerId, { ...f.proposal, effectiveOn: yesterday });
    expect(saved).toMatchObject({ ok: true }); if (!saved.ok) throw new Error("Proposal failed");
    expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, saved.data.revisionId)).toMatchObject({ ok: true });
    const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE log_id=? AND kind='filer_update'").bind(f.logId).first<{ id: string }>(), input = await reviewInput(f, f.moderatorId, c!.id);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: true });
    const opened = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "New factual counterproof clarifies the invoice and documented final amount." });
    if (!opened.ok) throw new Error("Correction draft failed");
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId: opened.data.requestId }, uploadRequest())).status).toBe(201);
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, opened.data.requestId)).toMatchObject({ ok: true });
    const correction = await env.DB.prepare("SELECT id FROM moderation_case WHERE correction_request_id=?").bind(opened.data.requestId).first<{ id: string }>(), reviewer = await addActor("moderator");
    const correctionInput = correctionFields(await reviewInput(f, reviewer, correction!.id));
    expect(await decideCorrection(f.db, env.PROOFS, reviewer, { ...correctionInput, requestId: opened.data.requestId, decision: "correct", fields: { ...f.fields, rating: 3 } }, reviewSecret)).toMatchObject({ ok: true });
    const corrected = await publication(f.logId);
    expect((await env.DB.prepare("SELECT effective_on FROM log_revision WHERE id=?").bind(corrected!.current_revision_id).first())!.effective_on).toBeNull();
    expect(await saveProposal(f.db, f.freelancerId, { ...f.proposal, expectedCurrentRevisionId: corrected!.current_revision_id, effectiveOn: yesterday })).toMatchObject({ ok: false });
    expect(await saveProposal(f.db, f.freelancerId, { ...f.proposal, expectedCurrentRevisionId: corrected!.current_revision_id })).toMatchObject({ ok: true });
  });
});
