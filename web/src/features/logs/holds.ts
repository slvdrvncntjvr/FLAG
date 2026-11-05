// Only fixed server-owned aliases may be used here, never request input.
export function noActiveLogHold(alias: "" | "l" = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `EXISTS(SELECT 1 FROM pilot_unheld_target held_gate WHERE held_gate.target_type='engagement_log' AND held_gate.target_id=${prefix}id)`;
}
