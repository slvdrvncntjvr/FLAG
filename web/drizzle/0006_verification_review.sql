CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `audit_event_subject_idx` ON `audit_event` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_case` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`claimed_by` text,
	`claimed_until` text,
	`decision` text,
	`reason` text,
	`decided_by` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`claimed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "moderation_case_kind_check" CHECK("moderation_case"."kind" IN ('verification','log','correction','filer_update')),
	CONSTRAINT "moderation_case_state_check" CHECK(("moderation_case"."status" = 'open' AND "moderation_case"."claimed_by" IS NULL AND "moderation_case"."claimed_until" IS NULL AND "moderation_case"."decision" IS NULL AND "moderation_case"."reason" IS NULL AND "moderation_case"."decided_by" IS NULL AND "moderation_case"."decided_at" IS NULL) OR ("moderation_case"."status" = 'claimed' AND "moderation_case"."claimed_by" IS NOT NULL AND "moderation_case"."claimed_until" IS NOT NULL AND "moderation_case"."decision" IS NULL AND "moderation_case"."reason" IS NULL AND "moderation_case"."decided_by" IS NULL AND "moderation_case"."decided_at" IS NULL) OR ("moderation_case"."status" = 'decided' AND "moderation_case"."claimed_by" IS NULL AND "moderation_case"."claimed_until" IS NULL AND "moderation_case"."decision" IS NOT NULL AND "moderation_case"."reason" IS NOT NULL AND length(trim("moderation_case"."reason", char(9)||char(10)||char(11)||char(12)||char(13)||' ')) > 0 AND "moderation_case"."decided_by" IS NOT NULL AND "moderation_case"."decided_at" IS NOT NULL)),
	CONSTRAINT "moderation_case_decision_check" CHECK("moderation_case"."decision" IS NULL OR ("moderation_case"."kind" = 'verification' AND "moderation_case"."decision" IN ('approve','reject')) OR ("moderation_case"."kind" IN ('log','filer_update') AND "moderation_case"."decision" IN ('approve','ask_changes','reject')) OR ("moderation_case"."kind" = 'correction' AND "moderation_case"."decision" IN ('uphold','ask_changes','correct','withdraw')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_case_subject_idx` ON `moderation_case` (`kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `moderation_case_queue_idx` ON `moderation_case` (`kind`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_verification_case` (
	`id` text PRIMARY KEY NOT NULL,
	`freelancer_id` text NOT NULL,
	`reviewer_id` text,
	`method` text DEFAULT 'live_manual' NOT NULL,
	`id_kind` text,
	`result` text,
	`name_match` integer,
	`inspected_at` text,
	`decision` text,
	`reason` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancer_profile`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "verification_case_method_check" CHECK("__new_verification_case"."method" = 'live_manual'),
	CONSTRAINT "verification_case_id_kind_check" CHECK("__new_verification_case"."id_kind" IS NULL OR "__new_verification_case"."id_kind" IN ('philid','ephilid','passport','drivers_licence')),
	CONSTRAINT "verification_case_result_check" CHECK("__new_verification_case"."result" IS NULL OR "__new_verification_case"."result" IN ('pass','fail')),
	CONSTRAINT "verification_case_inspection_check" CHECK(("__new_verification_case"."reviewer_id" IS NULL AND "__new_verification_case"."id_kind" IS NULL AND "__new_verification_case"."result" IS NULL AND "__new_verification_case"."name_match" IS NULL AND "__new_verification_case"."inspected_at" IS NULL) OR ("__new_verification_case"."reviewer_id" IS NOT NULL AND "__new_verification_case"."id_kind" IS NOT NULL AND "__new_verification_case"."result" IS NOT NULL AND "__new_verification_case"."name_match" IS NOT NULL AND typeof("__new_verification_case"."name_match") = 'integer' AND "__new_verification_case"."name_match" IN (0,1) AND "__new_verification_case"."inspected_at" IS NOT NULL)),
	CONSTRAINT "verification_case_decision_check" CHECK(("__new_verification_case"."decision" IS NULL AND "__new_verification_case"."reason" IS NULL AND "__new_verification_case"."decided_at" IS NULL) OR ("__new_verification_case"."decision" IS NOT NULL AND "__new_verification_case"."decision" IN ('approve','reject') AND "__new_verification_case"."reason" IS NOT NULL AND length(trim("__new_verification_case"."reason", char(9)||char(10)||char(11)||char(12)||char(13)||' ')) > 0 AND "__new_verification_case"."decided_at" IS NOT NULL)),
	CONSTRAINT "verification_case_approval_check" CHECK("__new_verification_case"."decision" IS NULL OR "__new_verification_case"."decision" != 'approve' OR ("__new_verification_case"."reviewer_id" IS NOT NULL AND "__new_verification_case"."result" IS NOT NULL AND "__new_verification_case"."result" = 'pass' AND "__new_verification_case"."name_match" IS NOT NULL AND "__new_verification_case"."name_match" = 1)),
	CONSTRAINT "verification_case_time_check" CHECK(("__new_verification_case"."inspected_at" IS NULL OR "__new_verification_case"."created_at" <= "__new_verification_case"."inspected_at") AND ("__new_verification_case"."decided_at" IS NULL OR ("__new_verification_case"."created_at" <= "__new_verification_case"."decided_at" AND ("__new_verification_case"."inspected_at" IS NULL OR "__new_verification_case"."inspected_at" <= "__new_verification_case"."decided_at"))))
);
--> statement-breakpoint
INSERT INTO `__new_verification_case`("id", "freelancer_id", "reviewer_id", "method", "id_kind", "result", "name_match", "inspected_at", "decision", "reason", "decided_at", "created_at") SELECT "id", "freelancer_id", "reviewer_id", "method", "id_kind", "result", "name_match", "inspected_at", "decision", "reason", "decided_at", "created_at" FROM `verification_case`;--> statement-breakpoint
DROP TABLE `verification_case`;--> statement-breakpoint
ALTER TABLE `__new_verification_case` RENAME TO `verification_case`;--> statement-breakpoint
CREATE INDEX `verification_case_freelancer_idx` ON `verification_case` (`freelancer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `verification_case_open_idx` ON `verification_case` (`freelancer_id`) WHERE "verification_case"."decided_at" IS NULL;
--> statement-breakpoint
-- Preserve historical evidence verbatim; invalid rows abort the copy above.
-- Associate existing requests with their queue without inventing inspection/audit evidence.
INSERT INTO moderation_case (id,kind,subject_id,status,decision,reason,decided_by,decided_at,created_at)
SELECT 'legacy-verification-' || id, 'verification', id,
  CASE WHEN decided_at IS NULL THEN 'open' ELSE 'decided' END,
  decision, reason, CASE WHEN decided_at IS NULL THEN NULL ELSE reviewer_id END, decided_at, created_at
FROM verification_case;
--> statement-breakpoint
CREATE TRIGGER verification_case_frozen_update BEFORE UPDATE ON verification_case
WHEN OLD.decided_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.freelancer_id IS NOT OLD.freelancer_id OR NEW.created_at IS NOT OLD.created_at OR NEW.method IS NOT OLD.method
BEGIN SELECT RAISE(ABORT, 'verification case is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER verification_case_frozen_delete BEFORE DELETE ON verification_case
WHEN OLD.decided_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'decided verification is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER moderation_case_frozen_update BEFORE UPDATE ON moderation_case
WHEN OLD.status = 'decided' OR NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.subject_id IS NOT OLD.subject_id OR NEW.created_at IS NOT OLD.created_at OR (OLD.status = 'open' AND NEW.status != 'claimed')
BEGIN SELECT RAISE(ABORT, 'invalid moderation transition'); END;
--> statement-breakpoint
CREATE TRIGGER moderation_case_frozen_delete BEFORE DELETE ON moderation_case
WHEN OLD.status = 'decided'
BEGIN SELECT RAISE(ABORT, 'decided moderation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON audit_event
BEGIN SELECT RAISE(ABORT, 'audit event is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON audit_event
BEGIN SELECT RAISE(ABORT, 'audit event is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER verification_owner_name_frozen BEFORE UPDATE OF name ON user
WHEN NEW.name IS NOT OLD.name AND (EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = OLD.id AND decided_at IS NULL) OR EXISTS (SELECT 1 FROM freelancer_profile WHERE user_id = OLD.id AND status = 'verified'))
BEGIN SELECT RAISE(ABORT, 'reviewed name is fixed'); END;
--> statement-breakpoint
CREATE TRIGGER verification_profile_name_frozen BEFORE UPDATE OF display_name ON freelancer_profile
WHEN NEW.display_name IS NOT OLD.display_name AND (OLD.status = 'verified' OR EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = OLD.user_id AND decided_at IS NULL))
BEGIN SELECT RAISE(ABORT, 'reviewed profile name is fixed'); END;
--> statement-breakpoint
CREATE TRIGGER verification_portfolio_frozen_insert BEFORE INSERT ON portfolio_link
WHEN EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = NEW.freelancer_id AND decided_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'reviewed portfolio is fixed'); END;
--> statement-breakpoint
CREATE TRIGGER verification_portfolio_frozen_update BEFORE UPDATE ON portfolio_link
WHEN EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = OLD.freelancer_id AND decided_at IS NULL) OR EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = NEW.freelancer_id AND decided_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'reviewed portfolio is fixed'); END;
--> statement-breakpoint
CREATE TRIGGER verification_portfolio_frozen_delete BEFORE DELETE ON portfolio_link
WHEN EXISTS (SELECT 1 FROM verification_case WHERE freelancer_id = OLD.freelancer_id AND decided_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'reviewed portfolio is fixed'); END;
