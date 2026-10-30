// Only fixed server-owned aliases may be used here, never request input.
export function noActiveLogHold(alias: "" | "l" = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}hold_kind IS NULL OR (${prefix}hold_released_at IS NOT NULL AND ${prefix}hold_released_at >= ${prefix}hold_placed_at))`;
}
