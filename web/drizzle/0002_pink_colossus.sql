CREATE TABLE `client_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text NOT NULL,
	`city` text,
	`registration_no` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_profile_kind_check" CHECK("client_profile"."kind" IN ('individual','business'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_profile_user_id_unique` ON `client_profile` (`user_id`);--> statement-breakpoint
CREATE INDEX `client_profile_display_name_idx` ON `client_profile` (`display_name`);--> statement-breakpoint
CREATE TABLE `engagement` (
	`id` text PRIMARY KEY NOT NULL,
	`freelancer_id` text NOT NULL,
	`client_id` text,
	`title` text NOT NULL,
	`client_name_hint` text NOT NULL,
	`started_on` text NOT NULL,
	`ended_at` text,
	`status` text DEFAULT 'invited' NOT NULL,
	`invite_token_hash` text NOT NULL,
	`invite_expires_at` text NOT NULL,
	`accepted_at` text,
	`declined_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancer_profile`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`client_id`) REFERENCES `client_profile`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "engagement_status_check" CHECK("engagement"."status" IN ('invited','accepted','declined','expired','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_invite_token_hash_unique` ON `engagement` (`invite_token_hash`);--> statement-breakpoint
CREATE INDEX `engagement_freelancer_idx` ON `engagement` (`freelancer_id`);--> statement-breakpoint
CREATE INDEX `engagement_client_idx` ON `engagement` (`client_id`);--> statement-breakpoint
CREATE TABLE `freelancer_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`city` text,
	`status` text DEFAULT 'unverified' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "freelancer_profile_status_check" CHECK("freelancer_profile"."status" IN ('unverified','pending','verified','rejected','suspended'))
);
--> statement-breakpoint
CREATE TABLE `portfolio_link` (
	`id` text PRIMARY KEY NOT NULL,
	`freelancer_id` text NOT NULL,
	`url` text NOT NULL,
	`label` text,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancer_profile`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portfolio_link_freelancer_idx` ON `portfolio_link` (`freelancer_id`);--> statement-breakpoint
CREATE TABLE `verification_case` (
	`id` text PRIMARY KEY NOT NULL,
	`freelancer_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`method` text DEFAULT 'live_manual' NOT NULL,
	`id_kind` text NOT NULL,
	`result` text NOT NULL,
	`name_match` integer NOT NULL,
	`inspected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`decision` text,
	`reason` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancer_profile`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "verification_case_method_check" CHECK("verification_case"."method" = 'live_manual'),
	CONSTRAINT "verification_case_id_kind_check" CHECK("verification_case"."id_kind" IN ('philid','ephilid','passport','drivers_licence')),
	CONSTRAINT "verification_case_result_check" CHECK("verification_case"."result" IN ('pass','fail')),
	CONSTRAINT "verification_case_decision_check" CHECK("verification_case"."decision" IS NULL OR "verification_case"."decision" IN ('approve','reject'))
);
--> statement-breakpoint
CREATE INDEX `verification_case_freelancer_idx` ON `verification_case` (`freelancer_id`);