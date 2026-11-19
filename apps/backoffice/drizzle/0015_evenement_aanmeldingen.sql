CREATE TABLE `event_signups` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`people` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'aangemeld' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT '' NOT NULL,
	`paid_at` text,
	`paid_by` text DEFAULT '' NOT NULL,
	`confirmation` text DEFAULT '' NOT NULL,
	`confirmation_message_id` text,
	`confirmation_error` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_signups_request_id_unique` ON `event_signups` (`request_id`);--> statement-breakpoint
CREATE INDEX `event_signups_event_idx` ON `event_signups` (`event_id`,`status`);