import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadClientRecord, searchClientNames } from "@/server/db/queries/records";
import { decideLogReview, decideCorrection } from "@/features/moderation/log-handlers";
import { openCorrection, submitCorrection } from "@/features/corrections/handlers";
import { uploadProposalProof } from "@/features/updates/proofs";
import { addActor, uploadRequest } from "./private-intake-fixtures";
import { pendingFixture, publishedFixture, reviewInput, reviewSecret } from "./pilot-review-fixture";
import { correctionFields } from "./f04-log-review-fixtures";

describe("client records through real review actions", () => {
  it("excludes pending content then shows only the approved exact revision with genuine proof receipts", async () => {
    const f = await pendingFixture();
    expect((await loadClientRecord(f.db, f.freelancerId, f.clientId))?.publishedLogCount).toBe(0);
    const input = await reviewInput(f, f.moderatorId, f.caseId);
    expect(await decideLogReview(f.db, env.PROOFS, f.moderatorId, { ...input, decision: "approve" }, reviewSecret)).toMatchObject({ ok: true });
    const record = await loadClientRecord(f.db, f.freelancerId, f.clientId);
    expect(record).toMatchObject({ publishedLogCount: 1, contributorCount: 1, limited: true, average: f.input.rating.toFixed(1) });
    expect(record?.logs[0]).toMatchObject({ facts: f.input.facts, rating: f.input.rating });
    expect(await loadClientRecord(f.db, f.clientUserId, f.clientId)).toEqual(record);
    expect(await loadClientRecord(f.db, await addActor("client"), f.clientId)).toBeNull();
    expect(await loadClientRecord(f.db, null, f.clientId)).toBeNull();
    const data = JSON.stringify(record);
    expect(data).not.toContain(input.reason);
    expect(data).not.toContain(input.proofVerdicts[0].viewToken);
    expect(data).not.toMatch(/object_key|proofVerdicts|sha256|@example\./);
  });

  it("leaves an existing publication unchanged when the client merely opens a private correction", async () => {
    const f = await publishedFixture();
    const before = await loadClientRecord(f.db, f.freelancerId, f.clientId);
    expect(await openCorrection(f.db, f.clientUserId, {
      logId: f.logId, note: "Private factual counter-evidence needs an independent review of the invoice.",
    })).toMatchObject({ ok: true });
    const after = await loadClientRecord(f.db, f.freelancerId, f.clientId);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain("Private factual counter-evidence");
    const clientName = await env.DB.prepare("SELECT display_name FROM client_profile WHERE id=?").bind(f.clientId).first<{ display_name: string }>();
    expect((await searchClientNames(f.db, f.freelancerId, clientName!.display_name)).some(row => row.id === f.clientId && row.engagementCount > 0)).toBe(true);
  });

  it("removes a withdrawn publication from every record aggregate immediately after independent review", async () => {
    const f = await publishedFixture();
    const request = await openCorrection(f.db, f.clientUserId, {
      logId: f.logId, note: "The new synthetic invoice evidence supports withdrawal of the incorrect entry.",
    });
    expect(request).toMatchObject({ ok: true });
    if (!request.ok) throw new Error("Synthetic correction could not open");
    const requestId = request.data.requestId;
    expect((await uploadProposalProof(f.db, env.PROOFS, f.clientUserId, { requestId },
      uploadRequest(new TextEncoder().encode("%PDF-1.7\nSynthetic corrected invoice supports withdrawal.\n%%EOF")))).status).toBe(201);
    expect(await submitCorrection(f.db, env.PROOFS, f.clientUserId, requestId)).toMatchObject({ ok: true });
    const c = await env.DB.prepare("SELECT id FROM moderation_case WHERE correction_request_id=?").bind(requestId).first<{ id: string }>();
    const reviewer = await addActor("moderator");
    const input = correctionFields(await reviewInput(f, reviewer, c!.id));
    expect(await decideCorrection(f.db, env.PROOFS, reviewer, { ...input, requestId, decision: "withdraw" }, reviewSecret)).toMatchObject({ ok: true });
    expect(await loadClientRecord(f.db, f.freelancerId, f.clientId)).toMatchObject({
      average: null, contributorCount: 0, publishedLogCount: 0, tags: [], logs: [], outcomes: { positive: 0, mixed: 0, negative: 0 },
    });
  });
});
