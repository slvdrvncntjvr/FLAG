CREATE UNIQUE INDEX `engagement_id_parties_idx` ON `engagement` (`id`,`freelancer_id`,`client_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_engagement_log` (
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
	FOREIGN KEY (`engagement_id`,`freelancer_id`,`client_id`) REFERENCES `engagement`(`id`,`freelancer_id`,`client_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_revision_id`,`id`) REFERENCES `log_revision`(`id`,`log_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "engagement_log_status_check" CHECK("__new_engagement_log"."status" IN ('draft','pending','ask_changes','published','hidden','withdrawn','rejected','expired')),
	CONSTRAINT "engagement_log_anchor_kind_check" CHECK("__new_engagement_log"."anchor_kind" IN ('completed','terminated','missed_milestone')),
	CONSTRAINT "engagement_log_hold_kind_check" CHECK("__new_engagement_log"."hold_kind" IS NULL OR "__new_engagement_log"."hold_kind" IN ('review','legal')),
	CONSTRAINT "engagement_log_anchor_date_check" CHECK("__new_engagement_log"."anchor_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("__new_engagement_log"."anchor_date", '+0 days') IS "__new_engagement_log"."anchor_date")
);
--> statement-breakpoint
INSERT INTO `__new_engagement_log`("id", "ref", "engagement_id", "freelancer_id", "client_id", "current_revision_id", "status", "anchor_kind", "anchor_date", "first_submitted_at", "submitted_at", "published_at", "expires_at", "hold_kind", "hold_placed_at", "hold_released_at", "created_at") SELECT "id", "ref", "engagement_id", "freelancer_id", "client_id", "current_revision_id", "status", "anchor_kind", "anchor_date", "first_submitted_at", "submitted_at", "published_at", "expires_at", "hold_kind", "hold_placed_at", "hold_released_at", "created_at" FROM `engagement_log`;--> statement-breakpoint
DROP TABLE `engagement_log`;--> statement-breakpoint
ALTER TABLE `__new_engagement_log` RENAME TO `engagement_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_log_ref_unique` ON `engagement_log` (`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_log_engagement_id_unique` ON `engagement_log` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `engagement_log_client_status_published_idx` ON `engagement_log` (`client_id`,`status`,`published_at`);