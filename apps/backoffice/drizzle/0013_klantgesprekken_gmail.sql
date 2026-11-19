CREATE TABLE `mail_accounts` (
	`mailbox` text PRIMARY KEY NOT NULL,
	`refresh_token` text,
	`scopes` text DEFAULT '' NOT NULL,
	`label_name` text NOT NULL,
	`label_id` text,
	`history_id` text,
	`status` text DEFAULT 'niet-verbonden' NOT NULL,
	`last_sync_ok` text,
	`last_sync_attempt` text,
	`last_error` text,
	`connected_by` text DEFAULT '' NOT NULL,
	`connected_at` text,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_calendar_events` (
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`ref` text NOT NULL,
	`hash` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`calendar_id`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `mail_calendars` (
	`mailbox` text NOT NULL,
	`calendar_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`last_sync_ok` text,
	`last_error` text,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `calendar_id`)
);
--> statement-breakpoint
CREATE TABLE `mail_draft_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`mailbox` text NOT NULL,
	`thread_id` text NOT NULL,
	`draft_id` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_drafts` (
	`mailbox` text NOT NULL,
	`draft_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`source` text DEFAULT 'gmail' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`seen` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `draft_id`)
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_thread_idx` ON `mail_drafts` (`mailbox`,`thread_id`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`mailbox` text NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`internal_date` text NOT NULL,
	`from_email` text DEFAULT '' NOT NULL,
	`from_us` integer DEFAULT 0 NOT NULL,
	`is_draft` integer DEFAULT 0 NOT NULL,
	`unread` integer DEFAULT 0 NOT NULL,
	`attachments` integer DEFAULT 0 NOT NULL,
	`label_ids` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`mailbox`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `mail_messages_thread_idx` ON `mail_messages` (`mailbox`,`thread_id`);--> statement-breakpoint
CREATE TABLE `mail_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_sends` (
	`request_id` text PRIMARY KEY NOT NULL,
	`mailbox` text NOT NULL,
	`thread_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`draft_message_id` text NOT NULL,
	`status` text NOT NULL,
	`sent_message_id` text,
	`error` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_sends_active_draft` ON `mail_sends` (`mailbox`,`draft_id`) WHERE status IN ('bezig','verzonden','onzeker');--> statement-breakpoint
CREATE INDEX `mail_sends_thread_idx` ON `mail_sends` (`mailbox`,`thread_id`);--> statement-breakpoint
CREATE TABLE `mail_thread_links` (
	`mailbox` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `thread_id`, `kind`, `ref`)
);
--> statement-breakpoint
CREATE TABLE `mail_thread_state` (
	`mailbox` text NOT NULL,
	`thread_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned` text DEFAULT '' NOT NULL,
	`customer_id` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `thread_id`)
);
--> statement-breakpoint
CREATE TABLE `mail_threads` (
	`mailbox` text NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`last_message_at` text DEFAULT '' NOT NULL,
	`last_message_id` text DEFAULT '' NOT NULL,
	`last_from_us` integer DEFAULT 0 NOT NULL,
	`last_customer_at` text DEFAULT '' NOT NULL,
	`unread` integer DEFAULT 0 NOT NULL,
	`labeled` integer DEFAULT 1 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`attachment_count` integer DEFAULT 0 NOT NULL,
	`draft_count` integer DEFAULT 0 NOT NULL,
	`automated` integer DEFAULT 0 NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`synced` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `thread_id`)
);
--> statement-breakpoint
CREATE INDEX `mail_threads_list_idx` ON `mail_threads` (`mailbox`,`labeled`,`last_message_at`);