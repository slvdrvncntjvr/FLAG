import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { openCorrection, submitCorrection, selectCorrectionProofs } from "@/features/corrections/handlers";
import { uploadProposalProof } from "@/features/updates/proofs";
import { claimLogReview, decideCorrection, hideCorrectionRisk } from "@/features/moderation/log-handlers";
import { loadCorrections } from "@/server/db/queries/corrections";
import { downloadProof } from "@/features/logs/proofs";
import { addActor, uploadRequest } from "./private-intake-fixtures";
import { correctionFields, publishedFixture, publication, reviewInput, reviewSecret } from "./f04-log-review-fixtures";
import { manilaDate } from "@/features/logs/schema";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";

async function correctionFixture(count = 1, filerProofs = 1) {
  const f = await publishedFixture(filerProofs), reviewer = await addActor("moderator");
  const opened = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "The invoice evidence contains a factual discrepancy requiring review." });
  expect(opened).toMatchObject({ ok: true });
  if (!opened.ok) throw new Error("Correction fixture failed");
  const requestId = opened.data.requestId;
  const uploaded = await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest(new TextEncoder().encode("%PDF-1.7\nSynthetic client counterproof of agreed final invoice.\n%%EOF")));
  expect(uploaded.status).toBe(201);
  const { data } = await uploaded.json() as { data: { proofId: string } };
  const counterproofIds = [data.proofId];
  for (let index = 1; index < count; index++) {
    const extra = await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest(new TextEncoder().encode(`%PDF-1.7\nSynthetic evidence item ${index} clarifies the agreed invoice.\n%%EOF`)));
    expect(extra.status).toBe(201);
    counterproofIds.push((await extra.json() as { data: { proofId: string } }).data.proofId);
  }
  expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, requestId)).toMatchObject({ ok: true });
  const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE correction_request_id=?").bind(requestId).first<{ id: string }>();
  return { ...f, reviewer, requestId, counterproofId: data.proofId, counterproofIds, correctionCaseId: c!.id };
}
describe("actual private client correction", () => {
  it.each(["uphold", "ask_changes", "correct", "withdraw"] as const)("supports independent %s without moving original expiry", async decision => {
    const f = await correctionFixture(), before = await publication(f.logId);
    expect(await claimLogReview(f.db, f.moderatorId, { caseId: f.correctionCaseId })).toMatchObject({ ok: false });
    const input = await reviewInput(f, f.reviewer, f.correctionCaseId);
    const shared = correctionFields(input);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...shared, requestId: f.requestId, decision,
      ...(decision === "correct" ? { fields: { rating: 3, tags: ["Professional"], facts: "The agreed project was delivered; the corrected invoice establishes the mixed outcome.", periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: 25000 } } : {}) }, reviewSecret)).toMatchObject({ ok: true });
    const after = await publication(f.logId);
    expect(after).toMatchObject({ published_at: before!.published_at, expires_at: before!.expires_at, status: decision === "withdraw" ? "withdrawn" : "published" });
    expect(after!.current_revision_id === before!.current_revision_id).toBe(decision !== "correct");
    if (decision === "correct") expect((await env.DB.prepare("SELECT invalidated_at FROM log_revision WHERE id=?").bind(f.revisionId).first())!.invalidated_at).toBeTruthy();
    expect((await env.DB.prepare("SELECT status,closed_at FROM correction_request WHERE id=?").bind(f.requestId).first())!.status).toBe(decision === "ask_changes" ? "ask_changes" : "closed");
  });
  it("keeps requests and counterproof private, enforces one open request and no direct client edits", async () => {
    const f = await correctionFixture(), stranger = await addActor("freelancer");
    expect(await publication(f.logId)).toMatchObject({ status: "published", current_revision_id: f.revisionId });
    expect(await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "Another private correction request with no new supporting material." })).toMatchObject({ ok: false });
    expect(await loadCorrections(f.db, stranger, f.logId)).toBeNull();
    expect((await downloadProof(f.db, env.PROOFS, stranger, f.counterproofId)).status).toBe(404);
    expect((await downloadProof(f.db, env.PROOFS, await addActor("admin"), f.counterproofId)).status).toBe(404);
    for (const actor of [f.clientUserId, f.freelancerId, f.reviewer]) expect((await downloadProof(f.db, env.PROOFS, actor, f.counterproofId)).status).toBe(200);
    expect(await openCorrection(f.db, stranger, { logId: f.logId, note: "An unrelated party cannot request publication changes on this engagement." })).toMatchObject({ ok: false });
  });
  it("hides only for reasoned credible risk, then independently upholds and restores the same publication", async () => {
    const f = await correctionFixture(), before = await publication(f.logId), input = await reviewInput(f, f.reviewer, f.correctionCaseId);
    const hide = { caseId: f.correctionCaseId, expectedClaimUntil: input.expectedClaimUntil, requestId: f.requestId, expectedCurrentRevisionId: f.revisionId, riskKind: "privacy_risk", reason: "The supplied counterproof credibly indicates exposed unrelated personal information." };
    expect(await hideCorrectionRisk(f.db, f.reviewer, { ...hide, riskKind: "opinion" })).toMatchObject({ ok: false });
    expect(await hideCorrectionRisk(f.db, f.reviewer, { ...hide, expectedCurrentRevisionId: crypto.randomUUID() })).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT hidden_at,hidden_by,hide_reason FROM correction_request WHERE id=?").bind(f.requestId).first())).toEqual({ hidden_at: null, hidden_by: null, hide_reason: null });
    expect((await env.DB.prepare("SELECT id FROM audit_event WHERE moderation_case_id=? AND action='correction_risk_hidden'").bind(f.correctionCaseId).all()).results).toHaveLength(0);
    expect(await hideCorrectionRisk(f.db, f.reviewer, hide)).toMatchObject({ ok: true });
    expect(await publication(f.logId)).toMatchObject({ status: "hidden" });
    const shared = correctionFields(input);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...shared, requestId: f.requestId, decision: "uphold" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await publication(f.logId)).toEqual(before);
  });
  it("preserves submitted counterproof through ask-changes and rejects a repeat without new evidence", async () => {
    const f = await correctionFixture(), input = await reviewInput(f, f.reviewer, f.correctionCaseId), shared = correctionFields(input);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...shared, requestId: f.requestId, decision: "ask_changes" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, f.requestId)).toMatchObject({ ok: false });
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId: f.requestId }, uploadRequest(new TextEncoder().encode("%PDF-1.7\nNew synthetic factual item clarifying the disputed invoice.\n%%EOF")))).status).toBe(201);
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, f.requestId)).toMatchObject({ ok: true });
    const next = await reviewInput(f, f.reviewer, f.correctionCaseId), nextShared = correctionFields(next);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...nextShared, requestId: f.requestId, decision: "uphold" }, reviewSecret)).toMatchObject({ ok: true });
    const repeat = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "The invoice evidence contains a factual discrepancy requiring review." });
    expect(repeat).toMatchObject({ ok: true });
    if (!repeat.ok) throw new Error("Repeat draft failed");
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId: repeat.data.requestId }, uploadRequest(new TextEncoder().encode("%PDF-1.7\nSynthetic client counterproof of agreed final invoice.\n%%EOF")))).status).toBe(201);
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, repeat.data.requestId)).toMatchObject({ ok: false });
    expect((await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(f.counterproofId).first())!.status).toBe("attached");
  });
  it("rolls back all correction effects when the reviewer is revoked during proof inspection", async () => {
    const f = await correctionFixture(), before = await publication(f.logId), input = await reviewInput(f, f.reviewer, f.correctionCaseId), shared = correctionFields(input);
    const head = env.PROOFS.head.bind(env.PROOFS), spy = vi.spyOn(env.PROOFS, "head").mockImplementation(async key => { await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.reviewer).run(); return head(key); });
    try { expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...shared, requestId: f.requestId, decision: "withdraw" }, reviewSecret)).toMatchObject({ ok: false }); } finally { spy.mockRestore(); }
    expect(await publication(f.logId)).toEqual(before);
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.correctionCaseId).all()).results).toHaveLength(0);
  });
  it("replaces one of five selected counterproofs after ask-changes while preserving original bytes and receipts", async () => {
    const f = await correctionFixture(5), input = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, requestId: f.requestId, decision: "ask_changes" }, reviewSecret)).toMatchObject({ ok: true });
    const before = await env.DB.prepare("SELECT active_proof_ids,new_evidence_note,submitted_at FROM correction_request WHERE id=?").bind(f.requestId).first<{ active_proof_ids: string; new_evidence_note: string; submitted_at: string }>();
    const originalIds: string[] = JSON.parse(before!.active_proof_ids), keep = originalIds.slice(1);
    expect(await selectCorrectionProofs(f.db, f.clientUserId, { requestId: f.requestId, expectedProofIds: originalIds, proofIds: keep })).toMatchObject({ ok: true });
    expect(await selectCorrectionProofs(f.db, f.clientUserId, { requestId: f.requestId, expectedProofIds: originalIds, proofIds: [] })).toMatchObject({ ok: false, code: "conflict" });
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId: f.requestId }, uploadRequest(new TextEncoder().encode("%PDF-1.7\nNew factual counterproof replaces the disputed invoice item.\n%%EOF")))).status).toBe(201);
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, f.requestId)).toMatchObject({ ok: true });
    const next = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    expect(next.proofVerdicts).toHaveLength(6); // One filer proof plus exactly five selected client proofs.
    expect(next.proofVerdicts.some(p => p.proofId === originalIds[0])).toBe(false);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...next, requestId: f.requestId, decision: "uphold" }, reviewSecret)).toMatchObject({ ok: true });
    const after = await env.DB.prepare("SELECT new_evidence_note,submitted_at FROM correction_request WHERE id=?").bind(f.requestId).first();
    expect(after).toEqual({ new_evidence_note: before!.new_evidence_note, submitted_at: before!.submitted_at });
    const old = await env.DB.prepare("SELECT object_key,status FROM proof_file WHERE id=?").bind(originalIds[0]).first<{ object_key: string; status: string }>();
    expect(old!.status).toBe("attached"); expect(await env.PROOFS.head(old!.object_key)).toBeTruthy();
    expect((await env.DB.prepare("SELECT id FROM proof_review WHERE proof_id=?").bind(originalIds[0]).all()).results).toHaveLength(1);
    expect(await selectCorrectionProofs(f.db, f.clientUserId, { requestId: f.requestId, expectedProofIds: keep, proofIds: [] })).toMatchObject({ ok: false });
  });
  it("rolls back a lost correction upload slot and compensates a settled failed put", async () => {
    const f = await publishedFixture(), opened = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "Synthetic factual request with bounded counterproof uploads for review." });
    if (!opened.ok) throw new Error("Draft failed");
    const requestId = opened.data.requestId;
    for (let i = 0; i < 4; i++) expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest(new TextEncoder().encode(`%PDF-1.7\nSynthetic document ${i}.\n%%EOF`)))).status).toBe(201);
    const uploads = await Promise.all([0, 1].map(i => uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest(new TextEncoder().encode(`%PDF-1.7\nLast slot competing document ${i}.\n%%EOF`)))));
    expect(uploads.filter(r => r.status === 201)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT id FROM proof_file WHERE correction_request_id=?").bind(requestId).all()).results).toHaveLength(5);
    const selected = await env.DB.prepare("SELECT active_proof_ids FROM correction_request WHERE id=?").bind(requestId).first<{ active_proof_ids: string }>(), ids: string[] = JSON.parse(selected!.active_proof_ids);
    expect(await selectCorrectionProofs(f.db, f.clientUserId, { requestId, expectedProofIds: ids, proofIds: ids.slice(0, 4) })).toMatchObject({ ok: true });
    const put = env.PROOFS.put.bind(env.PROOFS), spy = vi.spyOn(env.PROOFS, "put").mockImplementation(async (...args) => { await put(...args); throw new Error("synthetic settled failure"); });
    try { expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest())).status).toBe(503); } finally { spy.mockRestore(); }
    const rows = (await env.DB.prepare("SELECT object_key,status FROM proof_file WHERE correction_request_id=? ORDER BY uploaded_at,id").bind(requestId).all<{ object_key: string; status: string }>()).results;
    const purged = rows.filter(p => p.status === "purged");
    expect(purged).toHaveLength(1); expect(await env.PROOFS.head(purged[0].object_key)).toBeNull();
    expect(JSON.parse((await env.DB.prepare("SELECT active_proof_ids FROM correction_request WHERE id=?").bind(requestId).first<{ active_proof_ids: string }>())!.active_proof_ids)).toHaveLength(4);
  });
  it("corrects from an accepted evidence subset while retaining every rejected original proof verdict", async () => {
    const f = await correctionFixture(1, 2), input = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    const rejectedId = f.proofId;
    const proofVerdicts = input.proofVerdicts.map(p => ({ ...p, verdict: p.proofId === rejectedId ? "reject" : "accept" }));
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, proofVerdicts, requestId: f.requestId, decision: "correct", fields: { rating: 3, facts: "The corrected agreed invoice establishes the mixed experience for this project.", tags: ["Professional"], periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: null } }, reviewSecret)).toMatchObject({ ok: true });
    const after = await publication(f.logId);
    expect((await env.DB.prepare("SELECT proof_id FROM revision_proof WHERE revision_id=?").bind(after!.current_revision_id).all()).results).toHaveLength(1);
    expect((await env.DB.prepare("SELECT pr.verdict FROM proof_review pr JOIN review_round rr ON rr.id=pr.round_id WHERE rr.case_id=? AND pr.proof_id=?").bind(f.correctionCaseId, rejectedId).first())!.verdict).toBe("rejected");
    expect((await env.DB.prepare("SELECT status FROM proof_file WHERE id=?").bind(rejectedId).first())!.status).toBe("attached");
  });
  it("rolls back corrected revision, invalidation, receipts and request closure when audit fails", async () => {
    const f = await correctionFixture(), before = await publication(f.logId), input = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    const trigger = `fail_correction_${crypto.randomUUID().replaceAll("-", "")}`;
    await env.DB.prepare(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_event WHEN NEW.action='review_decided' AND NEW.moderation_case_id='${f.correctionCaseId}' BEGIN SELECT RAISE(ABORT,'synthetic correction abort'); END`).run();
    try { expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, requestId: f.requestId, decision: "correct", fields: { rating: 3, facts: "The corrected agreed invoice establishes the mixed experience for this project.", tags: ["Professional"], periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: null } }, reviewSecret)).toMatchObject({ ok: false }); }
    finally { await env.DB.prepare(`DROP TRIGGER ${trigger}`).run(); }
    expect(await publication(f.logId)).toEqual(before);
    expect((await env.DB.prepare("SELECT id FROM log_revision WHERE log_id=? AND kind='correction'").bind(f.logId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.correctionCaseId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT invalidated_at FROM log_revision WHERE id=?").bind(f.revisionId).first())!.invalidated_at).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM correction_request WHERE id=?").bind(f.requestId).first())!.status).toBe("submitted");
  });
  it("rejects corrected covered dates before the engagement or after today without partial decisions", async () => {
    const f = await correctionFixture(), before = await publication(f.logId), input = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    for (const dates of [
      { periodStart: "2026-09-30", periodEnd: f.input.periodEnd },
      { periodStart: f.input.periodStart, periodEnd: manilaDate(new Date(Date.now() + 86400000)) },
    ]) expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, requestId: f.requestId, decision: "correct", fields: { rating: 3, facts: "The corrected invoice establishes a mixed outcome for this synthetic engagement.", tags: ["Professional"], amountCentavos: null, ...dates } }, reviewSecret)).toMatchObject({ ok: false });
    expect(await publication(f.logId)).toEqual(before);
    expect((await env.DB.prepare("SELECT id FROM log_revision WHERE log_id=? AND kind='correction'").bind(f.logId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.correctionCaseId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT invalidated_at FROM log_revision WHERE id=?").bind(f.revisionId).first())!.invalidated_at).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM correction_request WHERE id=?").bind(f.requestId).first())!.status).toBe("submitted");
  });
  it("cannot correct or restore a temporarily hidden publication after its original expiry", async () => {
    const f = await correctionFixture(), input = correctionFields(await reviewInput(f, f.reviewer, f.correctionCaseId));
    expect(await hideCorrectionRisk(f.db, f.reviewer, { caseId: f.correctionCaseId, expectedClaimUntil: input.expectedClaimUntil, requestId: f.requestId, expectedCurrentRevisionId: f.revisionId, riskKind: "factual_error", reason: "The private counterproof credibly questions the invoice association." })).toMatchObject({ ok: true });
    const guard = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='pilot_log_update'").first<{ sql: string }>();
    if (!guard) throw new Error("Publication guard missing");
    const oldPublication = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1, 12)).toISOString();
    const deadline = addTwelveMonthsUtc(oldPublication);
    // Set up an elapsed clock on a genuinely reviewed publication, restoring the
    // exact production trigger before any decision or restoration is attempted.
    await expect(env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(oldPublication, deadline, f.logId).run()).rejects.toThrow();
    await env.DB.prepare("DROP TRIGGER pilot_log_update").run();
    try { await env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(oldPublication, deadline, f.logId).run(); }
    finally { await env.DB.prepare(guard.sql).run(); }
    const before = await publication(f.logId);
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, requestId: f.requestId, decision: "correct", fields: { rating: 3, tags: ["Professional"], facts: "The corrected invoice establishes the mixed outcome of this synthetic engagement.", periodStart: f.input.periodStart, periodEnd: f.input.periodEnd, amountCentavos: null } }, reviewSecret)).toMatchObject({ ok: false });
    expect(await publication(f.logId)).toEqual(before);
    expect((await env.DB.prepare("SELECT id FROM log_revision WHERE log_id=? AND kind='correction'").bind(f.logId).all()).results).toHaveLength(0);
    expect((await env.DB.prepare("SELECT id FROM review_round WHERE case_id=?").bind(f.correctionCaseId).all()).results).toHaveLength(0);
    // A retained private case may close, but an uphold never renews visibility.
    expect(await decideCorrection(f.db, env.PROOFS, f.reviewer, { ...input, requestId: f.requestId, decision: "uphold" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await publication(f.logId)).toEqual(before);
    expect((await env.DB.prepare("SELECT restored_at FROM correction_request WHERE id=?").bind(f.requestId).first())!.restored_at).toBeNull();
  });
});
