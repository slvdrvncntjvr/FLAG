import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createDb } from "@/server/db";
import { clientProfile, engagement, engagementConsent, freelancerProfile, policyAcceptance, user, type Role } from "@/server/db/schema";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { acceptInvitation, cancelInvitation, createInvitation, declineInvitation } from "@/features/engagements/handlers";
import { hashInvite, INVITE_TTL_DAYS } from "@/features/engagements/schema";
import { loadInviteForClient, loadInviteLanding, loadOwnEngagements } from "@/server/db/queries/engagements";

const db = createDb(env.DB);
const input = { title: "Brand design", clientNameHint: "Private client hint", startedOn: "2026-10-01" };
const consent = { consent: "on", associate: "on", displayName: "Client Entered Name", kind: "individual", city: "Quezon City" };
async function actor(role: Role = "freelancer", status = "verified", current = true) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "Owner Name", email: `${id}@example.invalid`, role });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map(policy => ({ id: crypto.randomUUID(), userId: id, policy, version: current ? POLICY_VERSIONS[policy] : "old" })));
  if (role === "freelancer") await db.insert(freelancerProfile).values({ userId: id, displayName: "Inviting Freelancer", status: status as "verified" });
  return id;
}
async function invite(owner?: string) {
  owner ??= await actor();
  const result = await createInvitation(db, owner, input);
  if (!result.ok) throw new Error(result.message);
  const token = result.invitePath.split("/").at(-1)!;
  const hash = await hashInvite(token);
  const row = await db.query.engagement.findFirst({ where: eq(engagement.inviteTokenHash, hash) });
  return { owner, token, hash, id: row!.id };
}
async function snapshot() {
  return {
    engagements: await db.select().from(engagement).orderBy(engagement.id),
    profiles: await db.select().from(clientProfile).orderBy(clientProfile.id),
    acceptances: await db.select().from(policyAcceptance).orderBy(policyAcceptance.id),
    receipts: await db.select().from(engagementConsent).orderBy(engagementConsent.engagementId),
  };
}

describe("PRD-F9 real D1 invitation/consent workflow", () => {
  it("H-09: explicit client consent creates exactly one matching append-only receipt and account profile", async () => {
    const f = await invite(), client = await actor("client");
    const raw = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(f.id).first();
    expect(raw?.invite_token_hash).toBe(f.hash);
    expect(JSON.stringify(raw)).not.toContain(f.token);
    expect(Date.parse(String(raw?.invite_expires_at)) - Date.parse(String(raw?.created_at))).toBe(INVITE_TTL_DAYS * 86400000);
    expect(await loadInviteLanding(db, f.hash)).toEqual(expect.objectContaining({ inviter: "Inviting Freelancer", title: input.title, expired: false }));
    expect(JSON.stringify(await loadInviteLanding(db, f.hash))).not.toContain(input.clientNameHint);
    expect((await snapshot()).profiles).toHaveLength(0);
    expect(await acceptInvitation(db, client, f.hash, { ...consent, registrationNo: "CS201234567" })).toEqual({ ok: true });
    const [receipt] = await db.select().from(engagementConsent).where(eq(engagementConsent.engagementId, f.id));
    const acceptance = await db.query.policyAcceptance.findFirst({ where: eq(policyAcceptance.id, receipt.policyAcceptanceId) });
    const row = await db.query.engagement.findFirst({ where: eq(engagement.id, f.id) });
    const profile = await db.query.clientProfile.findFirst({ where: eq(clientProfile.userId, client) });
    expect(acceptance).toMatchObject({ userId: client, policy: "client_consent", version: POLICY_VERSIONS.client_consent });
    expect(row).toMatchObject({ status: "accepted", clientId: profile?.id, acceptedAt: acceptance?.acceptedAt, declinedAt: null });
    expect(profile).toMatchObject({ displayName: consent.displayName, city: consent.city, registrationNo: "CS201234567" });
    expect(await loadInviteLanding(db, f.hash)).toBeNull();
    expect(await loadInviteForClient(db, client, f.hash)).toBeNull();
    expect(await loadOwnEngagements(db, client)).toEqual([expect.objectContaining({ id: f.id, consentVersion: POLICY_VERSIONS.client_consent })]);
    expect(await loadOwnEngagements(db, await actor("client"))).toEqual([]);
    await expect(env.DB.prepare("UPDATE engagement_consent SET policy_acceptance_id=policy_acceptance_id WHERE engagement_id=?").bind(f.id).run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("DELETE FROM engagement_consent WHERE engagement_id=?").bind(f.id).run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("UPDATE engagement SET accepted_at='2026-01-01' WHERE id=?").bind(f.id).run()).rejects.toThrow(/closed/);
    await expect(env.DB.prepare("UPDATE client_profile SET user_id=? WHERE id=?").bind(await actor("client"), profile!.id).run()).rejects.toThrow(/immutable/);
    await expect(env.DB.prepare("DELETE FROM user WHERE id=?").bind(client).run()).rejects.toThrow();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("client profile reuse requires explicit association and never name-merges or edits an existing profile", async () => {
    const f = await invite(), client = await actor("client"), second = await actor("client");
    await db.insert(clientProfile).values([{ id: crypto.randomUUID(), userId: client, displayName: "Same Name", kind: "business" }, { id: crypto.randomUUID(), userId: second, displayName: "Same Name", kind: "individual" }]);
    const before = await snapshot();
    expect(await acceptInvitation(db, client, f.hash, { consent: "on" })).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(await acceptInvitation(db, client, f.hash, { consent: "on", associate: "on" })).toEqual({ ok: true });
    expect((await snapshot()).profiles).toEqual(before.profiles);
    const own = await loadOwnEngagements(db, second);
    expect(own).toEqual([]);
    const otherInvite = await invite();
    expect(await acceptInvitation(db, client, otherInvite.hash, { consent: "on", associate: "on" })).toEqual({ ok: true });
    const receipts = (await snapshot()).receipts.filter(r => [f.id, otherInvite.id].includes(r.engagementId));
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map(r => r.policyAcceptanceId)).size).toBe(2);
  });

  it("S-14: declining creates no client profile, consent receipt, log or negative signal", async () => {
    const f = await invite(), client = await actor("client"), before = await snapshot();
    expect(await declineInvitation(db, client, f.hash)).toEqual({ ok: true });
    const after = await snapshot();
    expect(after.profiles).toEqual(before.profiles);
    expect(after.acceptances).toEqual(before.acceptances);
    expect(after.receipts).toEqual(before.receipts);
    expect(await env.DB.prepare("SELECT status,client_id,accepted_at,declined_at FROM engagement WHERE id=?").bind(f.id).first()).toMatchObject({ status: "declined", client_id: null, accepted_at: null, declined_at: expect.any(String) });
    expect((await env.DB.prepare("SELECT * FROM engagement_log").all()).results).toEqual([]);
    expect(await loadOwnEngagements(db, client)).toEqual([]);
    expect(await acceptInvitation(db, client, f.hash, consent)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(after);
  });

  it("S-13: expired invites cannot accept/decline and expiry never invents a receipt", async () => {
    const owner = await actor(), client = await actor("client");
    const hash = await hashInvite("a".repeat(64));
    await db.insert(engagement).values({ id: "expired-invite", freelancerId: owner, ...input, inviteTokenHash: hash, inviteExpiresAt: "2026-01-15T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(await loadInviteLanding(db, hash)).toEqual({ expired: true });
    const before = await snapshot();
    expect(await acceptInvitation(db, client, hash, consent)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(await declineInvitation(db, client, hash)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
    expect(await loadOwnEngagements(db, owner)).toContainEqual(expect.objectContaining({ id: "expired-invite", status: "expired" }));
    for (const id of [owner, await actor("moderator"), await actor("client", "verified", false)]) {
      const state = await snapshot();
      expect(await declineInvitation(db, id, hash)).toMatchObject({ ok: false });
      expect(await acceptInvitation(db, id, hash, consent)).toMatchObject({ ok: false });
      expect(await snapshot()).toEqual(state);
    }
    expect((await snapshot()).profiles).toEqual(before.profiles);
    expect((await snapshot()).receipts).toEqual(before.receipts);
  });

  it.each(["unverified", "pending", "rejected", "suspended"])("NT-10/INV-8: %s freelancer cannot create", async status => {
    const id = await actor("freelancer", status), before = await snapshot();
    expect(await createInvitation(db, id, input)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
  });
  it.each(["client", "moderator", "admin"] as const)("wrong role %s cannot create or cancel an invite", async role => {
    const id = await actor(role), f = await invite(), before = await snapshot();
    expect(await createInvitation(db, id, input)).toMatchObject({ ok: false });
    expect(await cancelInvitation(db, id, f.id)).toMatchObject({ ok: false });
    expect(await acceptInvitation(db, id, f.hash, consent)).toMatchObject({ ok: role === "client" });
    if (role !== "client") expect(await snapshot()).toEqual(before);
  });
  it("NT-10: stale/banned accounts and anonymous/wrong-role writes are denied inside the write boundary", async () => {
    const stale = await actor("freelancer", "verified", false), f = await invite(), banned = await actor(), client = await actor("client", "verified", false);
    await db.update(user).set({ banned: true }).where(eq(user.id, banned));
    const before = await snapshot();
    for (const id of [stale, banned, null]) expect(await createInvitation(db, id, input)).toMatchObject({ ok: false });
    for (const id of [client, banned, f.owner, null]) {
      expect(await acceptInvitation(db, id, f.hash, consent)).toMatchObject({ ok: false });
      expect(await declineInvitation(db, id, f.hash)).toMatchObject({ ok: false });
    }
    expect(await snapshot()).toEqual(before);
    const validClient = await actor("client");
    await db.update(user).set({ banned: true }).where(eq(user.id, validClient));
    expect(await acceptInvitation(db, validClient, f.hash, consent)).toMatchObject({ ok: false });
    expect(await loadInviteForClient(db, validClient, f.hash)).toBeNull();
  });
  it("AB-15: the inviting user cannot accept or decline even if their role becomes client", async () => {
    const f = await invite();
    await db.update(user).set({ role: "client" }).where(eq(user.id, f.owner));
    const before = await snapshot();
    expect(await acceptInvitation(db, f.owner, f.hash, consent)).toMatchObject({ ok: false });
    expect(await declineInvitation(db, f.owner, f.hash)).toMatchObject({ ok: false });
    expect(await loadInviteForClient(db, f.owner, f.hash)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it("AB-14: concurrent acceptors and replays produce one matching consent/profile and no loser side effects", async () => {
    const f = await invite(), first = await actor("client"), second = await actor("client");
    const before = await snapshot();
    const responses = await Promise.all([acceptInvitation(db, first, f.hash, consent), acceptInvitation(db, second, f.hash, consent)]);
    expect(responses.filter(r => r.ok)).toHaveLength(1);
    const after = await snapshot();
    const profiles = after.profiles.filter(p => [first, second].includes(p.userId));
    expect(profiles).toHaveLength(1);
    expect(after.receipts).toHaveLength(before.receipts.length + 1);
    const pa = after.acceptances.find(p => p.policy === "client_consent" && [first, second].includes(p.userId))!;
    expect(pa).toBeDefined();
    for (const id of [first, second]) expect(await acceptInvitation(db, id, f.hash, consent)).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(after);
    expect(pa.userId).toBe(profiles[0].userId);
    expect(after.engagements.find(e => e.id === f.id)?.clientId).toBe(profiles[0].id);
    expect(after.engagements.find(e => e.id === f.id)?.acceptedAt).toBe(pa.acceptedAt);
  });
  it("acceptance racing cancellation or decline yields one terminal outcome without partial consent", async () => {
    for (const operation of ["cancel", "decline"] as const) {
      const f = await invite(), client = await actor("client");
      const responses = await Promise.all([acceptInvitation(db, client, f.hash, consent), operation === "cancel" ? cancelInvitation(db, f.owner, f.id) : declineInvitation(db, client, f.hash)]);
      expect(responses.filter(r => r.ok)).toHaveLength(1);
      const row = await db.query.engagement.findFirst({ where: eq(engagement.id, f.id) });
      const receipts = await db.select().from(engagementConsent).where(eq(engagementConsent.engagementId, f.id));
      expect(receipts).toHaveLength(row?.status === "accepted" ? 1 : 0);
    }
  });
  it("cancel is owner-only, terminal and creates no profile or receipt", async () => {
    const f = await invite(), other = await actor();
    expect(await cancelInvitation(db, other, f.id)).toMatchObject({ ok: false });
    expect(await cancelInvitation(db, f.owner, f.id)).toEqual({ ok: true });
    const after = await snapshot();
    expect(after.engagements.find(e => e.id === f.id)?.status).toBe("cancelled");
    expect(await cancelInvitation(db, f.owner, f.id)).toMatchObject({ ok: false });
    expect(await acceptInvitation(db, await actor("client"), f.hash, consent)).toMatchObject({ ok: false });
    expect((await snapshot()).receipts).toEqual(after.receipts);
    expect(await loadInviteLanding(db, f.hash)).toBeNull();
  });
  it("a real SQL failure after profile/policy writes rolls the whole D1 acceptance batch back", async () => {
    const f = await invite(), client = await actor("client"), before = await snapshot();
    await env.DB.prepare("CREATE TRIGGER f09_abort BEFORE INSERT ON engagement_consent BEGIN SELECT RAISE(ABORT,'injected'); END").run();
    try {
      expect(await acceptInvitation(db, client, f.hash, consent)).toMatchObject({ ok: false });
      expect(await snapshot()).toEqual(before);
    } finally { await env.DB.prepare("DROP TRIGGER f09_abort").run(); }
    expect(await acceptInvitation(db, client, f.hash, consent)).toEqual({ ok: true });
  });
  it("expiry between batch statements rolls back an already inserted profile instead of committing partial association", async () => {
    const owner = await actor(), client = await actor("client"), hash = await hashInvite("e".repeat(64));
    await db.insert(engagement).values({ id: "expiry-crossing", freelancerId: owner, ...input,
      inviteTokenHash: hash, inviteExpiresAt: "2026-01-15T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
    const before = await snapshot();
    const prepare = db.$client.prepare.bind(db.$client);
    let profileClockApplied = false;
    // Controlled SQL clock: first statement sees the instant before expiry;
    // every later statement/trigger sees actual time after expiry. Queries,
    // writes, triggers and rollback still execute in the real isolated D1.
    const clock = vi.spyOn(db.$client, "prepare").mockImplementation(query => {
      if (query.startsWith("INSERT INTO client_profile")) {
        profileClockApplied = true;
        query = query.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')", "'2026-01-14T23:59:59.999Z'");
      }
      return prepare(query);
    });
    try { expect(await acceptInvitation(db, client, hash, consent)).toMatchObject({ ok: false }); }
    finally { clock.mockRestore(); }
    expect(profileClockApplied).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
  it("DB consistency rejects unreceipted transition, wrong-policy receipt and consent reuse", async () => {
    const f = await invite(), client = await actor("client");
    await db.insert(clientProfile).values({ id: "consistency-client", userId: client, displayName: "Client", kind: "individual" });
    const privacy = (await db.select().from(policyAcceptance).where(eq(policyAcceptance.userId, client)))[0];
    await expect(db.insert(engagement).values({ id: crypto.randomUUID(), freelancerId: f.owner, clientId: "consistency-client", ...input,
      status: "accepted", acceptedAt: new Date().toISOString(), inviteTokenHash: crypto.randomUUID(), inviteExpiresAt: new Date(Date.now() + 86400000).toISOString() })).rejects.toThrow();
    await expect(env.DB.prepare("UPDATE engagement SET status='accepted',client_id='consistency-client',accepted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(f.id).run()).rejects.toThrow(/consent/);
    await expect(db.insert(engagementConsent).values({ engagementId: f.id, policyAcceptanceId: privacy.id })).rejects.toThrow();
    expect(await acceptInvitation(db, client, f.hash, { consent: "on", associate: "on" })).toEqual({ ok: true });
    const receipt = (await db.select().from(engagementConsent).where(eq(engagementConsent.engagementId, f.id)))[0], next = await invite();
    await expect(db.insert(engagementConsent).values({ engagementId: next.id, policyAcceptanceId: receipt.policyAcceptanceId })).rejects.toThrow();
    expect((await db.query.engagement.findFirst({ where: eq(engagement.id, next.id) }))?.status).toBe("invited");
  });
  it("creation quota is atomic, includes closed invitations and does not admit concurrent request eleven", async () => {
    const owner = await actor();
    for (let i = 0; i < 9; i++) await invite(owner);
    const results = await Promise.all([createInvitation(db, owner, input), createInvitation(db, owner, input)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    const first = (await db.select().from(engagement).where(eq(engagement.freelancerId, owner)))[0];
    expect(await cancelInvitation(db, owner, first.id)).toEqual({ ok: true });
    expect(await createInvitation(db, owner, input)).toMatchObject({ ok: false });
  });
  it("weekly quota counts invites older than a day and permits a different freelancer", async () => {
    const owner = await actor();
    const inserts = Array.from({ length: 30 }, (_, i) => db.insert(engagement).values({ id: crypto.randomUUID(), freelancerId: owner, ...input, inviteTokenHash: `weekly-${i}`, inviteExpiresAt: "2026-12-31T00:00:00.000Z", createdAt: new Date(Date.now() - 2 * 86400000).toISOString() }));
    await db.batch([inserts[0], ...inserts.slice(1)]);
    expect(await createInvitation(db, owner, input)).toMatchObject({ ok: false });
    expect(await createInvitation(db, await actor(), input)).toMatchObject({ ok: true });
  });
  it.each([
    { ...input, startedOn: "2026-02-30" }, { ...input, startedOn: "yesterday" }, { ...input, title: "x".repeat(161) },
    { ...input, clientNameHint: "data:image/png;base64,aGVsbG8=" }, { ...input, title: "1234-5678-9012-3456" }, { ...input, extra: "not allowed" },
  ])("invalid/abusive input creates no engagement: %j", async payload => {
    const before = await snapshot();
    expect(await createInvitation(db, await actor(), payload)).toMatchObject({ ok: false });
    expect((await snapshot()).engagements).toEqual(before.engagements);
  });
  it("missing consent/profile, malformed/oversized tokens and sensitive profile input leave no side effects", async () => {
    const f = await invite(), client = await actor("client"), before = await snapshot();
    for (const payload of [{ ...consent, consent: undefined }, { ...consent, associate: undefined }, { consent: "on", associate: "on" }, { ...consent, displayName: "ID number: 1234567890123456" }, { ...consent, actorId: f.owner }]) {
      expect(await acceptInvitation(db, client, f.hash, payload)).toMatchObject({ ok: false });
    }
    for (const hash of ["", "x".repeat(10000), "' OR 1=1", "A".repeat(64)]) {
      expect(await acceptInvitation(db, client, hash, consent)).toMatchObject({ ok: false });
      expect(await loadInviteLanding(db, hash)).toBeNull();
    }
    expect(await snapshot()).toEqual(before);
  });
});
