export const EMPTY_RECORD = "No published experiences in the past 12 months";
export const RECORD_PAGE_SIZE = 20;
export const CLIENT_SEARCH_LIMIT = 50;

export type ClientMatch = { id: string; name: string; kind: "individual" | "business"; city: string | null; engagementCount: number };
export type RecordLog = {
  ref: string; filerName: string; rating: number; outcome: "negative" | "mixed" | "positive";
  facts: string; periodStart: string; periodEnd: string; publishedAt: string;
  reviewedAt: string; updateEffectiveOn: string | null; updateApprovedAt: string | null; tags: string[];
};
export type ClientRecord = {
  id: string; name: string; average: string | null; contributorCount: number; limited: boolean;
  publishedLogCount: number; outcomes: { negative: number; mixed: number; positive: number };
  tags: { tag: string; count: number }[]; logs: RecordLog[]; page: number; pageCount: number;
};

export function recordPage(value: unknown): number {
  return typeof value === "string" && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
}
