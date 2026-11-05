import { describe, expect, it } from "vitest";
import { verificationInput } from "@/features/verification/schema";
import { decisionInput } from "@/features/moderation/schema";

const input = { name: "Alex Rivera", portfolioLinks: [{ url: "https://example.com/work" }] };
describe("portfolio URL numeric identifiers", () => {
  it.each([
    "https://www.behance.net/gallery/123456789/Project",
    "https://dribbble.com/shots/12345678-Project",
    "https://example.com/projects/123456",
    "https://example.com/work?project=12345678901#1234567",
    "https://example.com/work?project=%31%32%33%34%35%36%37%38%39",
  ])("accepts ordinary project identifiers without rewriting: %s", (url) => {
    const form = { ...input, portfolioLinks: [{ url }] };
    expect(verificationInput.parse(form)).toEqual(form);
  });

  it.each([
    "https://123456789012.example.com/work", "https://example.com/1234/5678/9012/3456",
    "https://example.com/work?pcn=synthetic", "https://example.com/work?qrBody=synthetic",
    "https://example.com/work?image=data%3Aimage%2Fpng%3Bbase64%2CaGVsbG8%3D",
    "https://example.com/work?value=%2531%2532%2533%2534%2535%2536%2537%2538%2539%2530%2531%2532",
    "https://example.com/work#1234#5678#9012#3456",
    "https://example.com/work?value=1234%3F5678%3F9012%3F3456",
    "https://example.com/work?detail=P1234567",
    "https://example.com/work?detail=A01-23-456789",
    "https://example.com/work?%69%64%48%61%73%68=" + "a".repeat(64),
    "https://user:secret@example.com/123456", "ftp://example.com/123456",
  ])("still rejects full numbers, payloads and unsafe URL forms: %s", (url) => {
    expect(verificationInput.safeParse({ ...input, portfolioLinks: [{ url }] }).success).toBe(false);
  });

  it("keeps strict numeric recognition in free text and review reasons", () => {
    for (const form of [
      { ...input, name: "123456" }, { ...input, city: "123456" },
      { ...input, portfolioLinks: [{ url: input.portfolioLinks[0].url, label: "123456" }] },
    ]) expect(verificationInput.safeParse(form).success).toBe(false);
    expect(decisionInput.safeParse({ caseId: "review", expectedClaimUntil: "2026-10-26T01:00:00.000Z", decision: "reject", reason: "Review 123456" }).success).toBe(false);
  });

  it("retains the four-round decoding bound", () => {
    let value = "/project";
    for (let round = 0; round < 6; round++) value = encodeURIComponent(value);
    expect(verificationInput.safeParse({ ...input, portfolioLinks: [{ url: `https://example.com/?detail=${value}` }] }).success).toBe(false);
  });
});
