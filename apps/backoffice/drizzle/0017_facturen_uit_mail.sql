-- Facturen uit de mail (besluit eigenaar 3 november 2026): inkoopfacturen met het Gmail-label „Inkoop” in
-- administratie@boerbart.nl verschijnen bij Inkoop › Facturen. Alleen een index (afzender, onderwerp, datum en de
-- kenmerken van de PDF-bijlagen) en de verwerkstatus; de PDF zelf wordt nooit bewaard.
-- Een koppelpoging onthoudt nu waarvoor ze is: klantgesprekken (bestaand, standaard) of factuurmail.
ALTER TABLE `mail_oauth_states` ADD `purpose` text DEFAULT 'klantgesprekken' NOT NULL;
--> statement-breakpoint
CREATE TABLE `invoice_mails` (
	`mailbox` text NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`from_email` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`received` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'nieuw' NOT NULL,
	`invoice_id` text,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`mailbox`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `invoice_mails_status_idx` ON `invoice_mails` (`mailbox`,`status`,`received`);
