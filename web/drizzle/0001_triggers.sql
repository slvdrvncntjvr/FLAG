-- Hand-written triggers (SDD §3.3, §3.4). Append-only tables reject UPDATE and DELETE.
CREATE TRIGGER policy_acceptance_no_update
BEFORE UPDATE ON policy_acceptance
BEGIN
  SELECT RAISE(ABORT, 'policy_acceptance is append-only');
END;
--> statement-breakpoint
-- Deleting the account (PRD-F12) cascades; a direct delete while the user exists is refused.
CREATE TRIGGER policy_acceptance_no_delete
BEFORE DELETE ON policy_acceptance
WHEN EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'policy_acceptance is append-only');
END;
