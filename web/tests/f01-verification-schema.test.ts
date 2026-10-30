import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db";
import { auditEvent, freelancerProfile, moderationCase, user, verificationCase } from "@/server/db/schema";

const db = createDb(env.DB);
async function seed() {
  const owner = crypto.randomUUID(), reviewer = crypto.randomUUID(), id = crypto.randomUUID();
  await db.insert(user).values([
    { id: owner, name: "Owner Name", email: `${owner}@example.invalid`, role: "freelancer" },
    { id: reviewer, name: "Reviewer", email: `${reviewer}@example.invalid`, role: "moderator" },
  ]);
  await db.insert(freelancerProfile).values({ userId: owner, displayName: "Owner Name", status: "pending" });
  await db.insert(verificationCase).values({ id, freelancerId: owner, createdAt: "2026-10-01T00:00:00.000Z" });
  return { id, owner, reviewer };
}
const inspection = { id_kind: "passport", result: "pass", name_match: 1, inspected_at: "2026-10-02T00:00:00.000Z" };
type DatabasePatch = Record<string, string | number | null>;
async function patch(id: string, fields: DatabasePatch) {
  // Test fixtures deliberately bypass the handler for database constraint coverage.
  return env.DB.prepare(`UPDATE verification_case SET ${Object.keys(fields).map((key) => `${key} = ?`).join(",")} WHERE id = ?`).bind(...Object.values(fields), id).run();
}

describe("PRD-F1/F4 direct D1 constraints", () => {
  it("partial inspection and invalid method/kind/result/name-match/times cannot be stored", async () => {
    const f = await seed();
    const full = { reviewer_id: f.reviewer, ...inspection };
    for (const key of Object.keys(full)) {
      await expect(patch(f.id, { ...full, [key]: null })).rejects.toThrow();
      await expect(patch(f.id, { [key]: full[key as keyof typeof full] })).rejects.toThrow();
    }
    const invalidPatches: DatabasePatch[] = [{ method: "qr" }, { id_kind: "other" }, { result: "unknown" }, { name_match: 2 }, { name_match: 0.5 }, { name_match: "text" }, { inspected_at: "2026-09-30T00:00:00.000Z" }];
    for (const changes of invalidPatches) {
      await expect(patch(f.id, { ...full, ...changes })).rejects.toThrow();
    }
    expect((await db.query.verificationCase.findFirst({ where: eq(verificationCase.id, f.id) }))?.reviewerId).toBeNull();
    await expect(patch(f.id, full)).resolves.toBeDefined();
  });

  it("partial decision, blank reasons and approval without valid evidence fail; reasoned uninspected rejection is valid", async () => {
    const f = await seed();
    const invalidPatches: DatabasePatch[] = [
      { decision: "reject" }, { reason: "Reason only" }, { decided_at: "2026-10-03T00:00:00.000Z" },
      { decision: "approve", reason: "Checked", decided_at: "2026-10-03T00:00:00.000Z" },
      { decision: "reject", reason: "\t\n", decided_at: "2026-10-03T00:00:00.000Z" },
      { decision: "reject", reason: "   ", decided_at: "2026-10-03T00:00:00.000Z" },
      { decision: "ask_changes", reason: "Wrong kind", decided_at: "2026-10-03T00:00:00.000Z" },
      { decision: "reject", reason: "Earlier than request", decided_at: "2026-09-30T00:00:00.000Z" },
    ];
    for (const changes of invalidPatches) await expect(patch(f.id, changes)).rejects.toThrow();
    await patch(f.id, { decision: "reject", reason: "Incomplete live review", decided_at: "2026-10-03T00:00:00.000Z" });
    await expect(patch(f.id, { reason: "Changed history" })).rejects.toThrow();
    await expect(db.delete(verificationCase).where(eq(verificationCase.id, f.id))).rejects.toThrow();
  });

  it("approval cannot use fail, mismatch or a decision time before inspection", async () => {
    for (const override of [{ result: "fail" }, { name_match: 0 }, { inspected_at: "2026-10-04T00:00:00.000Z" }]) {
      const f = await seed();
      await patch(f.id, { reviewer_id: f.reviewer, ...inspection, ...override });
      await expect(patch(f.id, { decision: "approve", reason: "Checked", decided_at: "2026-10-03T00:00:00.000Z" })).rejects.toThrow();
    }
  });

  it("one open request per owner and one queue per kind/subject; decided evidence stays immutable", async () => {
    const f = await seed();
    await expect(db.insert(verificationCase).values({ id: crypto.randomUUID(), freelancerId: f.owner })).rejects.toThrow();
    const reviewId = crypto.randomUUID();
    await db.insert(moderationCase).values({ id: reviewId, kind: "verification", subjectId: f.id });
    await expect(db.insert(moderationCase).values({ id: crypto.randomUUID(), kind: "verification", subjectId: f.id })).rejects.toThrow();
    await expect(db.update(moderationCase).set({ subjectId: "replacement" }).where(eq(moderationCase.id, reviewId))).rejects.toThrow();
    await patch(f.id, { reviewer_id: f.reviewer, ...inspection, decision: "approve", reason: "Checked", decided_at: "2026-10-03T00:00:00.000Z" });
    await expect(patch(f.id, { result: "fail" })).rejects.toThrow();
    await expect(db.insert(verificationCase).values({ id: crypto.randomUUID(), freelancerId: f.owner })).resolves.toBeDefined();
  });

  it("review state/kind decision checks and audit append-only protections hold at D1 boundary", async () => {
    const f = await seed();
    for (const row of [
      { status: "invalid" }, { status: "claimed" }, { status: "open", claimedBy: f.reviewer },
      { status: "claimed", claimedBy: f.reviewer, claimedUntil: "2026-10-01T00:30:00.000Z", decision: "approve" },
      { status: "decided", decision: "approve", reason: "Checked", decidedAt: "2026-10-01T00:30:00.000Z" },
      { status: "decided", decision: "ask_changes", reason: "Wrong kind", decidedBy: f.reviewer, decidedAt: "2026-10-01T00:30:00.000Z" },
      { status: "decided", decision: "approve", reason: " ", decidedBy: f.reviewer, decidedAt: "2026-10-01T00:30:00.000Z" },
    ]) {
      // Invalid enum values are intentional direct SQL attacks, beyond TypeScript.
      await expect(env.DB.prepare(`INSERT INTO moderation_case(id,kind,subject_id,status,claimed_by,claimed_until,decision,reason,decided_by,decided_at) VALUES (?,'verification',?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), crypto.randomUUID(), row.status, "claimedBy" in row ? row.claimedBy : null, "claimedUntil" in row ? row.claimedUntil : null, "decision" in row ? row.decision : null, "reason" in row ? row.reason : null, "decidedBy" in row ? row.decidedBy : null, "decidedAt" in row ? row.decidedAt : null).run()).rejects.toThrow();
    }
    const id = crypto.randomUUID();
    await db.insert(moderationCase).values({ id, kind: "verification", subjectId: f.id, status: "decided", decision: "reject", reason: "Review grounds", decidedBy: f.reviewer, decidedAt: "2026-10-03T00:00:00.000Z" });
    await expect(db.update(moderationCase).set({ reason: "Changed history" }).where(eq(moderationCase.id, id))).rejects.toThrow();
    await expect(db.delete(moderationCase).where(eq(moderationCase.id, id))).rejects.toThrow();
    const eventId = crypto.randomUUID();
    await db.insert(auditEvent).values({ id: eventId, actorId: f.reviewer, action: "verification_decided", subjectType: "verification_case", subjectId: f.id });
    await expect(db.update(auditEvent).set({ action: "forged" }).where(eq(auditEvent.id, eventId))).rejects.toThrow();
    await expect(db.delete(auditEvent).where(eq(auditEvent.id, eventId))).rejects.toThrow();
    const columns = await env.DB.prepare("PRAGMA table_info(audit_event)").all<{ name: string }>();
    expect(columns.results.map((c) => c.name)).toEqual(["id", "actor_id", "action", "subject_type", "subject_id", "created_at"]);
  });
});
