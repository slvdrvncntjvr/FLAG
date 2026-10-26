ALTER TABLE `verification_case` ADD `submitted_profile` text;
--> statement-breakpoint
-- Preserve original request evidence even before a decision. NULL legacy
-- evidence stays NULL; current profile values cannot reconstruct the original.
CREATE TRIGGER verification_submitted_profile_frozen BEFORE UPDATE OF submitted_profile ON verification_case
WHEN NEW.submitted_profile IS NOT OLD.submitted_profile
BEGIN SELECT RAISE(ABORT, 'submitted verification profile is immutable'); END;
