CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`account` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'tekst' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`audio_key` text,
	`content` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `assistant_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_messages_thread_seq` ON `assistant_messages` (`thread_id`,`seq`);--> statement-breakpoint
CREATE INDEX `assistant_messages_created` ON `assistant_messages` (`created`);--> statement-breakpoint
CREATE TABLE `assistant_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`week` text NOT NULL,
	`account` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_threads_week` ON `assistant_threads` (`domain`,`week`);--> statement-breakpoint
CREATE TABLE `marketing_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`week_menu_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`media_id` text,
	`channels` text DEFAULT '[]' NOT NULL,
	`drafts` text DEFAULT '{}' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `marketing_tasks_status` ON `marketing_tasks` (`status`);--> statement-breakpoint
CREATE TABLE `outbox_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'wachtend' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`run_after` text NOT NULL,
	`locked_until` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_jobs_key_unique` ON `outbox_jobs` (`key`);--> statement-breakpoint
CREATE INDEX `outbox_jobs_due` ON `outbox_jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`domain` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'concept' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`thread_id` text,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text DEFAULT '' NOT NULL,
	`decision_request_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_request_id_unique` ON `proposals` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_decision_request_id_unique` ON `proposals` (`decision_request_id`);--> statement-breakpoint
CREATE INDEX `proposals_status` ON `proposals` (`status`,`created`);--> statement-breakpoint
CREATE TABLE `week_menu_items` (
	`menu_id` text NOT NULL,
	`position` integer NOT NULL,
	`product_id` text NOT NULL,
	`day` text DEFAULT '' NOT NULL,
	`portions` real,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`menu_id`, `position`),
	FOREIGN KEY (`menu_id`) REFERENCES `week_menus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `week_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`week` text NOT NULL,
	`status` text DEFAULT 'concept' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`thread_id` text,
	`confirmed_by` text,
	`confirmed_at` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `week_menus_week` ON `week_menus` (`week`);--> statement-breakpoint
CREATE UNIQUE INDEX `week_menus_one_confirmed` ON `week_menus` (`week`) WHERE status = 'bevestigd';