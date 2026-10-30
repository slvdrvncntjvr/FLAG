import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { saveLogDraft } from "@/features/logs/draft";
import { logDraftInput } from "@/features/logs/schema";
import { submitLog } from "@/features/logs/submit";
import { removeDraftProof, uploadProof } from "@/features/logs/proofs";
import { loadPrivateLog } from "@/server/db/queries/logs";
import { addProof, intakeFixture, uploadRequest } from "./private-intake-fixtures";

const governmentIdFacts = [
  "Social Security number is PHP123456789",
  "Tax Identification Number is PHP123456789",
  "national identification number is PHP123456789012",
  "Social Security number is PHP 123456789",
  "Tax Identification Number is PHP 123456789",
  "national identification number is PHP 123456789012",
  "SOCIAL SECURITY SYSTEM NUMBER is USD 123456789",
  "Social Security no. is ₱123456789",
  "Social Security numbers are PHP 123456789",
  "Social Security account number is PHP 123456789",
  "Social Security identification number is PHP 123456789",
  "Social Security# is PHP 123456789",
  "taxpayer identification number is $123456789",
  "Tax Payer Identification Number is PHP 123456789",
  "government identification number is PHP 123456789012",
  "national identity number is PHP 123456789012",
  "Philippine Identification System Number is PHP 123456789012",
  "Philippine identity number is PHP 123456789012",
  "PhilSys Card Number is PHP 1234567890123456",
  "Government Service Insurance System number is PHP 12345678901",
  "Philippine Health Insurance Corporation number is PHP 123456789012",
  "Philippine Health Insurance Corporation # is PHP 123456789012",
  "Pag IBIG number is PHP 123456789012",
  "Pag\u2011IBIG number is PHP 123456789012",
  "Pag_IBIG number is PHP 123456789012",
  "Home Development Mutual Fund number is PHP 123456789012",
  "Tax-Identification-Number is PHP 123456789",
  "Social_Security_number is PHP 123456789",
  "Social\u00a0Security\u2013number is PHP 123456789",
  "Social Secu\u200drity number is PHP 123456789",
  "Ｓｏｃｉａｌ Ｓｅｃｕｒｉｔｙ ｎｕｍｂｅｒ is ＰＨＰ １２３４５６７８９",
  "Tax%20Identification%20Number is PHP 123456789",
  "Social%2520Security%2520number is PHP 123456789",
  "Social%25252520Security%25252520number is PHP 123456789",
  "Social%2525252520Security%2525252520number is PHP 123456789",
  "Social+Security+number is PHP 123456789",
  "national identification number is 2026-04-01",
].map(label => `The synthetic project was delivered and my ${label}.`);

async function intakeState() {
  // Include allocation/quota state as well as content: a rejected first save
  // must not allocate a reference, create children or touch an existing draft.
  const tables = ["engagement_log", "log_revision", "log_tag", "proof_file", "moderation_case", "audit_event", "auth_rate_limit"];
  const rows = await env.DB.batch(tables.map(table => env.DB.prepare(`SELECT * FROM ${table}`)));
  return rows.map(row => row.results.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

describe("private intake audit repairs", () => {
  describe.each(["initial save", "draft edit"] as const)("government identifier rejection on %s", mode => {
    it.each(governmentIdFacts)("rejects without any D1 change: %s", async facts => {
      const f = await intakeFixture();
      if (mode === "initial save") {
        // Make the accepted engagement genuinely empty: a duplicate-log guard
        // must not be mistaken for the privacy boundary on first persistence.
        await env.DB.batch([
          env.DB.prepare("DELETE FROM log_tag WHERE revision_id IN (SELECT id FROM log_revision WHERE log_id=?)").bind(f.logId),
          env.DB.prepare("DELETE FROM log_revision WHERE log_id=?").bind(f.logId),
          env.DB.prepare("DELETE FROM engagement_log WHERE id=?").bind(f.logId),
        ]);
      }
      const before = await intakeState();
      const input = { ...f.input, ...(mode === "draft edit" ? { logId: f.logId } : {}), facts };
      const result = await saveLogDraft(f.db, f.freelancerId, input);
      // Soft assertions retain both the invalid result and any unintended
      // persistence as red-before-green evidence against vulnerable source.
      expect.soft(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect.soft(await intakeState()).toEqual(before);
      expect.soft(logDraftInput.safeParse(input).success).toBe(false);
    });
  });

  it.each([
    "The invoice carried synthetic TIN 123-456-789 and the client paid on time.",
    "The invoice carried synthetic 123456789 and the client paid on time.",
    "The invoice carried synthetic TIN １２３－４５６－７８９ and payment was late.",
    "The invoice carried synthetic TIN ١٢٣-٤٥٦-٧٨٩ and the client paid on time.",
    "The invoice carried synthetic TIN 123%2D456%2D789 and payment was late.",
    "The invoice carried synthetic TIN 123%252D456%252D789 and payment was late.",
    "The invoice carried synthetic passport AB1234567 and payment was late.",
    "The invoice carried synthetic TIN PHP 123456789 and payment was late.",
    "The invoice carried synthetic PSN PHP 123456789012 and payment was late.",
    "The invoice carried synthetic PCN PHP 1234567890123456 and payment was late.",
    "The invoice carried synthetic PhilSys PHP 123456789012 and payment was late.",
    "The invoice carried synthetic ID_number PHP 123456789 and payment was late.",
  ])("rejects recognized ID facts before any draft persistence: %s", async facts => {
    const f = await intakeFixture();
    expect(logDraftInput.safeParse({ ...f.input, facts }).success).toBe(false);
    const before = await env.DB.prepare("SELECT * FROM log_revision WHERE log_id=?").bind(f.logId).first();
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, facts })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await env.DB.prepare("SELECT * FROM log_revision WHERE log_id=?").bind(f.logId).first()).toEqual(before);
    // The same gate protects first-save creation, not just updates.
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, facts })).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it.each([
    "The agreed work ran from 2026-04-01 to 2026-04-15 and was paid on time.",
    "The agreed invoice was PHP 100,000.00 and was paid on 2026-04-15.",
    "The agreed invoice was ₱100000.00 and the client paid it in full.",
    "The agreed invoice was USD 100000.00 and the client paid it in full.",
    "The client completed the final payment of PHP 100000.",
    "The client completed the final payment of PHP 100000.00.",
    "The agreed invoice was ＰＨＰ １００，０００．００ and was paid on ２０２６－０４－１５.",
    "The client paid USD 123456789012.00 for the agreed work on 2026-04-15.",
    "The client asked for a Social Security number and I refused to share it.",
    "The invoice included Social Security contributions of PHP 100000.",
  ])("preserves ordinary dates and marked amounts in facts: %s", async facts => {
    const f = await intakeFixture();
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, facts })).toMatchObject({ ok: true });
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.facts).toBe(facts);
  });

  it.each(["2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"])("resumes editing, proof operations and submission after timestamp release %s", async releasedAt => {
    const f = await intakeFixture(), proofId = await addProof(f);
    await env.DB.prepare("UPDATE engagement_log SET hold_kind='legal',hold_placed_at='2026-10-01T00:00:00.000Z',hold_released_at='2026-09-30T00:00:00.000Z' WHERE id=?").bind(f.logId).run();
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.canEdit).toBe(false);
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId })).toMatchObject({ ok: false });
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: false });
    expect((await uploadProof(f.db, env.PROOFS, f.freelancerId, f.logId, uploadRequest())).status).toBe(409);
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, proofId)).toMatchObject({ ok: false });
    await env.DB.prepare("UPDATE engagement_log SET hold_released_at=? WHERE id=?").bind(releasedAt, f.logId).run();
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.canEdit).toBe(true);
    expect(await saveLogDraft(f.db, f.freelancerId, { ...f.input, logId: f.logId, rating: 3 })).toMatchObject({ ok: true });
    expect(await removeDraftProof(f.db, env.PROOFS, f.freelancerId, proofId)).toMatchObject({ ok: true });
    await addProof(f);
    expect(await submitLog(f.db, env.PROOFS, f.freelancerId, f.logId)).toMatchObject({ ok: true });
    expect((await loadPrivateLog(f.db, f.freelancerId, f.logId))?.canEdit).toBe(false);
  });
});
