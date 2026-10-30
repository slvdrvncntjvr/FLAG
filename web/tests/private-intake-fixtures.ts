import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { seedLog } from "./helpers";
import { POLICY_VERSIONS } from "@/lib/policies";
import { saveLogDraft } from "@/features/logs/draft";
import { manilaDate, type LogDraftInput } from "@/features/logs/schema";
import { uploadProof } from "@/features/logs/proofs";

export const pdfBytes = new TextEncoder().encode("%PDF-1.7\nSynthetic project invoice. No real personal data.\n%%EOF");
export async function intakeFixture() {
  const seeded = await seedLog();
  await env.DB.prepare("DELETE FROM engagement_log WHERE id=?").bind(seeded.logId).run();
  for (const [policy, version] of Object.entries(POLICY_VERSIONS)) {
    if (policy === "client_consent") continue;
    for (const actor of [seeded.freelancerId, seeded.clientUserId]) {
      await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)").bind(crypto.randomUUID(), actor, policy, version).run();
    }
  }
  const input: LogDraftInput = {
    engagementId: seeded.engagementId, anchorKind: "completed", anchorDate: manilaDate(),
    rating: 4, tags: ["Late Payment", "Professional"], facts: "The agreed project was delivered and the final invoice was paid late.",
    periodStart: "2026-10-01", periodEnd: manilaDate(), amountCentavos: null,
  };
  const saved = await saveLogDraft(seeded.db, seeded.freelancerId, input);
  expect(saved).toMatchObject({ ok: true });
  if (!saved.ok) throw new Error(`Synthetic draft failed: ${saved.code}`);
  return { ...seeded, logId: saved.data.logId, ref: saved.data.ref, input };
}
export function uploadRequest(bytes: Uint8Array = pdfBytes, fileName = "../../unsafe.pdf", kind = "invoice") {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], fileName, { type: "application/pdf" }));
  body.append("kind", kind);
  return new Request("https://flag.invalid/api/logs/test/proofs", { method: "POST", body });
}
export async function addProof(fixture: Awaited<ReturnType<typeof intakeFixture>>) {
  const response = await uploadProof(fixture.db, env.PROOFS, fixture.freelancerId, fixture.logId, uploadRequest());
  expect(response.status).toBe(201);
  const body = await response.json() as { ok: true; data: { proofId: string } };
  return body.data.proofId;
}
export async function addActor(role: "freelancer" | "client" | "moderator" | "admin") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO user(id,name,email,role) VALUES(?,'Synthetic user',?,?)").bind(id, `${id}@example.invalid`, role).run();
  for (const policy of ["privacy", "terms"] as const) await env.DB.prepare("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)").bind(crypto.randomUUID(), id, policy, POLICY_VERSIONS[policy]).run();
  return id;
}
