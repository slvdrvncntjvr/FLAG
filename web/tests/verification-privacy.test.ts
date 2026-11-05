import { describe, expect, it } from "vitest";
import { decisionInput } from "@/features/moderation/schema";
import { verificationInput } from "@/features/verification/schema";

const safe = { name: "Alex Rivera", portfolioLinks: [{ url: "https://example.com/portfolio" }] };
const lease = { caseId: "case-under-review", expectedClaimUntil: "2026-10-26T01:00:00.000Z", decision: "approve" };
const number = "1234/5678/9012/3456";

describe("bounded verification privacy validation", () => {
  it.each([
    "https://123456789012.example.com/work",
    `https://example.com/${number}`,
    `https://example.com/work?number=${encodeURIComponent(number)}`,
    `https://example.com/work#${encodeURIComponent(number)}`,
    `https://example.com/work?id=${encodeURIComponent(encodeURIComponent(number))}`,
    "https://example.com/work?%69%64%48%61%73%68=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "https://example.com/work?image=data%3Aimage%2Fpng%3Bbase64%2CaGVsbG8%3D",
    "https://example.com/work?payload=%7B%22qrBody%22%3A%22synthetic%22%7D",
    "https://example.com/work?number=1234+5678+9012+3456",
    "https://example.com/work?unrelated=%zz&number=%31%32%33%34%35%36%37%38%39%30%31%32",
    "https://example.com/work?number=%ff%31%32%33%34%35%36%37%38%39%30%31%32",
  ])("checks every persisted URL component and decoded content: %s", (url) => {
    expect(verificationInput.safeParse({ ...safe, portfolioLinks: [{ url }] }).success).toBe(false);
  });

  it.each([
    "1234.5678.9012.3456", "1234—5678—9012—3456", "١٢٣٤/٥٦٧٨/٩٠١٢/٣٤٥٦",
    "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣",
    'idNumber="SYNTHETIC"', 'ID number: SYNTHETIC', 'idImage=data:synthetic',
    'qr={"fullName":"Synthetic"}', 'base64=aGVsbG8=',
    'iVBORw0KGgoAAAANSUhEUg==',
    "a".repeat(64),
  ])("applies the same recognizable payload checks to all free text: %s", (value) => {
    for (const input of [
      { ...safe, name: value }, { ...safe, city: value },
      { ...safe, portfolioLinks: [{ url: safe.portfolioLinks[0].url, label: value }] },
    ]) expect(verificationInput.safeParse(input).success).toBe(false);
    expect(decisionInput.safeParse({ ...lease, reason: `Live review: ${value}` }).success).toBe(false);
  });

  it("checks nested encoding within a fixed decoding budget", () => {
    let encoded = number;
    for (let depth = 0; depth < 8; depth++) encoded = encodeURIComponent(encoded);
    expect(verificationInput.safeParse({ ...safe, portfolioLinks: [{ url: `https://example.com/?detail=${encoded}` }] }).success).toBe(false);
  });

  it.each(["李 小龍", "María O’Connor", "Studio 7 / Alex", "Prince", "Alex Rivera 2026"])("keeps owner-entered name %s without a legal-name rule", (name) => {
    expect(verificationInput.safeParse({ ...safe, name }).success).toBe(true);
  });

  it("keeps review grounds and ordinary portfolio encodings without rewriting them", () => {
    const reason = "Live passport inspection and portfolio checked; name matches. Review on 26 October 2026.";
    expect(decisionInput.parse({ ...lease, reason }).reason).toBe(reason);
    const input = { ...safe, portfolioLinks: [{ url: "https://example.com/caf%C3%A9?project=design+art&year=2026#work", label: "Portfolio 2026" }] };
    expect(verificationInput.parse(input)).toEqual(input);
  });
});
