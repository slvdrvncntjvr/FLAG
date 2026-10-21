import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { engagementLog, logRevision, logTag, proofFile } from "@/server/db/schema";
import { seedLog } from "./helpers";

let fixture: Awaited<ReturnType<typeof seedLog>>;
beforeEach(async () => { fixture = await seedLog(); });

async function insertRevision(overrides: Record<string, string | number | null> = {}) {
  const row = {
    id: crypto.randomUUID(), log_id: fixture.logId, rev_no: 1, kind: "initial", rating: 4, outcome: "positive",
    facts: "The agreed project was delivered and the invoice was paid.",
    period_start: "2026-10-01", period_end: "2026-10-14", amount_centavos: null,
    submitted_by: fixture.freelancerId, ...overrides,
  };
  const columns = Object.keys(row);
  await env.DB.prepare(`INSERT INTO log_revision (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .bind(...Object.values(row)).run();
  return row.id;
}

describe("PRD-F2/PRD-F14 migration constraints in D1", () => {
  it.each([1, 2, 3, 4, 5])("accepts integer rating %s with its derived outcome", async (rating) => {
    const outcome = rating <= 2 ? "negative" : rating === 3 ? "mixed" : "positive";
    const id = await insertRevision({ rating, outcome });
    expect(await env.DB.prepare("SELECT rating, outcome FROM log_revision WHERE id = ?").bind(id).first())
      .toEqual({ rating, outcome });
  });

  it.each([0, 6, 2.5, "unrated", null])("rejects invalid rating %s in a direct write (S-03)", async (rating) => {
    await expect(insertRevision({ rating })).rejects.toThrow(/constraint/i);
  });

  it.each(["negative", "mixed", "unknown", "Positive", null])("rejects a mismatched outcome %s", async (outcome) => {
    await expect(insertRevision({ rating: 4, outcome })).rejects.toThrow(/constraint/i);
  });

  it.each([-1, 1.5, "money"])("rejects invalid centavos %s (S-25)", async (amount_centavos) => {
    await expect(insertRevision({ amount_centavos })).rejects.toThrow(/constraint/i);
  });

  it.each([null, 0, 125050])("accepts optional centavos %s", async (amount_centavos) => {
    expect(await insertRevision({ amount_centavos })).toBeTypeOf("string");
  });

  it.each([
    ["2026-10-14", "2026-10-01"], ["2026-02-30", "2026-10-14"],
    ["2026-10-01", "2026-13-01"], ["2026-2-01", "2026-10-14"],
    ["not-a-date", "2026-10-14"], ["2026-10-01", null],
  ])("rejects invalid covered period %s to %s (S-25)", async (period_start, period_end) => {
    await expect(insertRevision({ period_start, period_end })).rejects.toThrow(/constraint/i);
  });

  it("accepts a leap day and a same-day work period", async () => {
    await insertRevision({ period_start: "2024-02-29", period_end: "2024-02-29" });
  });

  it("enforces one log per engagement and unique references", async () => {
    const insert = (engagementId: string, ref: string) => env.DB.prepare(
      "INSERT INTO engagement_log (id, ref, engagement_id, freelancer_id, client_id, anchor_kind, anchor_date) VALUES (?, ?, ?, ?, ?, 'completed', '2026-10-14')",
    ).bind(crypto.randomUUID(), ref, engagementId, fixture.freelancerId, fixture.clientId).run();
    await expect(insert(fixture.engagementId, "FL-second")).rejects.toThrow(/unique constraint/i);
    const other = await seedLog();
    const original = await env.DB.prepare("SELECT ref FROM engagement_log WHERE id = ?").bind(fixture.logId).first<{ ref: string }>();
    await expect(env.DB.prepare("UPDATE engagement_log SET ref = ? WHERE id = ?").bind(original!.ref, other.logId).run())
      .rejects.toThrow(/unique constraint/i);
  });

  it("keeps revision numbers unique within a log and requires a positive integer", async () => {
    await insertRevision();
    await expect(insertRevision()).rejects.toThrow(/unique constraint/i);
    for (const rev_no of [0, -1, 1.5]) await expect(insertRevision({ rev_no })).rejects.toThrow(/constraint/i);
    await insertRevision({ rev_no: 2, kind: "filer_update" });
  });

  it("requires real foreign keys and blocks parent deletion with retained children", async () => {
    await expect(insertRevision({ log_id: "missing" })).rejects.toThrow(/foreign key constraint/i);
    await expect(insertRevision({ submitted_by: "missing" })).rejects.toThrow(/foreign key constraint/i);
    const revisionId = await insertRevision();
    await env.DB.prepare("UPDATE engagement_log SET current_revision_id = ? WHERE id = ?").bind(revisionId, fixture.logId).run();
    await expect(env.DB.prepare("DELETE FROM log_revision WHERE id = ?").bind(revisionId).run()).rejects.toThrow(/foreign key constraint/i);
    await expect(env.DB.prepare("DELETE FROM engagement_log WHERE id = ?").bind(fixture.logId).run()).rejects.toThrow(/foreign key constraint/i);
    await expect(env.DB.prepare("DELETE FROM user WHERE id = ?").bind(fixture.freelancerId).run()).rejects.toThrow(/foreign key constraint/i);
  });

  it("allows a Positive rating with Late Payment and rejects invented or duplicate tags (H-16)", async () => {
    const id = await insertRevision();
    const tag = (value: string) => env.DB.prepare("INSERT INTO log_tag (revision_id, tag) VALUES (?, ?)").bind(id, value).run();
    await tag("Late Payment");
    await tag("Clear Scope");
    await expect(tag("Late Payment")).rejects.toThrow(/unique constraint/i);
    await expect(tag("Trustworthy")).rejects.toThrow(/check constraint/i);
    expect(await env.DB.prepare("SELECT rating, outcome FROM log_revision WHERE id = ?").bind(id).first())
      .toEqual({ rating: 4, outcome: "positive" });
  });

  it("keeps a log's freelancer and client equal to its engagement's parties", async () => {
    const other = await seedLog();
    const insert = (freelancerId: string, clientId: string) => env.DB.prepare(
      "INSERT INTO engagement_log (id, ref, engagement_id, freelancer_id, client_id, anchor_kind, anchor_date) VALUES (?, ?, ?, ?, ?, 'completed', '2026-10-14')",
    ).bind(crypto.randomUUID(), `FL-${crypto.randomUUID()}`, other.engagementId, freelancerId, clientId).run();
    await env.DB.prepare("DELETE FROM engagement_log WHERE id = ?").bind(other.logId).run();
    await expect(insert(other.freelancerId, fixture.clientId)).rejects.toThrow(/foreign key constraint/i);
    await expect(insert(fixture.freelancerId, other.clientId)).rejects.toThrow(/foreign key constraint/i);
    await expect(env.DB.prepare("UPDATE engagement_log SET client_id = ? WHERE id = ?").bind(other.clientId, fixture.logId).run())
      .rejects.toThrow(/foreign key constraint/i);
    await insert(other.freelancerId, other.clientId);
  });

  it("rejects selecting another log's revision as the current publication", async () => {
    const revisionId = await insertRevision();
    const other = await seedLog();
    await expect(env.DB.prepare("UPDATE engagement_log SET current_revision_id = ? WHERE id = ?").bind(revisionId, other.logId).run())
      .rejects.toThrow(/foreign key constraint/i);
  });

  it("INV-5 schema permits the rating without additional reputation fields", async () => {
    const tables = [engagementLog, logRevision, logTag, proofFile];
    for (const table of tables) {
      for (const column of Object.values(getTableColumns(table))) {
        expect(column.name).not.toMatch(/score|rank|leaderboard|endorsement|trust/i);
      }
    }
    const columns = await env.DB.prepare("PRAGMA table_info(log_revision)").all<{ name: string }>();
    expect(columns.results.some(({ name }) => name === "rating")).toBe(true);
    expect(columns.results.some(({ name }) => /score|rank|leaderboard|endorsement|trust/i.test(name))).toBe(false);
  });
});

describe("PRD-F3 proof metadata foundation", () => {
  async function insertProof(overrides: Record<string, string | number | null> = {}) {
    const row = {
      id: crypto.randomUUID(), log_id: fixture.logId, revision_id: null, owner_kind: "filer",
      uploaded_by: fixture.freelancerId, object_key: `logs/${fixture.logId}/${crypto.randomUUID()}`,
      kind: "invoice", mime: "application/pdf", size_bytes: 100, sha256: "a".repeat(64), ...overrides,
    };
    const columns = Object.keys(row);
    await env.DB.prepare(`INSERT INTO proof_file (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
      .bind(...Object.values(row)).run();
    return row;
  }

  it("permits an uploading proof before binding it to a revision", async () => {
    const proof = await insertProof();
    expect(await env.DB.prepare("SELECT revision_id, status FROM proof_file WHERE id = ?").bind(proof.id).first())
      .toEqual({ revision_id: null, status: "uploading" });
    const revisionId = await insertRevision();
    await env.DB.prepare("UPDATE proof_file SET revision_id = ?, status = 'attached' WHERE id = ?").bind(revisionId, proof.id).run();
    await expect(env.DB.prepare("DELETE FROM log_revision WHERE id = ?").bind(revisionId).run()).rejects.toThrow(/foreign key constraint/i);
  });

  it.each([0, -1, 1.5, 10485761])("rejects invalid size %s", async (size_bytes) => {
    await expect(insertProof({ size_bytes })).rejects.toThrow(/check constraint/i);
  });

  it("accepts the exact 10 MiB limit", async () => { await insertProof({ size_bytes: 10485760 }); });

  it.each([
    { owner_kind: "stranger" }, { kind: "government_id" }, { mime: "text/html" }, { status: "public" },
  ])("rejects unsupported proof metadata %j", async (overrides) => {
    const metadata: Partial<Record<"owner_kind" | "kind" | "mime" | "status", string>> = overrides;
    await expect(insertProof(metadata)).rejects.toThrow(/check constraint/i);
  });

  it("requires unique object keys and existing log, revision, and uploader", async () => {
    const proof = await insertProof();
    await expect(insertProof({ object_key: proof.object_key })).rejects.toThrow(/unique constraint/i);
    for (const field of ["log_id", "revision_id", "uploaded_by"]) {
      await expect(insertProof({ [field]: "missing" })).rejects.toThrow(/foreign key constraint/i);
    }
  });

  it("rejects binding proof metadata to another log's revision", async () => {
    const other = await seedLog();
    const revisionId = await insertRevision({ log_id: other.logId });
    await expect(insertProof({ revision_id: revisionId })).rejects.toThrow(/foreign key constraint/i);
  });
});
