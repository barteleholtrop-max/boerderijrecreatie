-- Deelnemerspagina (besluit eigenaar 4 november 2026): elke deelnemer van de coöperatieve winkel krijgt een persoonlijke
-- link (snelkoppeling op de telefoon) om voorraad te leveren, de eigen verkoopprijs te bepalen en de eigen gegevens te zien.
-- De link zelf staat alleen versleuteld (token_sealed, om hem opnieuw te kunnen tonen); opzoeken gaat via de hash.
CREATE TABLE `coop_portal_links` (
	`participant_id` text PRIMARY KEY NOT NULL REFERENCES `coop_participants`(`id`),
	`token_hash` text NOT NULL,
	`token_sealed` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`last_used` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coop_portal_links_hash` ON `coop_portal_links` (`token_hash`);
--> statement-breakpoint
-- Een nieuw IBAN via de deelnemerspagina gaat nooit direct in: het is een verzoek dat Rianne of Bartele goedkeurt.
CREATE TABLE `coop_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL REFERENCES `coop_participants`(`id`),
	`kind` text NOT NULL,
	`holder` text DEFAULT '' NOT NULL,
	`iban_sealed` text,
	`iban_last4` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created` text NOT NULL,
	`decided_by` text,
	`decided_at` text
);
--> statement-breakpoint
CREATE INDEX `coop_requests_status_idx` ON `coop_requests` (`status`,`created`);
