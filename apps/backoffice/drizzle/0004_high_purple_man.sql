CREATE TABLE `sheet_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_sync` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `sheet_links` (
	`source_id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`revision` text NOT NULL,
	`baseline` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sheet_links_product_id_unique` ON `sheet_links` (`product_id`);