// Fixed query aliases only; no submitted values enter these SQL fragments.
// The assessment view owns subject/scope/processor validation. Reads must not
// wait for a task to be issued or claimed, and holds never extend visibility.
// Materialize the authority view once per statement; natural content clocks
// stay correlated to the requested object, including shared-proof lifetimes.
export const contentDeadlineCtes = `read_assessed_deadlines AS MATERIALIZED (
  SELECT target_type,target_id,due_at FROM pilot_assessed_source_deadline
)`;

// Callers include contentDeadlineCtes in their statement's WITH clause.
export function contentDeadlineSql(kind: "revision" | "proof", alias: "r" | "p") {
  const natural = kind === "revision" ? "pilot_revision_retention" : "pilot_proof_retention";
  const target = kind === "revision" ? "log_revision" : "proof_file";
  return `EXISTS(SELECT 1 FROM ${natural} retained WHERE retained.id=${alias}.id
      AND (retained.purge_due_at IS NULL OR julianday(retained.purge_due_at)>julianday('now')))
    AND NOT EXISTS(SELECT 1 FROM read_assessed_deadlines deadline
      WHERE ((deadline.target_type='${target}' AND deadline.target_id=${alias}.id)
        OR (deadline.target_type='engagement_log' AND deadline.target_id=${alias}.log_id))
      AND julianday(deadline.due_at)<=julianday('now'))`;
}
