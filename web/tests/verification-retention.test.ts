import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { createDb } from "@/server/db";
import { submitVerification } from "@/features/verification/submit";
import { claimVerification, releaseVerification, inspectVerification, decideVerification } from "@/features/moderation/handlers";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { POLICY_VERSIONS } from "@/lib/policies";
import { addActor } from "./private-intake-fixtures";

const db = createDb(env.DB);
async function pending() {
  const subject = await addActor("freelancer"), mod = await addActor("moderator");
  await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'freelancer_ack',?)").bind(crypto.randomUUID(), subject, POLICY_VERSIONS.freelancer_ack).run();
  const r = await submitVerification(db, subject, { name: "Alex Rivera", city: "Manila", portfolioLinks: [{ url: "https://example.com/work" }] });
  if (!r.ok) throw new Error(`synthetic_verification: ${r.code}`);
  return { ...r, subject, mod };
}
const q = (sql: string, ...args: (string | number | null)[]) => env.DB.prepare(sql).bind(...args);

it("links all six event writers to the exact case and actual close clock, with independent subject isolation", async () => {
  const f = await pending(), other = await pending(), caseId = f.moderationCaseId;
  const first = await claimVerification(db, f.mod, { caseId });
  if (!first.ok) throw new Error("synthetic_claim");
  expect(await releaseVerification(db, f.mod, { caseId, expectedClaimUntil: first.claimUntil })).toEqual({ ok: true });
  const second = await claimVerification(db, f.mod, { caseId });
  if (!second.ok) throw new Error("synthetic_claim");
  // Expire only the synthetic lease; restore the production guard before reclaim.
  const guard = await q("SELECT sql FROM sqlite_schema WHERE name='pilot_case_update'").first<{ sql: string }>();
  await q("DROP TRIGGER pilot_case_update").run();
  try { await q("UPDATE moderation_case SET claimed_until='2000-01-01T00:00:00.000Z' WHERE id=?", caseId).run(); }
  finally { await q(guard!.sql).run(); }
  const reclaimed = await claimVerification(db, f.mod, { caseId });
  if (!reclaimed.ok) throw new Error("synthetic_reclaim");
  const lease = { caseId, expectedClaimUntil: reclaimed.claimUntil };
  expect(await inspectVerification(db, f.mod, { ...lease, idKind: "passport", result: "pass", nameMatch: true })).toEqual({ ok: true });
  const before = (await q("SELECT e.*,x.purge_due_at FROM audit_event e JOIN pilot_maintenance_target x ON x.target_type='audit_event' AND x.target_id=e.id WHERE e.moderation_case_id=?", caseId).all()).results;
  expect(before).toHaveLength(6); // request, two claims, release, reclaim, inspection
  expect(before.every(e => e.retain_until === null && e.purge_due_at === null)).toBe(true);
  expect(await decideVerification(db, f.mod, { ...lease, decision: "approve", reason: "Personally inspected live matching name" })).toEqual({ ok: true });
  const closed = await q("SELECT closed_at FROM moderation_case WHERE id=?", caseId).first<{ closed_at: string }>();
  const deadline = addTwelveMonthsUtc(closed!.closed_at);
  const events = (await q("SELECT e.*,x.purge_due_at FROM audit_event e JOIN pilot_maintenance_target x ON x.target_type='audit_event' AND x.target_id=e.id WHERE e.moderation_case_id=?", caseId).all()).results;
  expect(events.map(e => e.action).sort()).toEqual(["verification_requested", "moderation_claimed", "moderation_claimed", "moderation_released", "moderation_reclaimed", "verification_inspected", "verification_decided"].sort());
  expect(events.every(e => e.purge_due_at === deadline && e.moderation_case_id === caseId)).toBe(true);
  expect(events.filter(e => e.action !== "verification_decided")).toEqual(before.map(event => ({ ...event, purge_due_at: deadline })));
  for (const e of events) {
    expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id=? AND subject_user_id=?", String(e.id), f.subject).first()).not.toBeNull();
    expect(await q("SELECT 1 FROM pilot_privacy_subject_target WHERE target_type='audit_event' AND target_id=? AND subject_user_id=?", String(e.id), other.subject).first()).toBeNull();
  }
  expect(await q("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='verification_case' AND target_id=?", f.verificationCaseId).first()).toEqual({ purge_due_at: deadline });
  const otherEvent = await q("SELECT moderation_case_id,retain_until FROM audit_event WHERE subject_id=?", other.verificationCaseId).first();
  expect(otherEvent).toEqual({ moderation_case_id: other.moderationCaseId, retain_until: null });
  await expect(q("UPDATE audit_event SET moderation_case_id=? WHERE id=?", other.moderationCaseId, String(events[0].id)).run()).rejects.toThrow(/immutable/);
  await expect(q("DELETE FROM moderation_case WHERE id=?", caseId).run()).rejects.toThrow();
  await expect(q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'verification_inspected','verification_case',?,'missing-case')", crypto.randomUUID(), f.mod, f.verificationCaseId).run()).rejects.toThrow(/FOREIGN KEY/);
  expect((await q("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("rolls back every submission write if its deferred case FK cannot resolve at commit, without leaking deferral", async () => {
  const subject = await addActor("freelancer");
  await q("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,'freelancer_ack',?)", crypto.randomUUID(), subject, POLICY_VERSIONS.freelancer_ack).run();
  await q("INSERT INTO freelancer_profile(user_id,display_name,city,status) VALUES(?,'Original profile','Original city','rejected')", subject).run();
  await q("INSERT INTO portfolio_link(id,freelancer_id,url,label) VALUES(?,?,'https://example.com/original','Original portfolio')", crypto.randomUUID(), subject).run();
  const snapshot = async () => ({
    owner: await q("SELECT * FROM user WHERE id=?", subject).first(),
    profile: await q("SELECT * FROM freelancer_profile WHERE user_id=?", subject).first(),
    portfolio: (await q("SELECT * FROM portfolio_link WHERE freelancer_id=? ORDER BY id", subject).all()).results,
    requests: (await q("SELECT * FROM verification_case WHERE freelancer_id=?", subject).all()).results,
    cases: (await q("SELECT * FROM moderation_case ORDER BY id").all()).results,
    audit: (await q("SELECT * FROM audit_event ORDER BY id").all()).results,
  });
  const before = await snapshot();
  // A skipped final INSERT lets the batch reach commit with an unresolved FK.
  await q("CREATE TRIGGER synthetic_skip_case BEFORE INSERT ON moderation_case WHEN NEW.kind='verification' BEGIN SELECT RAISE(IGNORE); END").run();
  try {
    expect(await submitVerification(db, subject, { name: "Replacement Name", city: "Manila", portfolioLinks: [{ url: "https://example.com/replacement" }] })).toMatchObject({ ok: false, code: "unavailable" });
  } finally { await q("DROP TRIGGER synthetic_skip_case").run(); }
  expect(await snapshot()).toEqual(before);
  await expect(q("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES(?,?,'verification_requested','verification_case','missing','missing-case')", crypto.randomUUID(), subject).run()).rejects.toThrow(/FOREIGN KEY/);
  expect(await snapshot()).toEqual(before);
  expect((await submitVerification(db, subject, { name: "Replacement Name", city: "Manila", portfolioLinks: [{ url: "https://example.com/replacement" }] })).ok).toBe(true);
  expect((await q("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
