/** SDD §3.8: UTC twelve-calendar-month anniversary, clamping leap day. */
export function addTwelveMonthsUtc(value: string | Date): string {
  const original = new Date(value);
  if (!Number.isFinite(original.getTime())) throw new RangeError("Invalid UTC timestamp");
  const year = original.getUTCFullYear() + 1;
  const month = original.getUTCMonth();
  // setUTCFullYear avoids Date.UTC's special interpretation of years 0–99.
  const end = new Date(original);
  end.setUTCFullYear(year, month + 1, 0);
  const result = new Date(original);
  result.setUTCFullYear(year, month, Math.min(original.getUTCDate(), end.getUTCDate()));
  if (!Number.isFinite(result.getTime())) throw new RangeError("UTC anniversary out of range");
  return result.toISOString();
}
