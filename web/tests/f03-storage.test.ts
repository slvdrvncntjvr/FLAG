import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { proofFile } from "@/server/db/schema";
import { seedLog, setup } from "./helpers";

describe("PRD-F3 local D1/R2 foundation", () => {
  it("streams proof bytes through the R2 binding and matches D1 metadata", async () => {
    const { db, logId, freelancerId } = await seedLog();
    const { proofs } = setup();
    const id = crypto.randomUUID();
    const objectKey = `logs/${logId}/${id}`;
    const bytes = new TextEncoder().encode("%PDF-1.7\nSynthetic test invoice, no personal data.\n%%EOF");
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map(byte => byte.toString(16).padStart(2, "0")).join("");

    await proofs.put(objectKey, new Blob([bytes]).stream(), { httpMetadata: { contentType: "application/pdf" }, sha256 });
    await db.insert(proofFile).values({
      id, logId, ownerKind: "filer", uploadedBy: freelancerId, objectKey,
      kind: "invoice", mime: "application/pdf", sizeBytes: bytes.byteLength, sha256,
    });
    const metadata = await db.query.proofFile.findFirst({ where: eq(proofFile.id, id) });
    const object = await proofs.get(metadata!.objectKey);
    expect(object).not.toBeNull();
    expect(object!.size).toBe(metadata!.sizeBytes);
    expect(object!.httpMetadata?.contentType).toBe(metadata!.mime);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(bytes);
    expect(metadata!.revisionId).toBeNull();
    expect(metadata!.status).toBe("uploading");
    expect(await proofs.get(`logs/missing/${id}`)).toBeNull();
  });

  it("supports retryable object deletion while preserving D1 retry metadata", async () => {
    const { db, logId, freelancerId } = await seedLog();
    const id = crypto.randomUUID();
    const objectKey = `logs/${logId}/${id}`;
    await env.PROOFS.put(objectKey, "test");
    await db.insert(proofFile).values({
      id, logId, ownerKind: "filer", uploadedBy: freelancerId, objectKey,
      kind: "other", mime: "application/pdf", sizeBytes: 4, sha256: "b".repeat(64), status: "pending_purge",
    });
    await env.PROOFS.delete(objectKey);
    await env.PROOFS.delete(objectKey);
    expect(await env.PROOFS.head(objectKey)).toBeNull();
    expect((await db.query.proofFile.findFirst({ where: eq(proofFile.id, id) }))?.status).toBe("pending_purge");
    // This tests storage primitives, not the future eligibility/hold/retention runner.
  });
});
