-- Evenementen online betalen via Mollie (besluit eigenaar 3 november 2026). Alleen toevoegingen.
-- signup_payments: één regel per betaalpoging van een aanmelding (zoals payments voor bestellingen).
-- event_signups.hold_until: tot wanneer een nog niet betaalde aanmelding haar plaats vasthoudt. Leeg = altijd meetellen
-- (gratis, betalen ter plekke of al betaald). Bestaande aanmeldingen blijven dus gewoon meetellen.
CREATE TABLE `signup_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`signup_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`provider` text NOT NULL,
	`external_ref` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`signup_id`) REFERENCES `event_signups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_payments_request_id_unique` ON `signup_payments` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `signup_payments_provider_external_ref_unique` ON `signup_payments` (`provider`,`external_ref`);--> statement-breakpoint
CREATE INDEX `signup_payments_signup_idx` ON `signup_payments` (`signup_id`);--> statement-breakpoint
ALTER TABLE `event_signups` ADD `hold_until` text;
