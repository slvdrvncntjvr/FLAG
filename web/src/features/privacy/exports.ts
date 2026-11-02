import type { Db } from "@/server/db";
import { clock, currentAdmin, getPrivacyRequest, responsibleGate, type PrivacyRequest } from "@/server/db/queries/privacy";
import { assessment, type Assessment } from "./schema";
import { hex } from "@/features/logs/proof-storage";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
type Source = { targetType: string; targetId: string; deadline: string; digest: string };
type Delivery = { id: string; privacy_request_id: string; auth_kind: string; object_key: string | null; token_hash: string | null; write_inflight: number; expires_at: string; downloaded_at: string | null; purged_at: string | null };
// Metadata-only by design: no auth tables, proof keys/bytes, review notes, other contacts or free-text claims.
async function projection(db: Db, subjectId: string, deadline: string, categories: string[], targets: Assessment["targets"]) {
  const user = await db.$client.prepare("SELECT id,name,email,phone_number,created_at,deactivated_at FROM user WHERE id=?").bind(subjectId).first();
  if (!user) throw new Error("subject_missing");
  const policies = await db.$client.prepare("SELECT id,policy,version,accepted_at,retired_at FROM policy_acceptance WHERE user_id=? ORDER BY id LIMIT 1001").bind(subjectId).all<{ id: string; policy: string; version: string; accepted_at: string; retired_at: string | null }>();
  const filer = await db.$client.prepare("SELECT user_id,display_name,city,status,verified_at FROM freelancer_profile WHERE user_id=?").bind(subjectId).first();
  const client = await db.$client.prepare("SELECT id,display_name,kind,city,registration_no FROM client_profile WHERE user_id=?").bind(subjectId).first<{ id: string }>();
  const logs = await db.$client.prepare(`SELECT l.id,l.ref,l.status,l.created_at,l.published_at,l.expires_at FROM engagement_log l
    WHERE (l.freelancer_id=? OR l.client_id IN (SELECT id FROM client_profile WHERE user_id=?))
    AND (l.expires_at IS NULL OR l.expires_at>${clock}) AND NOT EXISTS(SELECT 1 FROM maintenance_task t WHERE t.target_id=l.id AND t.target_type='engagement_log' AND t.status IN ('claimed','blocked')) ORDER BY l.id LIMIT 1001`)
    .bind(subjectId, subjectId).all<{ id: string; expires_at: string | null }>();
  if (policies.results.length > 1000 || logs.results.length > 1000) throw new Error("bounded_export_requires_assessment");
  const sources: Source[] = [];
  const add = async (type: string, key: string, data: unknown, until: string) => {
    for (const target of targets) if (target.targetType === type && target.targetId === key && ["purge", "redact_identity"].includes(target.operation) && target.dueAt < until) until = target.dueAt;
    const assessed = await db.$client.prepare("SELECT due_at FROM pilot_assessed_source_deadline WHERE target_type=? AND target_id=? AND subject_user_id=?")
      .bind(type, key, subjectId).first<{ due_at: string }>();
    if (assessed?.due_at && assessed.due_at < until) until = assessed.due_at;
    sources.push({ targetType: type, targetId: key, deadline: until, digest: await hash(JSON.stringify(data)) });
  };
  await add("user", subjectId, user, deadline);
  if (filer && categories.includes("profiles")) await add("freelancer_profile", subjectId, filer, deadline);
  if (client && categories.includes("profiles")) await add("client_profile", client.id, client, deadline);
  for (const row of categories.includes("policies") ? policies.results : []) {
    const due = await db.$client.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='policy_acceptance' AND target_id=?").bind(row.id).first<{ purge_due_at: string | null }>();
    await add("policy_acceptance", row.id, row, due?.purge_due_at && due.purge_due_at < deadline ? due.purge_due_at : deadline);
  }
  for (const row of categories.includes("log_metadata") ? logs.results : []) {
    const due = await db.$client.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='engagement_log' AND target_id=?").bind(row.id).first<{ purge_due_at: string | null }>();
    await add("engagement_log", row.id, row, due?.purge_due_at && due.purge_due_at < deadline ? due.purge_due_at : deadline);
  }
  return { data: { scope: "Assessed metadata-only export", includedCategories: categories, ...(categories.includes("account") ? { account: user } : {}), ...(categories.includes("profiles") ? { freelancerProfile: filer, clientProfile: client } : {}), ...(categories.includes("policies") ? { policyAcceptances: policies.results } : {}), ...(categories.includes("log_metadata") ? { logMetadata: logs.results } : {}), proofFilesIncluded: false }, sources };
}
export async function purgeExportArtifact(db: Db, bucket: R2Bucket, deliveryId: string) {
  const row = await db.$client.prepare("UPDATE export_delivery SET token_hash=NULL WHERE id=? RETURNING object_key,write_inflight").bind(deliveryId).first<{ object_key: string | null; write_inflight: number }>();
  if (row?.write_inflight) throw new Error("export_writer_unsettled");
  if (!row?.object_key) return;
  await bucket.delete(row.object_key);
  if (await bucket.head(row.object_key)) throw new Error("export_purge_unconfirmed");
  await db.$client.prepare(`UPDATE export_delivery SET object_key=NULL,purged_at=${clock},token_hash=NULL WHERE id=? AND object_key=? AND write_inflight=0`).bind(deliveryId, row.object_key).run();
}
export async function prepareExport(db: Db, bucket: R2Bucket, actor: string | null, requestId: string): Promise<{ deliveryId: string; token: string; expiresAt: string }> {
  if (!actor || !await currentAdmin(db, actor)) throw new Error("forbidden");
  const p = await getPrivacyRequest(db, actor, requestId);
  const a = assessment.parse(p?.assessment ? JSON.parse(p.assessment) : null);
  if (!p || p.responsible_id !== actor || !p.subject_user_id || !["export", "closure"].includes(p.kind) || !["assessing", "executing"].includes(p.status) || !a.export || !p.identity_verified_at || Date.parse(p.identity_verified_at) < Date.now() - 86400000) throw new Error("unverified_export");
  const now = new Date().toISOString();
  const cap = new Date(Math.min(Date.now() + 86400000, Date.parse(a.export.deadline),
    ...(a.export.authKind === "assessed_capability" ? [Date.parse(p.identity_verified_at) + 86400000] : []),
    ...a.categories.map(c => Date.parse(c.until)))).toISOString();
  const projected = await projection(db, p.subject_user_id, cap, a.export.categories, a.targets);
  const expiresAt = projected.sources.reduce((d, s) => s.deadline < d ? s.deadline : d, cap);
  if (expiresAt <= now) throw new Error("source_expired");
  const deliveryId = crypto.randomUUID(), objectKey = `exports/${deliveryId}`;
  const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const tokenHash = await hash(token);
  const body = JSON.stringify(projected.data);
  if (new TextEncoder().encode(body).length > 1024 * 1024) throw new Error("export_too_large");
  const updated = await db.$client.prepare(`UPDATE privacy_request SET scope=? WHERE id=? AND ${responsibleGate} AND assessment=? AND status IN ('assessing','executing')`)
    .bind(JSON.stringify({ ...JSON.parse(p.scope), sources: projected.sources }), requestId, actor, actor, p.assessment).run();
  if (updated.meta.changes !== 1) throw new Error("assessment_changed");
  // Reserve durable cleanup metadata before the cross-service write.
  await db.$client.prepare(`INSERT INTO export_delivery(id,privacy_request_id,auth_kind,object_key,token_hash,created_at,expires_at,write_inflight) VALUES(?,?,?,?,?,?,?,1)`)
    .bind(deliveryId, requestId, a.export.authKind, objectKey, tokenHash, now, expiresAt).run();
  try {
    try {
      await bucket.put(objectKey, body, { httpMetadata: { contentType: "application/json" }, sha256: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)) });
    } finally {
      const settled = await db.$client.prepare("UPDATE export_delivery SET write_inflight=0 WHERE id=? AND object_key=? AND write_inflight=1 RETURNING id").bind(deliveryId, objectKey).first();
      if (!settled) throw new Error("export_writer_settlement_lost");
    }
    const current = await getPrivacyRequest(db, actor, requestId);
    const delivery = await db.$client.prepare("SELECT token_hash FROM export_delivery WHERE id=? AND object_key=? AND write_inflight=0").bind(deliveryId, objectKey).first<{ token_hash: string | null }>();
    if (!current || current.assessment !== p.assessment || delivery?.token_hash !== tokenHash || !await validSources(db, current, expiresAt)) throw new Error("export_revoked");
    return { deliveryId, token, expiresAt };
  } catch {
    await purgeExportArtifact(db, bucket, deliveryId);
    throw new Error("export_unavailable");
  }
}
async function validSources(db: Db, p: PrivacyRequest, expiresAt: string) {
  if (!p.subject_user_id || !p.assessment || !p.identity_verified_at || !["assessing", "executing", "completed"].includes(p.status)) return false;
  const a = assessment.safeParse(JSON.parse(p.assessment)); if (!a.success || !a.data.export || a.data.export.deadline < expiresAt) return false;
  const stored = JSON.parse(p.scope).sources as Source[] | undefined;
  if (!stored?.length || stored.some(s => s.deadline < expiresAt || s.deadline <= new Date().toISOString())) return false;
  const cap = stored.reduce((deadline, s) => s.deadline > deadline ? s.deadline : deadline, "");
  if (!cap || a.data.categories.some(c => c.until < expiresAt)) return false;
  const fresh = await projection(db, p.subject_user_id, cap, a.data.export.categories, a.data.targets);
  return JSON.stringify(stored) === JSON.stringify(fresh.sources);
}
export async function deliverExport(db: Db, bucket: R2Bucket, deliveryId: string, token: string | null, subjectSessionId: string | null): Promise<Response> {
  const denied = () => new Response(null, { status: 404, headers });
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return denied();
  const row = await db.$client.prepare("SELECT * FROM export_delivery WHERE id=?").bind(deliveryId).first<Delivery>();
  if (!row?.token_hash || !row.object_key || row.write_inflight || row.expires_at <= new Date().toISOString() || row.downloaded_at) return denied();
  const candidate = await hash(token);
  const comparisonKey = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const signature = await crypto.subtle.sign("HMAC", comparisonKey, new TextEncoder().encode(candidate));
  if (!await crypto.subtle.verify("HMAC", comparisonKey, signature, new TextEncoder().encode(row.token_hash))) return denied();
  const p = await db.$client.prepare("SELECT * FROM privacy_request WHERE id=?").bind(row.privacy_request_id).first<PrivacyRequest>();
  if (!p?.subject_user_id) return denied();
  if (row.auth_kind === "session") {
    if (subjectSessionId !== p.subject_user_id || !await db.$client.prepare("SELECT 1 FROM user WHERE id=? AND deactivated_at IS NULL AND banned=0").bind(subjectSessionId).first()) return denied();
  } else {
    const a = assessment.safeParse(p.assessment ? JSON.parse(p.assessment) : null);
    if (!a.success || !a.data.export?.secureHandover || a.data.export.authKind !== "assessed_capability" || !p.identity_verified_at || Date.parse(p.identity_verified_at) < Date.now() - 86400000) return denied();
  }
  try {
    if (!await validSources(db, p, row.expires_at)) { await purgeExportArtifact(db, bucket, row.id); return denied(); }
    const object = await bucket.get(row.object_key);
    if (!object || object.size > 1024 * 1024) { await purgeExportArtifact(db, bucket, row.id); return denied(); }
    // Atomically consume capability, including a fresh session/revocation check before bytes.
    const used = await db.$client.prepare(`UPDATE export_delivery SET token_hash=NULL,downloaded_at=${clock} WHERE id=? AND token_hash=? AND write_inflight=0 AND expires_at>${clock} AND downloaded_at IS NULL
      AND EXISTS(SELECT 1 FROM privacy_request p JOIN user u ON u.id=p.subject_user_id WHERE p.id=export_delivery.privacy_request_id AND p.assessment=? AND p.scope=? AND p.status IN ('assessing','executing','completed') AND (export_delivery.auth_kind='assessed_capability' AND p.identity_verified_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') OR export_delivery.auth_kind='session' AND u.deactivated_at IS NULL AND u.banned=0 AND u.id=?)) RETURNING id`)
      .bind(row.id, candidate, p.assessment, p.scope, subjectSessionId).first();
    if (!used) { await object.body.cancel(); return denied(); }
    const bytes = await object.arrayBuffer();
    const latest = await db.$client.prepare("SELECT * FROM privacy_request WHERE id=?").bind(p.id).first<PrivacyRequest>();
    if (!latest || !await validSources(db, latest, row.expires_at) || row.auth_kind === "assessed_capability" && (!latest.identity_verified_at || Date.parse(latest.identity_verified_at) <= Date.now() - 86400000) || row.auth_kind === "session" && !await db.$client.prepare("SELECT 1 FROM user WHERE id=? AND deactivated_at IS NULL AND banned=0").bind(subjectSessionId).first()) { await purgeExportArtifact(db, bucket, row.id); return denied(); }
    // Purge the stored copy before returning this bounded response. Fail closed on deletion failure.
    await purgeExportArtifact(db, bucket, row.id);
    return new Response(bytes, { headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="flag-account-export.json"' } });
  } catch { return denied(); }
}
