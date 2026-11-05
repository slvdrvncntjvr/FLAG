import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@/server/db";
import { auditEvent, clientProfile, engagement, engagementConsent, freelancerProfile, policyAcceptance, user } from "@/server/db/schema";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { acceptInvitation } from "@/features/engagements/handlers";
import { acceptEngagement } from "@/features/engagements/actions";
import { loadInviteForClient } from "@/server/db/queries/engagements";
import { assessPrivacyRequest, executePrivacyRequest, recordPrivacyRequest } from "@/features/privacy/handlers";

const mocks = vi.hoisted(() => ({ db: vi.fn(), viewer: vi.fn(), cookieHash: "", cookieSet: vi.fn() }));
vi.mock("@/server/db", async importOriginal => ({ ...await importOriginal<typeof import("@/server/db")>(), getDb: mocks.db }));
vi.mock("@/server/auth/guards", () => ({ requireViewer: mocks.viewer, getViewer: mocks.viewer, requireVerifiedFreelancer: mocks.viewer }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.cookieHash }), set: mocks.cookieSet }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

const db = createDb(env.DB);
const firstProfile = { consent: "on", associate: "on", displayName: "Profile A", kind: "individual", city: "Quezon City" };
async function fixture() {
  const owner = crypto.randomUUID(), client = crypto.randomUUID();
  await db.insert(user).values([
    { id: owner, name: "Freelancer", email: `${owner}@example.invalid`, role: "freelancer" },
    { id: client, name: "Client", email: `${client}@example.invalid`, role: "client" },
  ]);
  await db.insert(freelancerProfile).values({ userId: owner, displayName: "Freelancer", status: "verified" });
  await db.insert(policyAcceptance).values(requiredPolicies("client").map(policy => ({
    id: crypto.randomUUID(), userId: client, policy, version: POLICY_VERSIONS[policy],
  })));
  const invites = Array.from({ length: 2 }, () => ({ id: crypto.randomUUID(), hash: crypto.randomUUID().replaceAll("-", "").repeat(2) }));
  await db.insert(engagement).values(invites.map(i => ({ id: i.id, freelancerId: owner, title: "Work", clientNameHint: "Client", startedOn: "2026-10-01",
    inviteTokenHash: i.hash, inviteExpiresAt: new Date(Date.now() + 86400000).toISOString() })));
  return { client, invites };
}
// Model a legitimate concurrent assessed erasure, with production guards active.
async function eraseUnassociatedProfile(subject: string, profileId: string) {
  const admin = crypto.randomUUID(), iso = (delta: number) => new Date(Date.now() + delta).toISOString();
  await db.insert(user).values({ id: admin, name: "Synthetic privacy operator", email: `${admin}@example.invalid`, role: "admin" });
  await db.insert(policyAcceptance).values(requiredPolicies("admin").map(policy => ({ id: crypto.randomUUID(), userId: admin, policy, version: POLICY_VERSIONS[policy] })));
  const request = await recordPrivacyRequest(db, admin, { subjectUserId: subject, responsibleId: admin, kind: "deletion", receivedAt: iso(-1000), dueAt: iso(86400000) });
  expect(request.ok).toBe(true);
  if (!request.ok || !request.id) throw new Error("Synthetic erasure request failed");
  expect(await assessPrivacyRequest(db, admin, request.id, {
    identity: { method: "non_id_control", evidenceReference: "synthetic-profile-control", verifiedSubjectId: subject, verifiedAt: iso(-1000) },
    targets: [{ targetType: "client_profile", targetId: profileId, operation: "purge", basis: "assessed_erasure", dueAt: iso(-1000) }],
    categories: [{ category: "identity", disposition: "remove", basis: "Synthetic unassociated profile erasure", until: iso(86400000) }], backups: "unverified",
  })).toEqual({ ok: true });
  expect(await executePrivacyRequest(db, env, admin, request.id)).toMatchObject({ ok: true });
  expect(await db.query.clientProfile.findFirst({ where: eq(clientProfile.id, profileId) })).toBeUndefined();
}
async function snapshot() {
  return {
    profiles: await db.select().from(clientProfile).orderBy(clientProfile.id),
    invites: await db.select().from(engagement).orderBy(engagement.id),
    acceptances: await db.select().from(policyAcceptance).orderBy(policyAcceptance.id),
    receipts: await db.select().from(engagementConsent).orderBy(engagementConsent.engagementId),
    audits: await db.select().from(auditEvent).orderBy(auditEvent.id),
  };
}

describe("profile-bound consent transaction", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.db.mockResolvedValue(db); });
  it.each([undefined, "", "   "])("new profile with missing/blank city %j is rejected before any acceptance writes", async city => {
    const { client, invites: [a] } = await fixture(), before = await snapshot();
    const fields = { ...firstProfile, city };
    if (city === undefined) delete fields.city;
    const batch = vi.spyOn(db.$client, "batch");
    try {
      expect(await acceptInvitation(db, client, a.hash, fields, null)).toMatchObject({ ok: false });
      expect(batch).not.toHaveBeenCalled();
    } finally { batch.mockRestore(); }
    expect(await snapshot()).toEqual(before);
  });

  it.each([undefined, "", "   "])("the actual new-profile action rejects missing/blank city %j without writes or clearing the invite", async city => {
    const { client, invites: [a] } = await fixture(), before = await snapshot();
    mocks.viewer.mockResolvedValue({ id: client });
    mocks.cookieHash = a.hash;
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...firstProfile, engagementId: a.id })) {
      if (key !== "city") data.set(key, value);
    }
    if (city !== undefined) data.set("city", city);
    expect(await acceptEngagement(null, null, data)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("new-profile acceptance persists trimmed city while registration remains optional", async () => {
    const { client, invites: [a] } = await fixture();
    expect(await acceptInvitation(db, client, a.hash, { ...firstProfile, city: "  Quezon City  " }, null)).toEqual({ ok: true });
    const profile = await db.query.clientProfile.findFirst({ where: eq(clientProfile.userId, client) });
    expect(profile).toMatchObject({ displayName: firstProfile.displayName, city: "Quezon City", registrationNo: null });
    expect((await snapshot()).invites.find(i => i.id === a.id)).toMatchObject({ status: "accepted", clientId: profile!.id });
  });

  it.each(["Profile B", "Profile A"])("stale expected absence rejects an intervening %s without losing writes", async displayName => {
    const { client, invites: [a, b] } = await fixture();
    expect(await acceptInvitation(db, client, b.hash, { ...firstProfile, displayName, kind: "business" }, null)).toEqual({ ok: true });
    const before = await snapshot();
    expect(await acceptInvitation(db, client, a.hash, firstProfile, null)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
  });

  it("simultaneous first-profile forms across invites have one winner and zero loser effects", async () => {
    const { client, invites } = await fixture(), before = await snapshot();
    const results = await Promise.all(invites.map((invite, i) => acceptInvitation(db, client, invite.hash,
      { ...firstProfile, displayName: i ? "Profile B" : "Profile A", kind: i ? "business" : "individual" }, null)));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    const after = await snapshot(), winner = results.findIndex(r => r.ok), loser = 1 - winner;
    expect(after.profiles).toHaveLength(before.profiles.length + 1);
    expect(after.acceptances).toHaveLength(before.acceptances.length + 1);
    expect(after.receipts).toHaveLength(before.receipts.length + 1);
    expect(after.audits).toEqual(before.audits);
    expect(after.invites.find(i => i.id === invites[loser].id)).toEqual(before.invites.find(i => i.id === invites[loser].id));
    const profile = await db.query.clientProfile.findFirst({ where: eq(clientProfile.userId, client) });
    expect(profile?.displayName).toBe(winner ? "Profile B" : "Profile A");
  });

  it.each([undefined, "", "bad id!", 12, {}, "different-profile"])("missing/malformed/altered expectation %j cannot write", async expected => {
    const { client, invites: [a] } = await fixture(), before = await snapshot();
    expect(await acceptInvitation(db, client, a.hash, firstProfile, expected)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
  });

  it.each(["absent", "replaced", "other-account"])("expected existing profile that is %s fails inside the transaction", async change => {
    const { client, invites: [a] } = await fixture(), expected = crypto.randomUUID();
    if (change !== "absent") await db.insert(clientProfile).values({ id: change === "replaced" ? crypto.randomUUID() : expected,
      userId: change === "other-account" ? (await fixture()).client : client, displayName: "Same Name", kind: "business" });
    const before = await snapshot();
    expect(await acceptInvitation(db, client, a.hash, { consent: "on", associate: "on" }, expected)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
  });

  it("existing-profile acceptance never ignores submitted profile fields", async () => {
    const { client, invites: [a] } = await fixture(), id = crypto.randomUUID();
    await db.insert(clientProfile).values({ id, userId: client, displayName: "Profile B", kind: "business" });
    const before = await snapshot();
    expect(await acceptInvitation(db, client, a.hash, firstProfile, id)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
  });

  it.each([["kind", "individual"], ["city", "Quezon City"], ["registrationNo", "business-42"]])("the actual action never silently drops an isolated submitted %s field", async (key, value) => {
    const { client, invites: [a] } = await fixture(), id = crypto.randomUUID();
    await db.insert(clientProfile).values({ id, userId: client, displayName: "Profile B", kind: "business" });
    mocks.viewer.mockResolvedValue({ id: client });
    mocks.cookieHash = a.hash;
    const before = await snapshot(), data = new FormData();
    for (const [name, field] of Object.entries({ engagementId: a.id, consent: "on", associate: "on", [key]: value })) data.set(name, field);
    expect(await acceptEngagement(id, null, data)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it.each(["removed", "replaced"])("the actual action rejects an expected profile %s between its SELECT and transaction", async change => {
    const { client, invites: [a] } = await fixture(), id = crypto.randomUUID();
    await db.insert(clientProfile).values({ id, userId: client, displayName: "Profile A", kind: "individual" });
    mocks.viewer.mockResolvedValue({ id: client });
    mocks.cookieHash = a.hash;
    let before: Awaited<ReturnType<typeof snapshot>>;
    mocks.db.mockResolvedValueOnce(db).mockImplementationOnce(async () => {
      // matchesRenderedInvite has completed its live SELECT. Change the
      // displayed profile before acceptInvitation executes its atomic batch.
      await eraseUnassociatedProfile(client, id);
      if (change === "replaced") await db.insert(clientProfile).values({ id: crypto.randomUUID(), userId: client, displayName: "Profile A", kind: "business" });
      before = await snapshot();
      return db;
    });
    const data = new FormData();
    for (const [key, value] of Object.entries({ engagementId: a.id, consent: "on", associate: "on" })) data.set(key, value);
    expect(await acceptEngagement(id, null, data)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before!);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("actual actions reject stale tab A with A's cookie restored, then reload confirms B for fresh explicit association", async () => {
    const { client, invites: [a, b] } = await fixture();
    mocks.viewer.mockResolvedValue({ id: client });
    function form(id: string, fields: Record<string, string>) {
      const data = new FormData();
      data.set("engagementId", id);
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    }
    const staleA = acceptEngagement.bind(null, null);
    const dataA = form(a.id, firstProfile);
    mocks.cookieHash = b.hash;
    await expect(acceptEngagement(null, null, form(b.id, { ...firstProfile, displayName: "Profile B", kind: "business" })))
      .rejects.toThrow("redirect:/engagements?response=accepted");
    // Reopen A in the second tab, restoring the shared cookie to A before the
    // first tab submits its unchanged, server-bound expected-absence form.
    mocks.cookieHash = a.hash;
    mocks.cookieSet.mockClear();
    const before = await snapshot();
    expect(await staleA(null, dataA)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    const reloaded = await loadInviteForClient(db, client, a.hash);
    expect(reloaded?.profile).toMatchObject({ displayName: "Profile B", kind: "business" });
    const freshA = acceptEngagement.bind(null, reloaded!.profile!.id);
    await expect(freshA(null, form(a.id, { consent: "on", associate: "on" })))
      .rejects.toThrow("redirect:/engagements?response=accepted");
    const after = await snapshot();
    expect(after.profiles).toEqual(before.profiles);
    expect(after.receipts).toHaveLength(before.receipts.length + 1);
    expect(after.invites.find(i => i.id === a.id)?.clientId).toBe(reloaded!.profile!.id);
  });
});
