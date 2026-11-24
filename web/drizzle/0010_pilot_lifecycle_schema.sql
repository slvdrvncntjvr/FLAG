-- SDD 2.30: forward-only pilot schema. No FK disabling and no referenced-parent rebuild.
--> statement-breakpoint
DROP TRIGGER log_requires_proof;
--> statement-breakpoint
CREATE TABLE `correction_request` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text,
	`subject_ref` text NOT NULL,
	`requested_by` text NOT NULL,
	`base_revision_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`new_evidence_note` text NOT NULL,
	`active_proof_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`submitted_at` text,
	`closed_at` text,
	`hidden_at` text,
	`hidden_by` text,
	`hide_reason` text,
	`restored_at` text,
	FOREIGN KEY (`log_id`) REFERENCES `engagement_log`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`base_revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`hidden_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "correction_request_active_proofs_check" CHECK(json_valid(active_proof_ids) AND json_type(active_proof_ids)='array' AND json_array_length(active_proof_ids)<=5),
	CONSTRAINT "correction_request_status_check" CHECK("correction_request"."status" IN ('draft','submitted','ask_changes','closed','abandoned')),
	CONSTRAINT "correction_request_close_check" CHECK(("correction_request"."status" IN ('closed','abandoned') AND "correction_request"."closed_at" IS NOT NULL) OR ("correction_request"."status" IN ('draft','submitted','ask_changes') AND "correction_request"."closed_at" IS NULL AND "correction_request"."log_id" IS NOT NULL)),
	CONSTRAINT "correction_request_hide_check" CHECK(("correction_request"."hidden_at" IS NULL AND "correction_request"."hidden_by" IS NULL AND "correction_request"."hide_reason" IS NULL AND "correction_request"."restored_at" IS NULL) OR ("correction_request"."hidden_at" IS NOT NULL AND "correction_request"."hidden_by" IS NOT NULL AND length(trim("correction_request"."hide_reason")) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `correction_request_live_log_idx` ON `correction_request` (`log_id`) WHERE "correction_request"."status" IN ('draft','submitted','ask_changes');
--> statement-breakpoint
CREATE INDEX `correction_request_subject_idx` ON `correction_request` (`subject_ref`,`closed_at`);
--> statement-breakpoint
CREATE TABLE `__new_moderation_case` (
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
	`log_id` text,
	`correction_request_id` text,
	`closed_at` text,
	`closure_kind` text,
	FOREIGN KEY (`claimed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`log_id`) REFERENCES `engagement_log`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`correction_request_id`) REFERENCES `correction_request`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "moderation_case_kind_check" CHECK("__new_moderation_case"."kind" IN ('verification','log','correction','filer_update')),
	CONSTRAINT "moderation_case_state_check" CHECK(("__new_moderation_case"."status" IN ('open','awaiting_changes') AND "__new_moderation_case"."claimed_by" IS NULL AND "__new_moderation_case"."claimed_until" IS NULL AND "__new_moderation_case"."decision" IS NULL AND "__new_moderation_case"."reason" IS NULL AND "__new_moderation_case"."decided_by" IS NULL AND "__new_moderation_case"."decided_at" IS NULL AND "__new_moderation_case"."closed_at" IS NULL AND "__new_moderation_case"."closure_kind" IS NULL) OR ("__new_moderation_case"."status" = 'claimed' AND "__new_moderation_case"."claimed_by" IS NOT NULL AND "__new_moderation_case"."claimed_until" IS NOT NULL AND "__new_moderation_case"."decision" IS NULL AND "__new_moderation_case"."reason" IS NULL AND "__new_moderation_case"."decided_by" IS NULL AND "__new_moderation_case"."decided_at" IS NULL AND "__new_moderation_case"."closed_at" IS NULL AND "__new_moderation_case"."closure_kind" IS NULL) OR ("__new_moderation_case"."status" = 'decided' AND "__new_moderation_case"."claimed_by" IS NULL AND "__new_moderation_case"."claimed_until" IS NULL AND "__new_moderation_case"."decision" IS NOT NULL AND "__new_moderation_case"."reason" IS NOT NULL AND length(trim("__new_moderation_case"."reason", char(9)||char(10)||char(11)||char(12)||char(13)||' ')) > 0 AND "__new_moderation_case"."decided_by" IS NOT NULL AND "__new_moderation_case"."decided_at" IS NOT NULL AND (("__new_moderation_case"."closed_at" = "__new_moderation_case"."decided_at" AND "__new_moderation_case"."closure_kind" = 'decision') OR ("__new_moderation_case"."kind" = 'verification' AND "__new_moderation_case"."closed_at" IS NULL AND "__new_moderation_case"."closure_kind" IS NULL))) OR ("__new_moderation_case"."status" = 'closed' AND "__new_moderation_case"."claimed_by" IS NULL AND "__new_moderation_case"."claimed_until" IS NULL AND "__new_moderation_case"."decision" IS NULL AND "__new_moderation_case"."reason" IS NULL AND "__new_moderation_case"."decided_by" IS NULL AND "__new_moderation_case"."decided_at" IS NULL AND "__new_moderation_case"."closed_at" IS NOT NULL AND "__new_moderation_case"."closure_kind" IN ('abandoned','erased'))),
	CONSTRAINT "moderation_case_decision_check" CHECK("__new_moderation_case"."decision" IS NULL OR ("__new_moderation_case"."kind" = 'verification' AND "__new_moderation_case"."decision" IN ('approve','reject')) OR ("__new_moderation_case"."kind" IN ('log','filer_update') AND "__new_moderation_case"."decision" IN ('approve','ask_changes','reject')) OR ("__new_moderation_case"."kind" = 'correction' AND "__new_moderation_case"."decision" IN ('uphold','ask_changes','correct','withdraw')))
);
--> statement-breakpoint
INSERT INTO __new_moderation_case(id,kind,subject_id,status,claimed_by,claimed_until,decision,reason,decided_by,decided_at,created_at,log_id,closed_at,closure_kind) SELECT id,kind,subject_id,status,claimed_by,claimed_until,decision,reason,decided_by,decided_at,created_at,CASE WHEN kind='log' AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=moderation_case.subject_id) THEN subject_id ELSE NULL END,CASE WHEN status='decided' THEN decided_at ELSE NULL END,CASE WHEN status='decided' THEN 'decision' ELSE NULL END FROM moderation_case;
--> statement-breakpoint
DROP TABLE moderation_case;
--> statement-breakpoint
ALTER TABLE __new_moderation_case RENAME TO moderation_case;
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_case_correction_request_id_unique` ON `moderation_case` (`correction_request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_case_subject_idx` ON `moderation_case` (`kind`,`subject_id`);
--> statement-breakpoint
CREATE INDEX `moderation_case_queue_idx` ON `moderation_case` (`kind`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `moderation_case_closed_idx` ON `moderation_case` (`closed_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_case_live_initial_idx` ON `moderation_case` (`log_id`) WHERE "moderation_case"."kind" = 'log' AND "moderation_case"."status" IN ('open','claimed','awaiting_changes');
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_case_live_update_idx` ON `moderation_case` (`log_id`) WHERE "moderation_case"."kind" = 'filer_update' AND "moderation_case"."status" IN ('open','claimed','awaiting_changes');
--> statement-breakpoint
CREATE TABLE `backup_disposition` (
	`id` text PRIMARY KEY NOT NULL,
	`privacy_request_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`backup_ref` text NOT NULL,
	`action` text NOT NULL,
	`basis` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`privacy_request_id`) REFERENCES `privacy_request`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "backup_disposition_action_check" CHECK("backup_disposition"."action" IN ('erase','expire','restore_filter')),
	CONSTRAINT "backup_disposition_time_check" CHECK(julianday("backup_disposition"."due_at") IS NOT NULL AND (("backup_disposition"."status"='pending' AND "backup_disposition"."verified_at" IS NULL) OR ("backup_disposition"."status"='verified' AND julianday("backup_disposition"."verified_at") IS NOT NULL))),
	CONSTRAINT "backup_disposition_basis_check" CHECK(length(trim("backup_disposition"."basis"))>0)
);
--> statement-breakpoint
CREATE INDEX `backup_disposition_due_idx` ON `backup_disposition` (`status`,`due_at`);
--> statement-breakpoint
CREATE TABLE `export_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`privacy_request_id` text NOT NULL,
	`auth_kind` text NOT NULL,
	`object_key` text,
	`token_hash` text,
	`write_inflight` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`downloaded_at` text,
	`purged_at` text,
	FOREIGN KEY (`privacy_request_id`) REFERENCES `privacy_request`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "export_delivery_auth_check" CHECK("export_delivery"."auth_kind" IN ('session','assessed_capability')),
	CONSTRAINT "export_delivery_writer_check" CHECK("export_delivery"."write_inflight" IN (0,1) AND ("export_delivery"."write_inflight"=0 OR "export_delivery"."object_key" IS NOT NULL AND "export_delivery"."purged_at" IS NULL AND "export_delivery"."downloaded_at" IS NULL)),
	CONSTRAINT "export_delivery_time_check" CHECK(julianday("export_delivery"."created_at") IS NOT NULL AND julianday("export_delivery"."expires_at") IS NOT NULL AND "export_delivery"."created_at"<"export_delivery"."expires_at" AND julianday("export_delivery"."expires_at")<=julianday("export_delivery"."created_at")+1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_delivery_object_key_unique` ON `export_delivery` (`object_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_delivery_token_hash_unique` ON `export_delivery` (`token_hash`);
--> statement-breakpoint
CREATE TABLE `maintenance_task` (
	`id` text PRIMARY KEY NOT NULL,
	`privacy_request_id` text,
	`authorized_by` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`operation` text NOT NULL,
	`basis` text NOT NULL,
	`due_at` text NOT NULL,
	`authorized_at` text NOT NULL,
	`authorization_expires_at` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`claimed_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`retain_until` text,
	FOREIGN KEY (`privacy_request_id`) REFERENCES `privacy_request`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`authorized_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "maintenance_task_operation_check" CHECK("maintenance_task"."operation" IN ('purge','redact_identity','retire_policy','close_abandoned')),
	CONSTRAINT "maintenance_task_basis_check" CHECK("maintenance_task"."basis" IN ('retention_due','assessed_erasure','account_closure')),
	CONSTRAINT "maintenance_task_status_check" CHECK("maintenance_task"."status" IN ('planned','claimed','blocked','completed','abandoned')),
	CONSTRAINT "maintenance_task_attempts_check" CHECK(typeof("maintenance_task"."attempts")='integer' AND "maintenance_task"."attempts">=0),
	CONSTRAINT "maintenance_task_authorization_check" CHECK(julianday("maintenance_task"."authorized_at") IS NOT NULL AND julianday("maintenance_task"."authorization_expires_at") IS NOT NULL AND julianday("maintenance_task"."due_at") IS NOT NULL AND "maintenance_task"."authorized_at"<"maintenance_task"."authorization_expires_at" AND (julianday("maintenance_task"."authorization_expires_at")-julianday("maintenance_task"."authorized_at"))*86400<=3600.001)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_task_live_idx` ON `maintenance_task` (`target_type`,`target_id`,`operation`) WHERE "maintenance_task"."status" IN ('planned','claimed','blocked');
--> statement-breakpoint
CREATE INDEX `maintenance_task_due_idx` ON `maintenance_task` (`status`,`due_at`,`attempts`);
--> statement-breakpoint
CREATE TABLE `privacy_request` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text,
	`responsible_id` text,
	`kind` text NOT NULL,
	`received_at` text NOT NULL,
	`due_at` text NOT NULL,
	`identity_verified_at` text,
	`status` text DEFAULT 'received' NOT NULL,
	`scope` text NOT NULL,
	`assessment` text,
	`outcome` text,
	`deactivated_at` text,
	`assessed_at` text,
	`closed_at` text,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`responsible_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "privacy_request_kind_check" CHECK("privacy_request"."kind" IN ('export','correction','deletion','closure')),
	CONSTRAINT "privacy_request_status_check" CHECK("privacy_request"."status" IN ('received','assessing','executing','completed','deferred','denied')),
	CONSTRAINT "privacy_request_scope_check" CHECK(json_valid("privacy_request"."scope") AND json_type("privacy_request"."scope")='object'),
	CONSTRAINT "privacy_request_assessment_check" CHECK("privacy_request"."assessment" IS NULL OR (json_valid("privacy_request"."assessment") AND json_type("privacy_request"."assessment")='object')),
	CONSTRAINT "privacy_request_due_check" CHECK(julianday("privacy_request"."due_at") IS NOT NULL AND "privacy_request"."due_at">="privacy_request"."received_at" AND ("privacy_request"."kind"!='closure' OR julianday("privacy_request"."due_at")<=julianday("privacy_request"."received_at")+30))
);
--> statement-breakpoint
CREATE INDEX `privacy_request_due_idx` ON `privacy_request` (`status`,`due_at`);
--> statement-breakpoint
CREATE TABLE `proof_review` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`proof_id` text,
	`proof_sha256` text NOT NULL,
	`verdict` text NOT NULL,
	`reason` text NOT NULL,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `review_round`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proof_id`) REFERENCES `proof_file`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proof_review_verdict_check" CHECK("proof_review"."verdict" IN ('accepted','rejected')),
	CONSTRAINT "proof_review_reason_check" CHECK(length(trim("proof_review"."reason"))>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_review_round_proof_idx` ON `proof_review` (`round_id`,`proof_id`);
--> statement-breakpoint
CREATE TABLE `retention_hold` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`responsible_id` text NOT NULL,
	`reason` text NOT NULL,
	`placed_at` text NOT NULL,
	`review_due_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`released_at` text,
	FOREIGN KEY (`responsible_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "retention_hold_type_check" CHECK("retention_hold"."target_type" IN ('user','log','revision','proof','case','policy','request','audit')),
	CONSTRAINT "retention_hold_kind_check" CHECK("retention_hold"."kind" IN ('review','legal')),
	CONSTRAINT "retention_hold_reason_check" CHECK(length(trim("retention_hold"."reason"))>0),
	CONSTRAINT "retention_hold_time_check" CHECK(julianday("retention_hold"."placed_at") IS NOT NULL AND julianday("retention_hold"."review_due_at") IS NOT NULL AND julianday("retention_hold"."expires_at") IS NOT NULL AND "retention_hold"."placed_at"<="retention_hold"."review_due_at" AND "retention_hold"."review_due_at"<="retention_hold"."expires_at" AND ("retention_hold"."released_at" IS NULL OR (julianday("retention_hold"."released_at") IS NOT NULL AND "retention_hold"."released_at">="retention_hold"."placed_at")))
);
--> statement-breakpoint
CREATE INDEX `retention_hold_target_idx` ON `retention_hold` (`target_type`,`target_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `review_round` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`round_no` integer NOT NULL,
	`revision_id` text,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `moderation_case`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_round_number_check" CHECK(typeof("review_round"."round_no")='integer' AND "review_round"."round_no">=1),
	CONSTRAINT "review_round_decision_check" CHECK("review_round"."decision" IN ('approve','ask_changes','reject','uphold','correct','withdraw')),
	CONSTRAINT "review_round_reason_check" CHECK(length(trim("review_round"."reason"))>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_round_case_number_idx` ON `review_round` (`case_id`,`round_no`);
--> statement-breakpoint
CREATE TABLE `revision_proof` (
	`revision_id` text NOT NULL,
	`proof_id` text NOT NULL,
	PRIMARY KEY(`revision_id`, `proof_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proof_id`) REFERENCES `proof_file`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE user ADD COLUMN deactivated_at text;
--> statement-breakpoint
ALTER TABLE policy_acceptance ADD COLUMN retired_at text;
--> statement-breakpoint
ALTER TABLE engagement ADD COLUMN purpose_ended_at text;
--> statement-breakpoint
ALTER TABLE engagement_log ADD COLUMN name_retention_until text;
--> statement-breakpoint
ALTER TABLE log_revision ADD COLUMN draft_updated_at text;
--> statement-breakpoint
ALTER TABLE log_revision ADD COLUMN effective_on text CONSTRAINT log_revision_effective_check CHECK(effective_on IS NULL OR (effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(effective_on,'+0 days') IS effective_on));
--> statement-breakpoint
ALTER TABLE log_revision ADD COLUMN invalidated_at text;
--> statement-breakpoint
ALTER TABLE log_revision ADD COLUMN state text NOT NULL DEFAULT 'draft' CONSTRAINT log_revision_state_check CHECK(state IN ('draft','submitted'));
--> statement-breakpoint
ALTER TABLE log_revision ADD COLUMN moderation_case_id text REFERENCES moderation_case(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE proof_file ADD COLUMN correction_request_id text REFERENCES correction_request(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE proof_file ADD COLUMN write_inflight integer NOT NULL DEFAULT 0 CONSTRAINT proof_file_writer_check CHECK(write_inflight IN (0,1));
--> statement-breakpoint
ALTER TABLE audit_event ADD COLUMN moderation_case_id text REFERENCES moderation_case(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE audit_event ADD COLUMN retain_until text;
--> statement-breakpoint
DROP TRIGGER log_revision_private_update;
--> statement-breakpoint
UPDATE log_revision SET state='submitted' WHERE EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=log_revision.log_id AND l.first_submitted_at IS NOT NULL);
--> statement-breakpoint
UPDATE log_revision SET moderation_case_id=(SELECT c.id FROM moderation_case c WHERE c.kind='log' AND c.subject_id=log_revision.log_id) WHERE kind='initial';
--> statement-breakpoint
INSERT INTO revision_proof(revision_id,proof_id) SELECT p.revision_id,p.id FROM proof_file p JOIN log_revision r ON r.id=p.revision_id AND r.log_id=p.log_id;
--> statement-breakpoint
CREATE INDEX log_revision_activity_idx ON log_revision(state,draft_updated_at);
--> statement-breakpoint
CREATE TRIGGER log_revision_private_update BEFORE UPDATE ON log_revision
WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge'))) OR NEW.log_id IS NOT OLD.log_id OR NEW.id IS NOT OLD.id OR NEW.rev_no IS NOT OLD.rev_no OR NEW.kind IS NOT OLD.kind OR NEW.submitted_by IS NOT OLD.submitted_by OR OLD.decision IS NOT NULL OR OLD.decided_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'log revision is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_requires_proof BEFORE UPDATE OF status ON engagement_log
WHEN OLD.status='draft' AND NEW.status='pending'
BEGIN
  SELECT CASE WHEN NEW.first_submitted_at IS NULL OR NEW.submitted_at IS NOT NEW.first_submitted_at OR julianday(NEW.first_submitted_at) IS NULL OR abs((julianday(NEW.first_submitted_at)-julianday('now'))*86400)>60 THEN RAISE(ABORT,'initial submission needs current server time') END;
  SELECT CASE WHEN date(NEW.first_submitted_at,'+8 hours') < NEW.anchor_date OR date(NEW.first_submitted_at,'+8 hours') > date(NEW.anchor_date,'+15 days') THEN RAISE(ABORT,'outside filing window') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM engagement e JOIN user u ON u.id=NEW.freelancer_id JOIN freelancer_profile f ON f.user_id=u.id WHERE e.id=NEW.engagement_id AND e.status='accepted' AND e.client_id=NEW.client_id AND e.freelancer_id=NEW.freelancer_id AND u.role='freelancer' AND u.banned=0 AND f.status='verified') THEN RAISE(ABORT,'accepted engagement and verified freelancer required') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.log_id=NEW.id AND r.rev_no=1 AND r.kind='initial' AND r.submitted_by=NEW.freelancer_id AND r.decision IS NULL AND r.decided_at IS NULL AND r.decided_by IS NULL AND length(trim(r.facts)) BETWEEN 40 AND 2000 AND EXISTS(SELECT 1 FROM log_tag t WHERE t.revision_id=r.id)) THEN RAISE(ABORT,'complete initial revision required') END;
  SELECT CASE WHEN (SELECT count(*) FROM proof_file p JOIN log_revision r ON r.id=p.revision_id AND r.log_id=p.log_id WHERE p.log_id=NEW.id AND p.status='attached' AND p.owner_kind='filer' AND p.uploaded_by=NEW.freelancer_id AND r.rev_no=1 AND r.kind='initial') NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM proof_file WHERE log_id=NEW.id AND status IN ('uploading','pending_purge')) THEN RAISE(ABORT,'attached proof required and uploads must be complete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM moderation_case WHERE kind='log' AND subject_id=NEW.id AND status='open') THEN RAISE(ABORT,'open log moderation case required') END;
  SELECT CASE WHEN (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'))>=10 OR (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND client_id=NEW.client_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 months'))>=3 THEN RAISE(ABORT,'log submission quota reached') END;
  SELECT CASE WHEN NEW.hold_kind IS NOT NULL AND (NEW.hold_released_at IS NULL OR NEW.hold_released_at < NEW.hold_placed_at) THEN RAISE(ABORT,'held draft cannot submit') END;
END;
--> statement-breakpoint
CREATE TRIGGER moderation_verification_close AFTER UPDATE ON moderation_case WHEN NEW.kind='verification' AND NEW.status='decided' AND NEW.closed_at IS NULL BEGIN UPDATE moderation_case SET closed_at=NEW.decided_at,closure_kind='decision' WHERE id=NEW.id; END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS moderation_case_frozen_update;
--> statement-breakpoint
CREATE TRIGGER moderation_case_frozen_update BEFORE UPDATE ON moderation_case WHEN (OLD.status='decided' AND NOT (OLD.kind='verification' AND OLD.closed_at IS NULL AND NEW.closed_at IS OLD.decided_at AND NEW.closure_kind='decision' AND NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.subject_id IS OLD.subject_id AND NEW.status IS OLD.status AND NEW.claimed_by IS OLD.claimed_by AND NEW.claimed_until IS OLD.claimed_until AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_by IS OLD.decided_by AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.log_id IS OLD.log_id AND NEW.correction_request_id IS OLD.correction_request_id)) OR NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.subject_id IS NOT OLD.subject_id OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='open' AND NEW.status!='claimed') BEGIN SELECT RAISE(ABORT,'invalid moderation transition'); END;
--> statement-breakpoint
CREATE TRIGGER moderation_case_frozen_delete BEFORE DELETE ON moderation_case WHEN OLD.status='decided' BEGIN SELECT RAISE(ABORT,'decided moderation is immutable'); END;

--> statement-breakpoint
CREATE TABLE current_policy_version(policy text PRIMARY KEY NOT NULL,version text NOT NULL,
 CONSTRAINT current_policy_version_policy_check CHECK(policy IN ('privacy','terms','freelancer_ack','client_consent')),
 CONSTRAINT current_policy_version_version_check CHECK(length(trim(version))>0));
--> statement-breakpoint
INSERT INTO current_policy_version(policy,version) VALUES('privacy','2026-11-02'),('terms','2026-11-02'),('freelancer_ack','2026-10-12'),('client_consent','2026-10-12');
--> statement-breakpoint
CREATE TRIGGER current_policy_no_insert BEFORE INSERT ON current_policy_version BEGIN SELECT RAISE(ABORT,'policy authority requires forward migration'); END;
--> statement-breakpoint
CREATE TRIGGER current_policy_no_update BEFORE UPDATE ON current_policy_version BEGIN SELECT RAISE(ABORT,'policy authority requires forward migration'); END;
--> statement-breakpoint
CREATE TRIGGER current_policy_no_delete BEFORE DELETE ON current_policy_version BEGIN SELECT RAISE(ABORT,'policy authority requires forward migration'); END;
