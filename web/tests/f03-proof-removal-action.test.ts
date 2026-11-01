import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { removeProofAction } from "@/features/logs/actions";
import { saveLogDraft } from "@/features/logs/draft";
import { POLICY_VERSIONS } from "@/lib/policies";
import { addProof, intakeFixture } from "./private-intake-fixtures";

const mocks = vi.hoisted(() => ({ context: vi.fn(), viewer: vi.fn(), db: vi.fn(), revalidate: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.context }));
vi.mock("@/server/auth/guards", () => ({ requireVerifiedFreelancer: mocks.viewer }));
vi.mock("@/server/db", async original => ({ ...await original<typeof import("@/server/db")>(), getDb: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("proof removal action target binding", () => {
  it.each(["another owned log", "altered proof field", "altered log field"])("rejects %s without touching either draft or object", async kind => {
    const f = await intakeFixture(), proofId = await addProof(f);
    const engagementId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES(?,?,'Additional synthetic project','Synthetic client','2026-10-01',?,?)")
        .bind(engagementId, f.freelancerId, `hash-${engagementId}`, new Date(Date.now() + 86400000).toISOString()),
      env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'client_consent',?)")
        .bind(`consent-${engagementId}`, f.clientUserId, POLICY_VERSIONS.client_consent),
      env.DB.prepare("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES(?,?)")
        .bind(engagementId, `consent-${engagementId}`),
    ]);
    const saved = await saveLogDraft(f.db, f.freelancerId, { ...f.input, engagementId });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("Synthetic second draft failed");
    const other = { ...f, logId: saved.data.logId };
    const otherProof = await addProof(other);
    const logId = kind === "another owned log" ? other.logId : f.logId;
    const data = new FormData();
    data.set("logId", kind === "altered log field" ? other.logId : logId);
    data.set("proofId", kind === "altered proof field" ? otherProof : proofId);
    const snapshot = async () => Promise.all([
      env.DB.prepare("SELECT * FROM engagement_log WHERE id IN (?,?) ORDER BY id").bind(f.logId, other.logId).all(),
      env.DB.prepare("SELECT * FROM proof_file WHERE id IN (?,?) ORDER BY id").bind(proofId, otherProof).all(),
    ]).then(results => results.map(result => result.results));
    const before = await snapshot();
    const remove = vi.fn((key: string) => env.PROOFS.delete(key));
    const bucket = new Proxy(env.PROOFS, { get(target, key) {
      if (key === "delete") return remove;
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    mocks.context.mockResolvedValue({ env: { ...env, PROOFS: bucket, PRIVATE_INTAKE_ENABLED: "true" } });
    mocks.viewer.mockResolvedValue({ id: f.freelancerId });
    mocks.db.mockResolvedValue(f.db);
    mocks.revalidate.mockClear();
    expect(await removeProofAction(logId, proofId, null, data)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(await env.PROOFS.head(`logs/${f.logId}/${proofId}`)).not.toBeNull();
    expect(await env.PROOFS.head(`logs/${other.logId}/${otherProof}`)).not.toBeNull();
  });
});
