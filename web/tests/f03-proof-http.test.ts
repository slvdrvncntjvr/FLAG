import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { loadViewer } from "@/server/db/queries/viewer";
import { POST } from "@/app/api/logs/[id]/proofs/route";
import { GET } from "@/app/api/proofs/[id]/route";
import { addActor, intakeFixture, uploadRequest } from "./private-intake-fixtures";

vi.mock("@/server/auth/guards", () => ({ getViewer: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));
vi.mock("@/server/db", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/db")>();
  return { ...original, getDb: vi.fn() };
});

describe("proof HTTP route composition", () => {
  it("enforces route authentication/origin and composes real local D1/R2 upload/download", async () => {
    const f = await intakeFixture();
    vi.mocked(getDb).mockResolvedValue(f.db);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env, cf: undefined, ctx: createExecutionContext() });
    vi.mocked(getViewer).mockResolvedValue(null);
    expect((await POST(uploadRequest(), { params: Promise.resolve({ id: f.logId }) })).status).toBe(404);
    expect((await GET(new Request("https://flag.invalid"), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);
    vi.mocked(getViewer).mockResolvedValue(await loadViewer(f.db, f.freelancerId));
    const forbidden = uploadRequest(); forbidden.headers.set("origin", "https://evil.invalid");
    expect((await POST(forbidden, { params: Promise.resolve({ id: f.logId }) })).status).toBe(403);
    const missingOrigin = uploadRequest();
    expect((await POST(missingOrigin, { params: Promise.resolve({ id: f.logId }) })).status).toBe(403);
    const upload = uploadRequest(); upload.headers.set("origin", "https://flag.invalid");
    const response = await POST(upload, { params: Promise.resolve({ id: f.logId }) });
    expect(response.status).toBe(201);
    const body = await response.json() as { data: { proofId: string } };
    vi.mocked(getViewer).mockResolvedValue(await loadViewer(f.db, f.clientUserId));
    expect((await GET(new Request("https://flag.invalid"), { params: Promise.resolve({ id: body.data.proofId }) })).status).toBe(200);
    vi.mocked(getViewer).mockResolvedValue(await loadViewer(f.db, await addActor("admin")));
    expect((await GET(new Request("https://flag.invalid"), { params: Promise.resolve({ id: body.data.proofId }) })).status).toBe(404);
    vi.mocked(getDb).mockRejectedValue(new Error("synthetic database failure with private content"));
    const failed = await GET(new Request("https://flag.invalid"), { params: Promise.resolve({ id: body.data.proofId }) });
    expect(failed.status).toBe(404); expect(await failed.text()).not.toContain("private content");
  });
});
