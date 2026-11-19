-- Google Drive als beeldbank (akkoord eigenaar 3 november 2026). Alleen lezen; foto's worden gekopieerd naar de beeldbibliotheek.
-- drive_files: elk gezien Drive-bestand één keer (overgenomen of overgeslagen met reden), zodat niets dubbel of steeds opnieuw gaat.
CREATE TABLE `drive_files` (
	`file_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`media_id` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
-- drive_sync: één rij met de stand van het ophalen (laatste poging, laatste gelukte keer, melding, slot tegen dubbel ophalen).
CREATE TABLE `drive_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt` text,
	`last_ok` text,
	`last_error` text,
	`summary` text DEFAULT '{}' NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
