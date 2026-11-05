import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDb, type Db } from "@/server/db";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { loadClientRecord, loadOwnClientRecordId, searchClientNames } from "@/server/db/queries/records";
import { ClientRecordView } from "@/features/records/record-view";
import { EMPTY_RECORD, recordPage } from "@/features/records/model";
import type { Role } from "@/server/db/schema";

const binding = env.MIGRATION_DB;
const db = createDb(binding);
const run = (sql: string, ...args: (string | number | null)[]) => binding.prepare(sql).bind(...args).run();
const stamp = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const through8 = env.TEST_MIGRATIONS.filter(m => m.name < "0009");
// Query-only historical snapshots: seed content before the initial-intake
// guard and synthetic review receipts before the new review guards. Then apply
// ALL migrations before reads. Actual publication actions have separate coverage;
// no production migration manufactures review receipts for legacy publications.
const withoutReview = new Set<string>();
async function seal() {
  await applyD1Migrations(binding, env.TEST_MIGRATIONS.filter(m => m.name < "0011"));
  const revisions = await binding.prepare(`SELECT r.id,r.log_id,r.kind,r.decision,r.decided_by,r.decided_at
    FROM log_revision r WHERE r.decision IN ('approve','correct') AND r.decided_by IS NOT NULL AND julianday(r.decided_at) IS NOT NULL`)
    .all<{ id: string; log_id: string; kind: string; decision: string; decided_by: string; decided_at: string }>();
  for (const r of revisions.results) {
    if (withoutReview.has(r.log_id)) continue;
    const caseId = `record-case-${r.id}`, roundId = `record-round-${r.id}`;
    const proof = await binding.prepare("SELECT id,sha256 FROM proof_file WHERE log_id=? AND owner_kind='filer' ORDER BY id LIMIT 1")
      .bind(r.log_id).first<{ id: string; sha256: string }>();
    if (!proof) continue;
    await run(`INSERT INTO moderation_case(id,kind,subject_id,status,decision,reason,decided_by,decided_at,log_id,closed_at,closure_kind)
      VALUES(?,?,?,'decided',?,'PRIVATE-CASE-REASON',?,?,?,?,'decision')`, caseId,
    r.kind === "correction" ? "correction" : r.kind === "filer_update" ? "filer_update" : "log", r.id, r.decision, r.decided_by, r.decided_at, r.log_id, r.decided_at);
    await run(`INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at)
      VALUES(?,?,1,?,?,?,'PRIVATE-ROUND-REASON',?)`, roundId, caseId, r.id, r.decided_by, r.decision, r.decided_at);
    await run("INSERT OR IGNORE INTO revision_proof(revision_id,proof_id) VALUES(?,?)", r.id, proof.id);
    await run(`INSERT INTO proof_review(id,round_id,proof_id,proof_sha256,verdict,reason,reviewed_at)
      VALUES(?,?,?,?,'accepted','PRIVATE-PROOF-VERDICT',?)`, `record-review-${r.id}`, roundId, proof.id, proof.sha256, r.decided_at);
  }
  await applyD1Migrations(binding, env.TEST_MIGRATIONS);
}

async function actor(id: string, role: Role | null, onboarded = true) {
  await run("INSERT INTO user(id,name,email,role) VALUES(?,?,?,?)", id, `Synthetic ${id}`, `${id}@example.invalid`, role);
  if (onboarded) for (const policy of requiredPolicies(role)) {
    await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)", `${id}-${policy}`, id, policy, POLICY_VERSIONS[policy]);
  }
}

async function client(id: string, name = "Synthetic Studio") {
  await actor(`user-${id}`, "client");
  await run("INSERT INTO client_profile(id,user_id,display_name,kind,city,registration_no) VALUES(?,?,?,'business','Synthetic city','PRIVATE-REGISTRATION')", id, `user-${id}`, name);
}

type Publication = {
  filer?: string; clientId?: string; rating?: number; status?: string; publishedAt?: string | null;
  expiresAt?: string | null; decision?: string | null; decidedAt?: string | null; decidedBy?: string | null;
  kind?: string; pointer?: boolean; tags?: string[]; facts?: string;
};
async function publication(ref: string, options: Publication = {}) {
  const { filer = "f1", clientId = "c", rating = 4, status = "published", publishedAt = stamp(-2),
    expiresAt = stamp(300), decision = "approve", decidedAt = stamp(-2), decidedBy = "moderator",
    kind = "initial", pointer = true, tags = ["Professional"], facts = `Approved synthetic facts for ${ref}; the agreed invoice was paid.` } = options;
  const id = `log-${ref}`, rev = `rev-${ref}`, engagementId = `eng-${ref}`;
  await run("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,?,'Private engagement title','Private client hint','2026-01-01',?,?)", engagementId, filer, `hash-${ref}`, stamp(10));
  await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'client_consent',?)", `consent-${ref}`, `user-${clientId}`, POLICY_VERSIONS.client_consent);
  await run("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)", engagementId, `consent-${ref}`);
  await run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date,status,published_at,expires_at,first_submitted_at) VALUES(?,?,?,?,?,'completed','2026-01-02',?,?,?,?)", id, ref, engagementId, filer, clientId, status, publishedAt, expiresAt, status === "draft" ? null : stamp(-3));
  await run(`INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by,decision,decided_at,decided_by,reason)
    VALUES(?,?,1,?,?,?,?, '2026-01-01','2026-01-02',?,?,?,?,'PRIVATE-REVIEW-REASON')`,
  rev, id, kind, rating, rating <= 2 ? "negative" : rating === 3 ? "mixed" : "positive", facts, filer, decision, decidedAt, decidedBy);
  for (const tag of tags) await run("INSERT INTO log_tag(revision_id,tag) VALUES(?,?)", rev, tag);
  await run(`INSERT INTO proof_file(id,log_id,revision_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,status)
    VALUES(?,?,?,'filer',?,?,'invoice','application/pdf',10,?,'attached')`, `proof-${ref}`, id, rev, filer, `synthetic-record-proof-${ref}`, "a".repeat(64));
  if (pointer) await run("UPDATE engagement_log SET current_revision_id=? WHERE id=?", rev, id);
  return { id, rev, engagementId };
}

beforeEach(async () => {
  withoutReview.clear();
  await reset();
  await applyD1Migrations(binding, through8);
  await actor("reader", "freelancer"); // Verification is required to file, not read.
  await actor("moderator", "moderator");
  await actor("admin", "admin");
  await actor("stale", "freelancer", false);
  await actor("unselected", null);
  await actor("banned", "freelancer");
  await run("UPDATE user SET banned=1 WHERE id='banned'");
  for (let i = 1; i <= 6; i++) {
    await actor(`f${i}`, "freelancer");
    await run("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES(?,?,'verified')", `f${i}`, `Synthetic filer ${i}`);
  }
  await client("c");
  await client("other", "Other client");
});

describe("PRD-F6/F14 current-schema private client records (real D1)", () => {
  it("does not promote a legacy publication with no genuine recorded review evidence", async () => {
    const legacy = await publication("FL-1000");
    withoutReview.add(legacy.id);
    await seal();
    expect((await loadClientRecord(db, "reader", "c"))?.publishedLogCount).toBe(0);
  });
  it.each([null, "missing", "banned", "stale", "unselected", "user-other", "moderator", "admin"])("denies record and search for %s", async id => {
    await publication("FL-1000");
    await seal();
    expect(await loadClientRecord(db, id, "c")).toBeNull();
    expect(await searchClientNames(db, id, "Synthetic")).toEqual([]);
  });

  it("permits an onboarded freelancer without verification and the named client only", async () => {
    await publication("FL-1000");
    await seal();
    expect((await loadClientRecord(db, "reader", "c"))?.average).toBe("4.0");
    expect((await loadClientRecord(db, "user-c", "c"))?.average).toBe("4.0");
    expect(await searchClientNames(db, "user-c", "Synthetic")).toEqual([]);
    expect(await loadOwnClientRecordId(db, "user-c")).toBe("c");
    expect(await loadOwnClientRecordId(db, "reader")).toBeNull();
    expect(await loadOwnClientRecordId(db, null)).toBeNull();
  });

  it("rechecks ban and role after an earlier authorized read", async () => {
    await publication("FL-1000");
    await seal();
    expect(await loadClientRecord(db, "reader", "c")).not.toBeNull();
    await run("UPDATE user SET banned=1 WHERE id='reader'");
    expect(await loadClientRecord(db, "reader", "c")).toBeNull();
    expect(await searchClientNames(db, "reader", "Synthetic")).toEqual([]);
    await run("UPDATE user SET banned=0 WHERE id='reader'");
    await run("UPDATE user SET role=NULL WHERE id='reader'");
    expect(await loadClientRecord(db, "reader", "c")).toBeNull();
    expect(await searchClientNames(db, "reader", "Synthetic")).toEqual([]);
    await run("UPDATE user SET banned=1 WHERE id='user-c'");
    expect(await loadClientRecord(db, "user-c", "c")).toBeNull();
    expect(await loadOwnClientRecordId(db, "user-c")).toBeNull();
  });

  it.each(["privacy", "terms", "freelancer_ack"] as const)("denies stale %s without mutating append-only acceptances", async stalePolicy => {
    await actor("old-policy-reader", "freelancer", false);
    for (const policy of requiredPolicies("freelancer")) await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)",
      `old-${policy}`, "old-policy-reader", policy, policy === stalePolicy ? "old" : POLICY_VERSIONS[policy]);
    await seal();
    expect(await loadClientRecord(db, "old-policy-reader", "c")).toBeNull();
    expect(await searchClientNames(db, "old-policy-reader", "Synthetic")).toEqual([]);
  });

  it.each(["privacy", "terms"] as const)("denies a named client with stale %s", async stalePolicy => {
    await actor("old-policy-client", "client", false);
    for (const policy of requiredPolicies("client")) await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)",
      `old-client-${policy}`, "old-policy-client", policy, policy === stalePolicy ? "old" : POLICY_VERSIONS[policy]);
    await run("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES('old-client','old-policy-client','Synthetic old client','individual')");
    await seal();
    expect(await loadClientRecord(db, "old-policy-client", "old-client")).toBeNull();
    expect(await loadOwnClientRecordId(db, "old-policy-client")).toBeNull();
  });

  it("denies a revocation immediately before the single snapshot read executes", async () => {
    await publication("FL-1000");
    await seal();
    let reads = 0;
    const client = new Proxy(binding, { get(target, key) {
      if (key === "prepare") return (sql: string) => {
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(stmt, method) {
          if (method === "bind") return (...args: Parameters<D1PreparedStatement["bind"]>) => wrap(stmt.bind(...args));
          if (method === "first") return async (...args: Parameters<D1PreparedStatement["first"]>) => {
            reads++;
            await run("UPDATE user SET banned=1 WHERE id='reader'");
            return stmt.first(...args);
          };
          const value = Reflect.get(stmt, method); return typeof value === "function" ? value.bind(stmt) : value;
        } });
        return wrap(target.prepare(sql));
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const gatedDb: Db = new Proxy(db, { get(target, key, receiver) { return key === "$client" ? client : Reflect.get(target, key, receiver); } });
    expect(await loadClientRecord(gatedDb, "reader", "c")).toBeNull();
    expect(reads).toBe(1);
  });

  it("uses literal escaped names, separate identity links, and accepted engagement counts", async () => {
    await client("duplicate", "Synthetic Studio");
    await client("literal", "100%_\\ Studio's");
    await publication("FL-1000");
    await publication("FL-1001", { clientId: "duplicate", status: "hidden" });
    await run("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES('declined','f1','Private','Synthetic Studio','2026-01-01','declined',?)", stamp(10));
    await run("UPDATE engagement SET status='declined',declined_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='declined'");
    await seal();
    const matches = await searchClientNames(db, "reader", "sYNThetic sTUDIO");
    expect(matches).toEqual([{ id: "c", name: "Synthetic Studio", kind: "business", city: "Synthetic city", engagementCount: 1 },
      { id: "duplicate", name: "Synthetic Studio", kind: "business", city: "Synthetic city", engagementCount: 1 }]);
    expect(await searchClientNames(db, "reader", "%_\\")).toEqual([{ id: "literal", name: "100%_\\ Studio's", kind: "business", city: "Synthetic city", engagementCount: 0 }]);
    expect(await searchClientNames(db, "reader", "Studio's")).toHaveLength(1);
    expect(await searchClientNames(db, "reader", "' OR 1=1 --")).toEqual([]);
    for (const invalid of ["", "  ", "x".repeat(101), "a\u0000b", ["Synthetic"], null]) expect(await searchClientNames(db, "reader", invalid)).toEqual([]);
  });

  it("bounds search pages and uses a stable name/id cursor without merging equal names", async () => {
    for (let i = 0; i < 51; i++) await client(`page-${String(i).padStart(2, "0")}`, "Synthetic repeated name");
    await seal();
    const first = await searchClientNames(db, "reader", "Synthetic repeated name");
    const second = await searchClientNames(db, "reader", "Synthetic repeated name", first[49].id);
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map(row => row.id)).size).toBe(51);
    expect(await searchClientNames(db, "reader", "Synthetic", "' OR 1=1")).toEqual([]);
    expect(await searchClientNames(db, "reader", "Synthetic", "missing")).toEqual([]);
  }, 20000);

  it("shows the exact empty state without a score or Limited record", async () => {
    await seal();
    const record = await loadClientRecord(db, "reader", "c");
    expect(record).toMatchObject({ average: null, contributorCount: 0, limited: false, publishedLogCount: 0, logs: [], tags: [], outcomes: { negative: 0, mixed: 0, positive: 0 } });
    const html = renderToStaticMarkup(createElement(ClientRecordView, { record: record! }));
    expect(html).toContain(EMPTY_RECORD);
    expect(html).not.toMatch(/average rating|Limited record|\/ 5|stars|safe/i);
  });

  it.each(["draft", "pending", "ask_changes", "rejected", "hidden", "withdrawn", "expired"])("excludes %s and falls back to the older eligible contribution", async status => {
    await publication("FL-1000", { rating: 2, publishedAt: stamp(-10), tags: ["Late Payment"] });
    await publication("FL-1001", { rating: 5, status, publishedAt: stamp(-1), tags: ["Professional"] });
    await seal();
    expect(await loadClientRecord(db, "reader", "c")).toMatchObject({ average: "2.0", contributorCount: 1, publishedLogCount: 1,
      outcomes: { negative: 1, mixed: 0, positive: 0 }, tags: [{ tag: "Late Payment", count: 1 }], logs: [{ ref: "FL-1000" }] });
  });

  it.each([null, "ask_changes", "reject", "withdraw", "uphold"])("excludes active revision decision %s", async decision => {
    await publication("FL-1000", { decision });
    await seal();
    expect((await loadClientRecord(db, "reader", "c"))?.publishedLogCount).toBe(0);
  });

  it.each([
    { publishedAt: null }, { publishedAt: "invalid" }, { publishedAt: "245" },
    { publishedAt: "2026-02-30T00:00:00.000Z" }, { publishedAt: stamp(1) },
    { expiresAt: null }, { expiresAt: "invalid" }, { expiresAt: stamp(-1) },
    { decidedAt: null }, { decidedAt: "invalid" }, { decidedAt: stamp(1) }, { decidedBy: null }, { pointer: false },
  ])("excludes missing, invalid or future eligibility metadata %j", async options => {
    await publication("FL-1000", options);
    await seal();
    expect((await loadClientRecord(db, "reader", "c"))?.average).toBeNull();
  });

  it("expires at the exact deadline and keeps an unexpired record without waiting for cleanup", async () => {
    const expired = await publication("FL-1000", { rating: 1 });
    await run("UPDATE engagement_log SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),hold_kind='legal',hold_placed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", expired.id);
    await publication("FL-1001", { rating: 5, expiresAt: stamp(1) });
    await seal();
    expect(await loadClientRecord(db, "reader", "c")).toMatchObject({ average: "5.0", publishedLogCount: 1, logs: [{ ref: "FL-1001" }] });
  });

  it("selects latest eligible per contributor, ties by ref ASC, while counting every eligible log", async () => {
    const sameTime = stamp(-2);
    await publication("FL-1002", { rating: 5, publishedAt: sameTime, tags: ["Professional", "Late Payment"] });
    await publication("FL-1001", { rating: 2, publishedAt: sameTime, tags: ["Late Payment"] });
    await publication("FL-1000", { rating: 4, publishedAt: stamp(-10), tags: ["Clear Scope"] });
    await publication("FL-1003", { filer: "f2", rating: 3, tags: ["Responsive"] });
    await publication("FL-1004", { filer: "f3", clientId: "other", rating: 5 });
    await seal();
    const record = await loadClientRecord(db, "reader", "c");
    expect(record).toMatchObject({ average: "2.5", contributorCount: 2, limited: true, publishedLogCount: 4,
      outcomes: { negative: 1, mixed: 1, positive: 2 } });
    expect(record!.logs.filter(l => l.publishedAt === sameTime).map(l => l.ref)).toEqual(["FL-1001", "FL-1002"]);
    expect(record!.tags).toContainEqual({ tag: "Late Payment", count: 2 });
  });

  it.each([1, 4, 5])("shows %i contributors, a one-decimal average, and Limited record only below five", async count => {
    for (let i = 1; i <= count; i++) await publication(`FL-${1000 + i}`, { filer: `f${i}`, rating: i });
    await seal();
    const record = await loadClientRecord(db, "reader", "c");
    expect(record).toMatchObject({ contributorCount: count, average: ((count + 1) / 2).toFixed(1), limited: count < 5 });
    const html = renderToStaticMarkup(createElement(ClientRecordView, { record: record! }));
    expect(html.includes("Limited record")).toBe(count < 5);
  });

  it.each([
    { latest: "published", older: "published", fifth: true, average: "3.0", count: 5 },
    { latest: "published", older: "published", fifth: false, average: "2.5", count: 4 },
    { latest: "hidden", older: "published", fifth: true, average: "3.8", count: 5 },
    { latest: "hidden", older: "withdrawn", fifth: true, average: "3.5", count: 4 },
  ])("matches H-32/S-45 independent fixture %j", async ({ latest, older, fifth, average, count }) => {
    await publication("FL-1000", { filer: "f1", rating: 5, publishedAt: stamp(-10), status: older });
    await publication("FL-1001", { filer: "f1", rating: 1, publishedAt: stamp(-1), status: latest });
    await publication("FL-1002", { filer: "f2", rating: 4 });
    await publication("FL-1003", { filer: "f3", rating: 3 });
    await publication("FL-1004", { filer: "f4", rating: 2 });
    if (fifth) await publication("FL-1005", { filer: "f5", rating: 5 });
    await seal();
    expect(await loadClientRecord(db, "reader", "c")).toMatchObject({ average, contributorCount: count, limited: count < 5 });
  });

  it("uses only the active approved revision and dates; excludes pending and prior content and all private fields", async () => {
    const log = await publication("FL-1000", { rating: 1, facts: "PRIVATE-SUPERSEDED-FACTS", tags: ["Non-Payment"] });
    await run(`INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by,decision,decided_by,decided_at,reason)
      VALUES('approved-update',?,2,'filer_update',4,'positive','Payment was received after the approved dated update.','2026-01-01','2026-01-02','f1','approve','moderator',?,'PRIVATE-UPDATE-REASON')`, log.id, stamp(-1));
    await run("INSERT INTO log_tag(revision_id,tag) VALUES('approved-update','Late Payment')");
    await run(`INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by)
      VALUES('pending-update',?,3,'filer_update',5,'positive','PRIVATE-PENDING-FACTS','2026-01-01','2026-01-02','f1')`, log.id);
    await run("UPDATE engagement_log SET current_revision_id='approved-update' WHERE id=?", log.id);
    await run(`INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,status)
      VALUES('private-proof',?,'client','user-c','PRIVATE-PROOF-OBJECT','other','application/pdf',10,?,'attached')`, log.id, "a".repeat(64));
    await seal();
    const record = await loadClientRecord(db, "reader", "c");
    expect(record).toMatchObject({ average: "4.0", tags: [{ tag: "Late Payment", count: 1 }], logs: [{ rating: 4, facts: "Payment was received after the approved dated update.", tags: ["Late Payment"] }] });
    expect(record!.logs[0].updateApprovedAt).not.toBeNull();
    const serialized = JSON.stringify(record) + renderToStaticMarkup(createElement(ClientRecordView, { record: record! }));
    expect(serialized).not.toMatch(/PRIVATE-|example\.invalid|registration|object_key|decidedBy|reason|proof|counter|engagementId|freelancer_id|\/logs\//i);
  });

  it("accepts an approved correction without exposing old facts", async () => {
    await publication("FL-1000", { kind: "correction", decision: "correct", rating: 3 });
    await seal();
    expect(await loadClientRecord(db, "reader", "c")).toMatchObject({ average: "3.0", outcomes: { negative: 0, mixed: 1, positive: 0 } });
  });

  it("enforces same-log active revision ownership and rejects malformed record IDs", async () => {
    const first = await publication("FL-1000");
    const second = await publication("FL-1001");
    await expect(run("UPDATE engagement_log SET current_revision_id=? WHERE id=?", second.rev, first.id)).rejects.toThrow(/FOREIGN KEY/i);
    await seal();
    for (const id of ["missing", "../c", "c' OR 1=1", "x".repeat(101)]) expect(await loadClientRecord(db, "reader", id)).toBeNull();
  });

  it("paginates logs while keeping complete contributor/outcome/tag counts", async () => {
    const publishedAt = stamp(-2);
    for (let i = 1; i <= 21; i++) await publication(`FL-${1000 + i}`, { rating: 4, publishedAt });
    await seal();
    const first = await loadClientRecord(db, "reader", "c");
    const second = await loadClientRecord(db, "reader", "c", 2);
    expect(first).toMatchObject({ publishedLogCount: 21, contributorCount: 1, average: "4.0", pageCount: 2, outcomes: { positive: 21 }, tags: [{ tag: "Professional", count: 21 }] });
    expect(first!.logs).toHaveLength(20);
    expect(second!.logs.map(l => l.ref)).toEqual(["FL-1021"]);
    expect((await loadClientRecord(db, "reader", "c", -1))?.page).toBe(1);
    expect((await loadClientRecord(db, "reader", "c", 100000))?.page).toBe(1);
    for (const value of [undefined, ["2"], "0", "-1", "2.5", "100000", "1 OR 1=1"]) expect(recordPage(value)).toBe(1);
    expect(recordPage("2")).toBe(2);
  });
});
