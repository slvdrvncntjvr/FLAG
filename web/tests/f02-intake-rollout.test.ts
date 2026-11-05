import { applyD1Migrations, createExecutionContext, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLICY_VERSIONS } from "@/lib/policies";
import { createDb } from "@/server/db";
import { loadViewer } from "@/server/db/queries/viewer";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { saveDraftAction, submitLogAction, removeProofAction } from "@/features/logs/actions";
import { POST } from "@/app/api/logs/[id]/proofs/route";
import { GET } from "@/app/api/proofs/[id]/route";
import EngagementLog from "@/app/(app)/engagements/[id]/log/page";
import PrivateLogPage from "@/app/(app)/logs/[id]/page";
import Engagements from "@/app/(app)/engagements/page";
import Home from "@/app/(app)/home/page";
import { intakeFixture, pdfBytes, uploadRequest } from "./private-intake-fixtures";

// Only framework/session entry points are replaced. Domain, queries, migrations
// and storage below execute against actual isolated Workers D1/R2 bindings.
const mocks = vi.hoisted(() => ({ context: vi.fn(), viewer: vi.fn(), getDb: vi.fn(), revalidate: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.context }));
vi.mock("@/server/auth/guards", () => ({ getViewer: mocks.viewer, requireVerifiedFreelancer: mocks.viewer, viewerOrRedirect: mocks.viewer }));
vi.mock("@/server/db", async original => ({ ...await original<typeof import("@/server/db")>(), getDb: mocks.getDb }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not-found"); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("next/link", () => ({ default: ({ href, children }: PropsWithChildren<{ href: string }>) => createElement("a", { href }, children) }));
vi.mock("@/features/logs/forms", async original => ({
  ...await original<typeof import("@/features/logs/forms")>(),
  // Next's client-action serialization is outside this composition test. Keep
  // the actual ProofList; stub only the interactive editing component boundary.
  DraftWorkspace: () => createElement("form", null, "Draft editing workspace"),
  DraftForm: () => createElement("form", null, "New draft form"),
}));
vi.mock("@/features/engagements/forms", () => ({
  CreateEngagementForm: () => createElement("form", null, "Create an engagement"),
  CancelInviteForm: () => createElement("form", null, "Cancel invitation"),
}));

const baseline = env.MIGRATION_DB;
const through8 = env.TEST_MIGRATIONS.filter(m => m.name < "0009");
function setting(value?: unknown, bindings: object = env) {
  mocks.context.mockResolvedValue({ env: { ...bindings, PRIVATE_INTAKE_ENABLED: value }, cf: undefined, ctx: createExecutionContext() });
}
function form(fields: Record<string, string | string[]>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const entry of Array.isArray(value) ? value : [value]) result.append(key, entry);
  return result;
}
function draftForm(engagementId = "e", logId?: string) {
  return form({ engagementId, ...(logId ? { logId } : {}), anchorKind: "completed", anchorDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
    rating: "4", tags: ["Professional"], facts: "The synthetic project was delivered and its invoice was paid.", periodStart: "2026-01-01", periodEnd: "2026-01-02", amountCentavos: "" });
}
function upload(logId: string, tamper = false) {
  const request = uploadRequest();
  request.headers.set("origin", "https://flag.invalid");
  if (tamper) {
    request.headers.set("PRIVATE_INTAKE_ENABLED", "true");
    request.headers.set("x-private-intake-enabled", "true");
  }
  return { request, params: { params: Promise.resolve({ id: logId }) } };
}

async function baselineFixture() {
  await reset();
  await applyD1Migrations(baseline, through8);
  const run = (sql: string, ...args: (string | number)[]) => baseline.prepare(sql).bind(...args).run();
  for (const [id, role] of [["f", "freelancer"], ["c", "client"], ["m", "moderator"], ["outsider", "freelancer"], ["admin", "admin"], ["banned", "moderator"], ["stale", "moderator"]]) {
    await run("INSERT INTO user(id,name,email,role,banned) VALUES(?,'Synthetic user',?,?,?)", id, `${id}@example.invalid`, role, id === "banned" ? 1 : 0);
    for (const policy of ["privacy", "terms", ...(role === "freelancer" ? ["freelancer_ack"] as const : [])] as const) {
      if (id !== "stale") await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)", `${id}-${policy}`, id, policy, POLICY_VERSIONS[policy]);
    }
  }
  await run("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('f','Synthetic filer','verified')");
  await run("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES('cp','c','Synthetic client','individual')");
  for (const id of ["e", "no-log"]) {
    await run("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,'f','Synthetic project','Synthetic client','2026-01-01',?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))", id, `hash-${id}`);
    await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,'c','client_consent',?)", `consent-${id}`, POLICY_VERSIONS.client_consent);
    await run("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)", id, `consent-${id}`);
  }
  await run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date) VALUES('l','FL-1042','e','f','cp','completed',date('now','+8 hours'))");
  await run("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by) VALUES('r','l',1,'initial',4,'positive','The synthetic project was delivered and its invoice was paid.','2026-01-01','2026-01-02','f')");
  await run("INSERT INTO log_tag(revision_id,tag) VALUES('r','Professional')");
  const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes));
  const hex = Array.from(checksum, b => b.toString(16).padStart(2, "0")).join("");
  await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256) VALUES('p','l','filer','f','logs/l/p','invoice','application/pdf',?,?)", pdfBytes.length, hex);
  await env.PROOFS.put("logs/l/p", pdfBytes, { sha256: hex, httpMetadata: { contentType: "application/pdf" } });
  const db = createDb(baseline);
  mocks.getDb.mockResolvedValue(db);
  mocks.viewer.mockResolvedValue(await loadViewer(db, "f"));
  return db;
}
async function snapshot() {
  const schema = (await baseline.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const rows: Record<string, unknown> = {};
  for (const table of schema.filter(row => row.type === "table")) rows[String(table.name)] = (await baseline.prepare(`SELECT * FROM "${String(table.name).replaceAll('"', '""')}"`).all()).results.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const objects = (await env.PROOFS.list()).objects.map(object => ({ key: object.key, size: object.size, etag: object.etag }));
  return { schema, rows, objects };
}

beforeEach(() => { vi.clearAllMocks(); setting(); });

describe("server-owned private intake setting", () => {
  it.each([undefined, null, false, true, "", "false", "TRUE", "True", " true", "true ", "true\n", "1", 1, { enabled: true }])("keeps malformed or absent value %j disabled", async value => {
    setting(value);
    expect(await isPrivateIntakeEnabled()).toBe(false);
  });
  it("enables only the exact runtime string, without retaining a previous request's value", async () => {
    setting("true"); expect(await isPrivateIntakeEnabled()).toBe(true);
    setting(); expect(await isPrivateIntakeEnabled()).toBe(false);
  });
  it("fails closed on unavailable context or an unreadable setting", async () => {
    mocks.context.mockRejectedValueOnce(new Error("unavailable"));
    expect(await isPrivateIntakeEnabled()).toBe(false);
    mocks.context.mockResolvedValueOnce({ env: Object.defineProperty({}, "PRIVATE_INTAKE_ENABLED", { get() { throw new Error("unreadable"); } }) });
    expect(await isPrivateIntakeEnabled()).toBe(false);
  });
  it("does not fall back to process or public settings", async () => {
    vi.stubEnv("PRIVATE_INTAKE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PRIVATE_INTAKE_ENABLED", "true");
    try { setting(); expect(await isPrivateIntakeEnabled()).toBe(false); }
    finally { vi.unstubAllEnvs(); }
  });
});

describe("disabled private intake on the actual 0008 schema", () => {
  beforeEach(baselineFixture);

  it("rejects valid new/edit/save/submit/remove and direct upload without domain, parsing, DB or R2 effects", async () => {
    const before = await snapshot();
    expect((await baseline.prepare("SELECT id,status,client_id FROM engagement ORDER BY id").all()).results).toEqual([
      { id: "e", status: "accepted", client_id: "cp" }, { id: "no-log", status: "accepted", client_id: "cp" },
    ]);
    expect((await baseline.prepare("PRAGMA table_info(engagement_log)").all()).results.map(row => row.name)).not.toContain("draft_updated_at");
    expect((await baseline.prepare("PRAGMA table_info(proof_file)").all()).results.map(row => row.name)).not.toContain("purge_inflight");
    expect((await baseline.prepare("SELECT name FROM d1_migrations ORDER BY name").all()).results).toHaveLength(9);
    for (const value of [undefined, "false", "TRUE", "true ", true, null]) {
      setting(value);
      expect(await saveDraftAction({ engagementId: "no-log" }, null, draftForm("no-log"))).toMatchObject({ ok: false, code: "unavailable" });
      expect(await saveDraftAction({ engagementId: "e", logId: "l" }, null, draftForm("e", "l"))).toMatchObject({ ok: false, code: "unavailable" });
      expect(await submitLogAction("l", null, form({ logId: "l" }))).toMatchObject({ ok: false, code: "unavailable" });
      expect(await removeProofAction("l", "p", null, form({ logId: "l", proofId: "p" }))).toMatchObject({ ok: false, code: "unavailable" });
      const { request, params } = upload("l", true);
      const reader = vi.spyOn(request.body!, "getReader");
      expect((await POST(request, params)).status).toBe(503);
      expect(reader).not.toHaveBeenCalled(); expect(request.bodyUsed).toBe(false);
    }
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
    expect(new Uint8Array(await (await env.PROOFS.get("logs/l/p"))!.arrayBuffer())).toEqual(pdfBytes);
  });

  it("does not accept client form/query/header enablement or stale rendered forms", async () => {
    const before = await snapshot();
    const stale = draftForm("e", "l"); stale.set("PRIVATE_INTAKE_ENABLED", "true");
    stale.set("NEXT_PUBLIC_PRIVATE_INTAKE_ENABLED", "true");
    expect(await saveDraftAction({ engagementId: "e", logId: "l" }, { ok: true, data: { logId: "l", ref: "FL-1042" } }, stale)).toMatchObject({ ok: false });
    const request = new Request("https://flag.invalid/api/logs/l/proofs?PRIVATE_INTAKE_ENABLED=true", { method: "POST", headers: { origin: "https://flag.invalid", "x-private-intake-enabled": "true" }, body: uploadRequest().body });
    expect((await POST(request, { params: Promise.resolve({ id: "l" }) })).status).toBe(503);
    mocks.context.mockRejectedValue(new Error("unreadable runtime configuration"));
    expect(await submitLogAction("l", null, form({ logId: "l" }))).toMatchObject({ ok: false });
    expect((await POST(upload("l").request, upload("l").params)).status).toBe(503);
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
  });

  it("closes direct creation before intake queries and keeps existing drafts read-only", async () => {
    await expect(EngagementLog({ params: Promise.resolve({ id: "no-log" }) })).rejects.toThrow("not-found");
    expect(mocks.getDb).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(await PrivateLogPage({ params: Promise.resolve({ id: "l" }) }));
    expect(html).toContain("FL-1042"); expect(html).toContain("Written facts");
    expect(html).toContain('/api/proofs/p'); expect(html).not.toContain("Draft editing workspace");
    expect(html).not.toContain("Submit private log"); expect(html).not.toContain("Remove proof");
    mocks.context.mockRejectedValue(new Error("unreadable"));
    expect(renderToStaticMarkup(await PrivateLogPage({ params: Promise.resolve({ id: "l" }) }))).toContain('/api/proofs/p');
  });

  it("retains engagement/account UI and existing log links without creation prompts", async () => {
    const html = renderToStaticMarkup(await Engagements({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/logs/l"'); expect(html).toContain("Create an engagement");
    expect(html).not.toContain('href="/engagements/no-log/log"'); expect(html).not.toContain("Create private log");
    const home = renderToStaticMarkup(await Home());
    expect(home).toContain('href="/engagements"'); expect(home).toContain('href="/verification"');
    expect(home).not.toContain("create or view a private engagement log");
    // Positive control: the exact same accepted relationship is eligible when
    // the server explicitly enables it; no 0009 write is performed here.
    setting("true");
    expect(renderToStaticMarkup(await Engagements({ searchParams: Promise.resolve({}) }))).toContain('href="/engagements/no-log/log"');
    expect(renderToStaticMarkup(await EngagementLog({ params: Promise.resolve({ id: "no-log" }) }))).toContain("New draft form");
  });

  it("preserves actual party/moderator reads and denies outsider, bare admin, ban and stale-policy reads", async () => {
    const db = createDb(baseline), before = await snapshot();
    let reads = 0;
    const proofs = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "get") return async (...args: Parameters<R2Bucket["get"]>) => { reads++; return target.get(...args); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    setting("false", { ...env, PROOFS: proofs });
    for (const id of ["f", "c", "m"]) {
      mocks.viewer.mockResolvedValue(await loadViewer(db, id));
      const html = renderToStaticMarkup(await PrivateLogPage({ params: Promise.resolve({ id: "l" }) }));
      expect(html).toContain("FL-1042"); expect(html).toContain('/api/proofs/p');
      const response = await GET(new Request("https://flag.invalid/api/proofs/p"), { params: Promise.resolve({ id: "p" }) });
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="proof-p.pdf"');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    }
    expect(reads).toBe(3);
    for (const id of ["outsider", "admin", "banned", "stale"]) {
      mocks.viewer.mockResolvedValue(await loadViewer(db, id));
      await expect(PrivateLogPage({ params: Promise.resolve({ id: "l" }) })).rejects.toThrow("not-found");
      expect((await GET(new Request("https://flag.invalid/api/proofs/p"), { params: Promise.resolve({ id: "p" }) })).status).toBe(404);
    }
    mocks.viewer.mockResolvedValue(null);
    expect((await GET(new Request("https://flag.invalid/api/proofs/p"), { params: Promise.resolve({ id: "p" }) })).status).toBe(404);
    expect(reads).toBe(3);
    expect(await snapshot()).toEqual(before);
  });

  it("retains authentication and upload origin checks while closed", async () => {
    mocks.viewer.mockResolvedValue(null);
    expect(await submitLogAction("l", null, form({ logId: "l" }))).toMatchObject({ ok: false, code: "forbidden" });
    expect((await POST(upload("l").request, upload("l").params)).status).toBe(404);
    mocks.viewer.mockResolvedValue(await loadViewer(createDb(baseline), "f"));
    const badOrigin = upload("l"); badOrigin.request.headers.set("origin", "https://evil.invalid");
    expect((await POST(badOrigin.request, badOrigin.params)).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

describe("explicit synthetic opt-in on 0009", () => {
  beforeEach(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); setting("true"); });

  it("retains enabled edit/upload/remove/submit paths and only reaches pending", async () => {
    const f = await intakeFixture(); mocks.getDb.mockResolvedValue(f.db); mocks.viewer.mockResolvedValue(await loadViewer(f.db, f.freelancerId));
    const edit = draftForm(f.engagementId, f.logId); edit.set("periodStart", f.input.periodStart); edit.set("periodEnd", f.input.periodEnd);
    expect(await saveDraftAction({ engagementId: f.engagementId, logId: f.logId }, null, edit)).toMatchObject({ ok: true });
    let incoming = upload(f.logId), response = await POST(incoming.request, incoming.params);
    expect(response.status).toBe(201);
    const first = await response.json() as { data: { proofId: string } };
    expect(await removeProofAction(f.logId, first.data.proofId, null, form({ logId: f.logId, proofId: first.data.proofId }))).toMatchObject({ ok: true });
    incoming = upload(f.logId); response = await POST(incoming.request, incoming.params); expect(response.status).toBe(201);
    expect(await submitLogAction(f.logId, null, form({ logId: f.logId }))).toMatchObject({ ok: true });
    expect(await env.DB.prepare("SELECT status,current_revision_id,published_at FROM engagement_log WHERE id=?").bind(f.logId).first()).toEqual({ status: "pending", current_revision_id: null, published_at: null });
  });

  it("does not interrupt safe compensation when an accepted upload's setting later closes", async () => {
    const f = await intakeFixture(); mocks.getDb.mockResolvedValue(f.db); mocks.viewer.mockResolvedValue(await loadViewer(f.db, f.freelancerId));
    const proofs = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => { await target.put(...args); setting("false"); throw new Error("synthetic response loss"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    setting("true", { ...env, PROOFS: proofs });
    const incoming = upload(f.logId); expect((await POST(incoming.request, incoming.params)).status).toBe(503);
    const row = await env.DB.prepare("SELECT object_key,status FROM proof_file WHERE log_id=?").bind(f.logId).first<{ object_key: string; status: string }>();
    expect(row!.status).toBe("purged"); expect(await env.PROOFS.head(row!.object_key)).toBeNull();
    expect(await isPrivateIntakeEnabled()).toBe(false);
  });
});
