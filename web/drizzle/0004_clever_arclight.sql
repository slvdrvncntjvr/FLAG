CREATE TABLE `engagement_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`engagement_id` text NOT NULL,
	`freelancer_id` text NOT NULL,
	`client_id` text NOT NULL,
	`current_revision_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`anchor_kind` text NOT NULL,
	`anchor_date` text NOT NULL,
	`first_submitted_at` text,
	`submitted_at` text,
	`published_at` text,
	`expires_at` text,
	`hold_kind` text,
	`hold_placed_at` text,
	`hold_released_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagement`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancer_profile`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`client_id`) REFERENCES `client_profile`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_revision_id`,`id`) REFERENCES `log_revision`(`id`,`log_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "engagement_log_status_check" CHECK("engagement_log"."status" IN ('draft','pending','ask_changes','published','hidden','withdrawn','rejected','expired')),
	CONSTRAINT "engagement_log_anchor_kind_check" CHECK("engagement_log"."anchor_kind" IN ('completed','terminated','missed_milestone')),
	CONSTRAINT "engagement_log_hold_kind_check" CHECK("engagement_log"."hold_kind" IS NULL OR "engagement_log"."hold_kind" IN ('review','legal')),
	CONSTRAINT "engagement_log_anchor_date_check" CHECK("engagement_log"."anchor_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("engagement_log"."anchor_date", '+0 days') IS "engagement_log"."anchor_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_log_ref_unique` ON `engagement_log` (`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_log_engagement_id_unique` ON `engagement_log` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `engagement_log_client_status_published_idx` ON `engagement_log` (`client_id`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `log_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`rev_no` integer NOT NULL,
	`kind` text NOT NULL,
	`rating` integer NOT NULL,
	`outcome` text NOT NULL,
	`facts` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`amount_centavos` integer,
	`submitted_by` text NOT NULL,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision` text,
	`reason` text,
	FOREIGN KEY (`log_id`) REFERENCES `engagement_log`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "log_revision_rev_no_check" CHECK(typeof("log_revision"."rev_no") = 'integer' AND "log_revision"."rev_no" >= 1),
	CONSTRAINT "log_revision_kind_check" CHECK("log_revision"."kind" IN ('initial','filer_update','correction')),
	CONSTRAINT "log_revision_rating_check" CHECK(typeof("log_revision"."rating") = 'integer' AND "log_revision"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "log_revision_outcome_check" CHECK(("log_revision"."rating" IN (1,2) AND "log_revision"."outcome" = 'negative') OR ("log_revision"."rating" = 3 AND "log_revision"."outcome" = 'mixed') OR ("log_revision"."rating" IN (4,5) AND "log_revision"."outcome" = 'positive')),
	CONSTRAINT "log_revision_period_start_check" CHECK("log_revision"."period_start" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("log_revision"."period_start", '+0 days') IS "log_revision"."period_start"),
	CONSTRAINT "log_revision_period_end_check" CHECK("log_revision"."period_end" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("log_revision"."period_end", '+0 days') IS "log_revision"."period_end"),
	CONSTRAINT "log_revision_period_order_check" CHECK("log_revision"."period_end" >= "log_revision"."period_start"),
	CONSTRAINT "log_revision_amount_check" CHECK("log_revision"."amount_centavos" IS NULL OR (typeof("log_revision"."amount_centavos") = 'integer' AND "log_revision"."amount_centavos" >= 0)),
	CONSTRAINT "log_revision_decision_check" CHECK("log_revision"."decision" IS NULL OR "log_revision"."decision" IN ('approve','ask_changes','reject','correct','withdraw','uphold'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `log_revision_log_rev_no_idx` ON `log_revision` (`log_id`,`rev_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `log_revision_id_log_idx` ON `log_revision` (`id`,`log_id`);--> statement-breakpoint
CREATE TABLE `log_tag` (
	`revision_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`revision_id`, `tag`),
	FOREIGN KEY (`revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "log_tag_tag_check" CHECK("log_tag"."tag" IN ('On-time Payment','Clear Scope','Responsive','Professional','Late Payment','Non-Payment','Unresponsive','Scope Creep'))
);
--> statement-breakpoint
CREATE TABLE `proof_file` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`revision_id` text,
	`owner_kind` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`object_key` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`uploaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `engagement_log`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revision_id`) REFERENCES `log_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revision_id`,`log_id`) REFERENCES `log_revision`(`id`,`log_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proof_file_owner_kind_check" CHECK("proof_file"."owner_kind" IN ('filer','client')),
	CONSTRAINT "proof_file_kind_check" CHECK("proof_file"."kind" IN ('screenshot','invoice','agreement','chat','other')),
	CONSTRAINT "proof_file_mime_check" CHECK("proof_file"."mime" IN ('image/jpeg','image/png','image/webp','application/pdf')),
	CONSTRAINT "proof_file_size_check" CHECK(typeof("proof_file"."size_bytes") = 'integer' AND "proof_file"."size_bytes" BETWEEN 1 AND 10485760),
	CONSTRAINT "proof_file_status_check" CHECK("proof_file"."status" IN ('uploading','attached','abandoned','pending_purge','purged'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_file_object_key_unique` ON `proof_file` (`object_key`);--> statement-breakpoint
CREATE INDEX `proof_file_log_idx` ON `proof_file` (`log_id`);--> statement-breakpoint
CREATE INDEX `proof_file_revision_idx` ON `proof_file` (`revision_id`);--> statement-breakpoint
CREATE INDEX `proof_file_status_uploaded_idx` ON `proof_file` (`status`,`uploaded_at`);