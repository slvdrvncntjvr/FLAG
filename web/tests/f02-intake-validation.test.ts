import { describe, expect, it } from "vitest";
import { logDraftInput, manilaDate, outcomeForRating, withinFilingWindow } from "@/features/logs/schema";

const valid = {
  engagementId: "engagement-test", anchorKind: "completed", anchorDate: "2026-04-01",
  rating: 4, tags: ["Late Payment"], facts: "The agreed work was completed and the invoice was paid late.",
  periodStart: "2026-03-01", periodEnd: "2026-04-01", amountCentavos: 50000,
};
describe("complete private log validation", () => {
  it("keeps positive plus Late Payment valid and derives outcomes", () => {
    expect(logDraftInput.safeParse(valid).success).toBe(true);
    expect([1, 2, 3, 4, 5].map(outcomeForRating)).toEqual(["negative", "negative", "mixed", "positive", "positive"]);
    expect(logDraftInput.safeParse({ ...valid, amountCentavos: undefined }).success).toBe(true);
  });
  it.each([0, 6, 2.5, "4", null])("rejects rating %s", rating => {
    expect(logDraftInput.safeParse({ ...valid, rating }).success).toBe(false);
  });
  it.each([
    { tags: [] }, { tags: ["Scammer"] }, { tags: ["Responsive", "Responsive"] },
    { facts: "short" }, { facts: "x".repeat(2001) }, { periodStart: "2026-02-30" },
    { facts: "😀".repeat(20) }, { facts: "Normal project details and enough context plus malformed \ud800" },
    { periodEnd: "2026-02-01" }, { amountCentavos: -1 }, { amountCentavos: 0.1 },
    { amountCentavos: Number.MAX_SAFE_INTEGER + 1 }, { outcome: "negative" }, { clientId: "other" },
  ])("rejects incomplete or forged input %j", fields => {
    expect(logDraftInput.safeParse({ ...valid, ...fields }).success).toBe(false);
  });
  it("uses Manila inclusive calendar days rather than a UTC or 360-hour clock", () => {
    expect(manilaDate(new Date("2026-04-16T16:00:00Z"))).toBe("2026-04-17");
    expect(withinFilingWindow("2026-04-01", new Date("2026-04-16T15:59:59.999Z"))).toBe(true);
    expect(withinFilingWindow("2026-04-01", new Date("2026-04-16T16:00:00Z"))).toBe(false);
    expect(withinFilingWindow("2026-04-01", new Date("2026-03-31T15:59:59Z"))).toBe(false);
    expect(withinFilingWindow("2026-02-30", new Date("2026-03-01"))).toBe(false);
  });
  it.each([["2024-02-29", "2024-03-15"], ["2026-12-25", "2027-01-09"]])("handles leap/month/year boundary %s", (anchor, last) => {
    expect(withinFilingWindow(anchor, new Date(`${last}T15:59:59Z`))).toBe(true);
    expect(withinFilingWindow(anchor, new Date(`${last}T16:00:00Z`))).toBe(false);
  });
});
