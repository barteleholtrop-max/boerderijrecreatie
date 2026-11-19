-- Coöperatieve winkel: eigenaar per product, inhouding per deelnemer en de wekelijkse afrekening (akkoord eigenaar 3 november 2026).
-- Deelnemers: IBAN versleuteld (iban_sealed); alleen de laatste 4 cijfers staan leesbaar voor het overzicht.
CREATE TABLE `coop_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`holder` text DEFAULT '' NOT NULL,
	`iban_sealed` text,
	`iban_last4` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`vat_inclusive` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
-- Percentage dat de coöperatie inhoudt, vanaf een datum (basispunten: 1500 = 15%). Een afgesloten week verandert nooit achteraf.
CREATE TABLE `coop_rates` (
	`participant_id` text NOT NULL REFERENCES `coop_participants`(`id`),
	`valid_from` text NOT NULL,
	`percent_bp` integer NOT NULL,
	`created` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`participant_id`, `valid_from`)
);
--> statement-breakpoint
-- Eigenaar per product. Geen rij (of participant_id leeg) = de coöperatie zelf.
CREATE TABLE `product_owners` (
	`product_id` text PRIMARY KEY NOT NULL,
	`participant_id` text REFERENCES `coop_participants`(`id`),
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
-- Goedgekeurde weken: de afrekening ligt vast (snapshot), daarna "uitbetaald".
CREATE TABLE `coop_weeks` (
	`week` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL,
	`paid_by` text,
	`paid_at` text
);
--> statement-breakpoint
-- Gegevens van de coöperatie voor het betaalbestand (één rij). IBAN versleuteld.
CREATE TABLE `coop_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`debtor_name` text DEFAULT '' NOT NULL,
	`iban_sealed` text,
	`iban_last4` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
-- De eigenaar wordt bij de verkoopregel vastgelegd, zoals de prijs. Oude regels (leeg) rekenen met de huidige eigenaar.
ALTER TABLE `order_lines` ADD `owner_id` text;
--> statement-breakpoint
-- Snel zoeken op eigenaar bij de weekafsluiting.
CREATE INDEX `order_lines_owner_idx` ON `order_lines` (`owner_id`);
