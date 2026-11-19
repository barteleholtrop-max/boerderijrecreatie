-- Koppeling met het Google Bedrijfsprofiel (besluit eigenaar 4 november 2026, stap 2). Eén rij: het gekoppelde Google-account
-- (de toegang versleuteld), het gekozen profiel en wat er wordt bijgewerkt. Plus welke evenementen als bericht op Google staan.
CREATE TABLE `gbp_link` (
	`id` text PRIMARY KEY NOT NULL,
	`account_email` text DEFAULT '' NOT NULL,
	`refresh_sealed` text,
	`account` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`location_title` text DEFAULT '' NOT NULL,
	`sync_hours` integer DEFAULT 1 NOT NULL,
	`sync_events` integer DEFAULT 1 NOT NULL,
	`hours_hash` text DEFAULT '' NOT NULL,
	`last_sync` text,
	`last_error` text,
	`connected_by` text DEFAULT '' NOT NULL,
	`connected_at` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gbp_posts` (
	`event_id` text PRIMARY KEY NOT NULL,
	`post_name` text NOT NULL,
	`hash` text NOT NULL,
	`updated` text NOT NULL
);
