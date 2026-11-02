import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { assessPrivacyRequest, recordPrivacyOutcome, recordPrivacyRequest } from "@/features/privacy/handlers";
import type { Assessment } from "@/features/privacy/schema";
import { downloadProof } from "@/features/logs/proofs";
import { downloadReviewProof } from "@/features/moderation/proof-view";
import { contentWithinDeadline, loadPrivateLog } from "@/server/db/queries/logs";
import { candidateProofs, candidateRevision, loadReviewCase } from "@/server/db/queries/reviews";
import { loadClientRecord, searchClientNames } from "@/server/db/queries/records";
import { saveProposal, submitProposal } from "@/features/updates/handlers";
import { decideCorrection, decideLogReview, hideCorrectionRisk } from "@/features/moderation/log-handlers";
import { openCorrection, submitCorrection } from "@/features/corrections/handlers";
import { uploadProposalProof } from "@/features/updates/proofs";
import { manilaDate } from "@/features/logs/schema";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { addActor, addProof, intakeFixture, pdfBytes, uploadRequest } from "./private-intake-fixtures";
import { correctionFields, fixtureClock, pendingFixture, publishedFixture, publication, reviewInput, reviewSecret } from "./f04-log-review-fixtures";
import { ageSyntheticDrafts, finiteSyntheticHold } from "./synthetic-retention-clock";

const iso = (delta = 0) => new Date(Date.now() + delta).toISOString();
type Fixture = Awaited<ReturnType<typeof pendingFixture>>;
type Target = Assessment["targets"][number];
const types = ["engagement_log", "log_revision", "proof_file"] as const;
function target(f: Fixture, type: typeof types[number], revisionId: string, dueAt = iso(-1000)): Target {
  return { targetType: type, targetId: type === "engagement_log" ? f.logId : type === "log_revision" ? revisionId : f.proofId,
    operation: "purge", basis: "assessed_erasure", dueAt };
}
async function assess(f: Pick<Fixture, "db" | "freelancerId">, targets: Target[]) {
  const admin = await addActor("admin");
  const r = await recordPrivacyRequest(f.db, admin, { subjectUserId: f.freelancerId, responsibleId: admin,
    kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  if (!r.ok || !r.id) throw new Error("Synthetic request failed");
  const assessment: Assessment = { targets,
    identity: { method: "non_id_control", evidenceReference: "synthetic-control", verifiedSubjectId: f.freelancerId, verifiedAt: iso(-1000) },
    categories: [{ category: "proofs", disposition: "remove", basis: "Individually assessed synthetic erasure", until: iso(86400000) }], backups: "unverified" };
  expect(await assessPrivacyRequest(f.db, admin, r.id, assessment)).toEqual({ ok: true });
  return { id: r.id, admin, assessment };
}
async function executeWithoutRunner(id: string) {
  await env.DB.prepare("UPDATE privacy_request SET status='executing' WHERE id=?").bind(id).run();
}
async function plan(p: Awaited<ReturnType<typeof assess>>, t: Target) {
  await executeWithoutRunner(p.id);
  await env.DB.prepare(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at)
    VALUES(?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)
    .bind(crypto.randomUUID(), p.id, p.admin, t.targetType, t.targetId, t.operation, t.basis, t.dueAt).run();
}
function afterGet(callback: () => Promise<void>) {
  let calls = 0;
  const bucket = new Proxy(env.PROOFS, { get(bucket, key) {
    if (key === "get") return async (...args: Parameters<R2Bucket["get"]>) => {
      const object = await bucket.get(...args);
      calls++;
      await callback();
      return object;
    };
    const value = Reflect.get(bucket, key); return typeof value === "function" ? value.bind(bucket) : value;
  } });
  return { bucket, calls: () => calls };
}
async function inspectedCorrection() {
  const f = await publishedFixture(), reviewer = await addActor("moderator");
  const opened = await openCorrection(f.db, f.clientUserId, { logId: f.logId, note: "The synthetic invoice requires independent private factual review." });
  if (!opened.ok) throw new Error("Synthetic correction failed");
  const requestId = opened.data.requestId;
  const uploaded = await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId }, uploadRequest());
  expect(uploaded.status).toBe(201);
  const proofId = (await uploaded.json() as { data: { proofId: string } }).data.proofId;
  expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, requestId)).toMatchObject({ ok: true });
  const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE correction_request_id=?").bind(requestId).first<{ id: string }>();
  const input = correctionFields(await reviewInput(f, reviewer, c!.id));
  expect(await hideCorrectionRisk(f.db, reviewer, { caseId: c!.id, expectedClaimUntil: input.expectedClaimUntil,
    expectedCurrentRevisionId: f.revisionId, requestId, riskKind: "privacy_risk", reason: "The supplied synthetic invoice establishes a credible private factual risk." })).toMatchObject({ ok: true });
  return { ...f, reviewer, requestId, counterproofId: proofId, correctionCaseId: c!.id, correctionInput: input };
}
async function expirePublication(f: Awaited<ReturnType<typeof inspectedCorrection>>) {
  const old = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1, 12)).toISOString();
  await fixtureClock("pilot_log_update", env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(old, addTwelveMonthsUtc(old), f.logId));
}

describe("PRD-F12/F13 assessed source deadlines before maintenance (real local D1/R2)", () => {
  it.each(types.flatMap(type => (["unissued", "planned", "deferred"] as const).map(state => ({ type, state }))))(
    "denies exact $type at its assessed deadline with $state work and retained bytes", async ({ type, state }) => {
      const f = await publishedFixture(2), before = await publication(f.logId);
      const t = target(f, type, f.revisionId), p = await assess(f, [t]);
      if (state === "planned") await plan(p, t);
      else if (state === "deferred") expect(await recordPrivacyOutcome(f.db, p.admin, p.id, "deferred", "Synthetic physical work remains outstanding", iso(86400000))).toEqual({ ok: true });
      else await executeWithoutRunner(p.id);
      await finiteSyntheticHold(f.logId);
      const denied = afterGet(async () => { throw new Error("Due proof must not reach R2"); });
      for (const actor of [f.freelancerId, f.clientUserId, f.moderatorId]) {
        const detail = await loadPrivateLog(f.db, actor, f.logId);
        if (type === "proof_file") {
          expect(detail?.revisionId).toBe(f.revisionId);
          expect(detail?.proofs.some(proof => proof.id === f.proofId)).toBe(false);
          expect(detail?.proofs).toHaveLength(1);
        } else expect(detail).toBeNull();
        expect((await downloadProof(f.db, denied.bucket, actor, f.proofId)).status).toBe(404);
      }
      expect(denied.calls()).toBe(0);
      expect((await downloadProof(f.db, env.PROOFS, p.admin, f.proofId)).status).toBe(404);
      const c = await loadReviewCase(f.db, f.moderatorId, f.caseId);
      expect(c).not.toBeNull();
      expect(await candidateRevision(f.db, c!)).toEqual(type === "proof_file" ? expect.objectContaining({ id: f.revisionId }) : null);
      const proofs = await candidateProofs(f.db, c!, f.revisionId);
      expect(proofs.some(proof => proof.id === f.proofId)).toBe(false);
      expect(proofs).toHaveLength(type === "proof_file" ? 1 : 0);
      for (const actor of [f.freelancerId, f.clientUserId]) expect(await loadClientRecord(f.db, actor, f.clientId)).toMatchObject({
        average: null, contributorCount: 0, publishedLogCount: 0, logs: [], tags: [],
      });
      // Search exposes identity/accepted engagement count, never log facts or ratings.
      expect((await searchClientNames(f.db, f.freelancerId, "Test Client")).some(row => row.id === f.clientId)).toBe(true);
      expect(await publication(f.logId)).toEqual(before);
      expect(await env.PROOFS.head(`logs/${f.logId}/${f.proofId}`)).not.toBeNull();
      expect((await env.DB.prepare("SELECT status FROM maintenance_task WHERE privacy_request_id=?").bind(p.id).all()).results)
        .toEqual(state === "planned" ? [{ status: "planned" }] : []);
    });

  it.each(types.flatMap(type => (["filer", "client", "moderator"] as const).map(role => ({ type, role }))))(
    "rechecks $type after R2 for ordinary $role proof delivery", async ({ type, role }) => {
      const f = await pendingFixture(), revisionId = (await candidateRevision(f.db, (await loadReviewCase(f.db, f.moderatorId, f.caseId))!))!.id;
      const actor = role === "filer" ? f.freelancerId : role === "client" ? f.clientUserId : f.moderatorId;
      let requestId: string | undefined;
      const delayed = afterGet(async () => { const p = await assess(f, [target(f, type, revisionId)]); requestId = p.id; await executeWithoutRunner(p.id); });
      const response = await downloadProof(f.db, delayed.bucket, actor, f.proofId);
      expect(delayed.calls()).toBe(1); expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Synthetic project invoice");
      expect(await env.PROOFS.head(`logs/${f.logId}/${f.proofId}`)).not.toBeNull();
      expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=?").bind(requestId!).first()).toBeNull();
    });

  it.each(types)("rechecks %s after the moderator review R2 wait without issuing an inspection receipt", async type => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    const delayed = afterGet(async () => { const p = await assess(f, [target(f, type, input.revisionId)]); await executeWithoutRunner(p.id); });
    const response = await downloadReviewProof(f.db, delayed.bucket, f.moderatorId, f.proofId,
      { caseId: f.caseId, revisionId: input.revisionId, expectedClaimUntil: input.expectedClaimUntil }, reviewSecret);
    expect(delayed.calls()).toBe(1); expect(response.status).toBe(404);
    expect(response.headers.get("X-FLAG-Proof-View")).toBeNull();
    expect(await response.text()).not.toContain("Synthetic project invoice");
  });

  it.each(types)("denies due %s before the moderator review R2 read without a maintenance task", async type => {
    const f = await pendingFixture(), input = await reviewInput(f, f.moderatorId, f.caseId);
    const p = await assess(f, [target(f, type, input.revisionId)]);
    await executeWithoutRunner(p.id);
    const denied = afterGet(async () => { throw new Error("Due review proof must not reach R2"); });
    const response = await downloadReviewProof(f.db, denied.bucket, f.moderatorId, f.proofId,
      { caseId: f.caseId, revisionId: input.revisionId, expectedClaimUntil: input.expectedClaimUntil }, reviewSecret);
    expect(response.status).toBe(404); expect(denied.calls()).toBe(0);
    expect(response.headers.get("X-FLAG-Proof-View")).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM maintenance_task WHERE privacy_request_id=?").bind(p.id).first()).toBeNull();
  });

  it.each(["future", "denied", "stale_processor", "forged_scope", "wrong_subject", "unverified"] as const)(
    "gives no due-source authority to a %s assessment", async kind => {
      const f = await publishedFixture(), t = target(f, "proof_file", f.revisionId, kind === "future" ? iso(3600000) : iso(-1000));
      const p = await assess(kind === "wrong_subject" ? { db: f.db, freelancerId: await addActor("client") } : f, kind === "wrong_subject" ? [] : [t]);
      if (kind === "denied") expect(await recordPrivacyOutcome(f.db, p.admin, p.id, "denied", "Synthetic request denied after assessment", iso(86400000))).toEqual({ ok: true });
      if (kind === "stale_processor") await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(p.admin).run();
      if (kind === "forged_scope") await env.DB.prepare("UPDATE privacy_request SET scope=? WHERE id=?").bind(JSON.stringify({ targets: [{ ...t, targetId: "unrelated-synthetic-object" }] }), p.id).run();
      if (kind === "wrong_subject") await env.DB.prepare("UPDATE privacy_request SET assessment=?,scope=? WHERE id=?")
        .bind(JSON.stringify({ ...p.assessment, targets: [t] }), JSON.stringify({ targets: [t] }), p.id).run();
      if (kind === "unverified") await env.DB.prepare("UPDATE privacy_request SET identity_verified_at=NULL WHERE id=?").bind(p.id).run();
      for (const actor of [f.freelancerId, f.clientUserId, f.moderatorId]) {
        expect((await loadPrivateLog(f.db, actor, f.logId))?.revisionId).toBe(f.revisionId);
        const response = await downloadProof(f.db, env.PROOFS, actor, f.proofId);
        expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
      }
      expect((await downloadProof(f.db, env.PROOFS, p.admin, f.proofId)).status).toBe(404);
      expect(await loadClientRecord(f.db, f.freelancerId, f.clientId)).toMatchObject({ average: "4.0", publishedLogCount: 1 });
    });

  it("applies a deadline assessed by either verified party, without hiding unrelated proofs or restarting original clocks", async () => {
    const f = await publishedFixture(2), before = await publication(f.logId);
    const p = await assess({ db: f.db, freelancerId: f.clientUserId }, [target(f, "proof_file", f.revisionId)]);
    await executeWithoutRunner(p.id);
    expect(await contentWithinDeadline(f.db, "proof", f.proofId)).toBe(false);
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.proofs).toHaveLength(1);
    expect(await publication(f.logId)).toEqual(before);
  });

  it("preserves natural draft expiry even when an assessment grants a later date and a hold retains bytes", async () => {
    const f = await intakeFixture(), proofId = await addProof(f);
    await ageSyntheticDrafts([f.logId], iso(-31 * 86400000));
    await finiteSyntheticHold(f.logId);
    const p = await assess(f, [{ targetType: "proof_file", targetId: proofId, operation: "purge", basis: "assessed_erasure", dueAt: iso(86400000) }]);
    await executeWithoutRunner(p.id);
    expect(await contentWithinDeadline(f.db, "proof", proofId)).toBe(false);
    expect(await loadPrivateLog(f.db, f.freelancerId, f.logId)).toBeNull();
    expect((await downloadProof(f.db, env.PROOFS, f.clientUserId, proofId)).status).toBe(404);
    expect(await env.PROOFS.head(`logs/${f.logId}/${proofId}`)).not.toBeNull();
  });

  it("keeps a reused proof at the active publication clock after the rejected proposal's exact assessed deadline", async () => {
    const f = await publishedFixture(), past = iso(-3 * 86400000);
    await fixtureClock("pilot_log_update", env.DB.prepare("UPDATE engagement_log SET published_at=?,expires_at=? WHERE id=?").bind(past, addTwelveMonthsUtc(past), f.logId));
    const before = await publication(f.logId);
    const saved = await saveProposal(f.db, f.freelancerId, { logId: f.logId, expectedCurrentRevisionId: f.revisionId,
      fields: { rating: 2, tags: ["Late Payment"], facts: f.input.facts, periodStart: f.input.periodStart,
        periodEnd: f.input.periodEnd, amountCentavos: f.input.amountCentavos }, effectiveOn: manilaDate(), proofIds: [f.proofId] });
    if (!saved.ok) throw new Error("Synthetic shared-proof proposal failed");
    expect(await submitProposal(f.db, env.PROOFS, f.freelancerId, f.logId, saved.data.revisionId)).toMatchObject({ ok: true });
    const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE log_id=? AND kind='filer_update'").bind(f.logId).first<{ id: string }>();
    const input = await reviewInput(f, f.moderatorId, c!.id);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "reject" }, reviewSecret)).toMatchObject({ ok: true });
    const p = await assess(f, [target(f, "log_revision", saved.data.revisionId)]);
    await executeWithoutRunner(p.id);
    expect(await contentWithinDeadline(f.db, "revision", saved.data.revisionId)).toBe(false);
    expect(await contentWithinDeadline(f.db, "proof", f.proofId)).toBe(true);
    expect((await downloadProof(f.db, env.PROOFS, f.clientUserId, f.proofId)).status).toBe(200);
    expect(await loadClientRecord(f.db, f.freelancerId, f.clientId)).toMatchObject({ average: "4.0", publishedLogCount: 1 });
    const exactProof = await assess(f, [target(f, "proof_file", f.revisionId)]);
    await executeWithoutRunner(exactProof.id);
    expect((await downloadProof(f.db, env.PROOFS, f.clientUserId, f.proofId)).status).toBe(404);
    expect((await loadClientRecord(f.db, f.freelancerId, f.clientId))?.average).toBeNull();
    expect(await publication(f.logId)).toEqual(before);
  });

  it.each((["natural", "engagement_log", "log_revision", "proof_file"] as const).flatMap(expiry =>
    (["uphold", "withdraw"] as const).map(decision => ({ expiry, decision }))))(
    "closes already-inspected $decision after $expiry expiry without fresh reads or restoration", async ({ expiry, decision }) => {
      const f = await inspectedCorrection();
      if (expiry === "natural") await expirePublication(f);
      else {
        const t = target(f, expiry, f.revisionId);
        if (expiry === "proof_file") t.targetId = f.counterproofId;
        const p = await assess(f, [t]); await executeWithoutRunner(p.id);
      }
      const before = await publication(f.logId), denied = afterGet(async () => { throw new Error("No fresh expired byte read"); });
      const review = await downloadReviewProof(f.db, denied.bucket, f.reviewer, f.counterproofId,
        { caseId: f.correctionCaseId, revisionId: f.revisionId, expectedClaimUntil: f.correctionInput.expectedClaimUntil }, reviewSecret);
      expect(review.status).toBe(404); expect(review.headers.get("X-FLAG-Proof-View")).toBeNull();
      expect((await downloadProof(f.db, denied.bucket, f.clientUserId, f.counterproofId)).status).toBe(404);
      expect(denied.calls()).toBe(0);
      const c = await loadReviewCase(f.db, f.reviewer, f.correctionCaseId);
      expect((await candidateProofs(f.db, c!, f.revisionId)).some(p => p.id === f.counterproofId)).toBe(false);
      const result = await decideCorrection(f.db, denied.bucket, f.reviewer,
        { ...f.correctionInput, requestId: f.requestId, decision }, reviewSecret);
      expect(result).toMatchObject({ ok: true }); expect(denied.calls()).toBe(0);
      expect(await publication(f.logId)).toEqual({ ...before, status: decision === "withdraw" ? "withdrawn" : "hidden" });
      expect(await env.DB.prepare("SELECT status,restored_at FROM correction_request WHERE id=?").bind(f.requestId).first()).toEqual({ status: "closed", restored_at: null });
      expect(await env.DB.prepare("SELECT 1 FROM log_revision WHERE log_id=? AND kind='correction'").bind(f.logId).first()).toBeNull();
      expect((await loadClientRecord(f.db, f.freelancerId, f.clientId))?.publishedLogCount).toBe(0);
    });

  it.each(["no_token", "forged_token", "revoked_lease", "revoked_reviewer"] as const)(
    "rejects an expired terminal correction with %s and leaves its hidden case unchanged", async failure => {
      const f = await inspectedCorrection(); await expirePublication(f);
      const before = await publication(f.logId);
      const input = { ...f.correctionInput, requestId: f.requestId, decision: "uphold" as const,
        proofVerdicts: f.correctionInput.proofVerdicts.map(v => ({ ...v,
          viewToken: failure === "no_token" ? "" : failure === "forged_token" ? `${v.viewToken.split(".")[0]}.AAAA` : v.viewToken })) };
      if (failure === "revoked_lease") input.expectedClaimUntil = iso(-1000);
      const bucket = new Proxy(env.PROOFS, { get(bucket, key) {
        if (key === "head" && failure === "revoked_reviewer") return async (objectKey: string) => {
          const head = await bucket.head(objectKey);
          await env.DB.prepare("UPDATE user SET banned=1 WHERE id=?").bind(f.reviewer).run();
          return head;
        };
        const value = Reflect.get(bucket, key); return typeof value === "function" ? value.bind(bucket) : value;
      } });
      expect(await decideCorrection(f.db, bucket, f.reviewer, input, reviewSecret)).toMatchObject({ ok: false });
      expect(await publication(f.logId)).toEqual(before);
      expect(await env.DB.prepare("SELECT status,restored_at FROM correction_request WHERE id=?").bind(f.requestId).first()).toEqual({ status: "submitted", restored_at: null });
      expect(await env.DB.prepare("SELECT 1 FROM review_round WHERE case_id=?").bind(f.correctionCaseId).first()).toBeNull();
    });
});
