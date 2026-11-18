CREATE TABLE `hive_custom_services` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hive_service_submission` ON `hive_custom_services` (`owner_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `hive_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`service_id` text NOT NULL,
	`attribute` text NOT NULL,
	`value` text NOT NULL,
	`observed_on` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hive_observation_submission` ON `hive_observations` (`owner_id`,`submission_id`);--> statement-breakpoint
CREATE INDEX `hive_observation_owner` ON `hive_observations` (`owner_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `hive_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`service_id` text NOT NULL,
	`category` text NOT NULL,
	`region` text NOT NULL,
	`age_band` text NOT NULL,
	`mobility` text NOT NULL,
	`language` text NOT NULL,
	`timing` text NOT NULL,
	`delivery` text NOT NULL,
	`satisfaction` integer,
	`reason` text NOT NULL,
	`share` integer DEFAULT 0 NOT NULL,
	`occurred_on` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hive_outcome_submission` ON `hive_outcomes` (`owner_id`,`submission_id`);--> statement-breakpoint
CREATE INDEX `hive_outcome_owner_service` ON `hive_outcomes` (`owner_id`,`service_id`);--> statement-breakpoint
CREATE INDEX `hive_outcome_shared` ON `hive_outcomes` (`service_id`,`share`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `hive_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`region` text NOT NULL,
	`language` text NOT NULL,
	`goal` text NOT NULL,
	`updated_at` text NOT NULL
);
