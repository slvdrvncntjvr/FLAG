CREATE TABLE `auth_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "auth_rate_limit_count_check" CHECK("auth_rate_limit"."count" >= 1)
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limit_expiry_idx` ON `auth_rate_limit` (`expires_at`);