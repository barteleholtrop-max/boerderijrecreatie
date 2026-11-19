-- Eigen bedrag en groepscode bij bestellen (besluit eigenaar, 3 november 2026). Alleen toevoegingen; bestaande
-- bestellingen blijven ongewijzigd (nieuwe kolommen zijn leeg of 0 en betekenen "normale prijs").
CREATE TABLE `order_price_settings` (
	`context` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`max_percent` integer DEFAULT 300 NOT NULL,
	`allow_zero` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`host` text DEFAULT '' NOT NULL,
	`budget_cents` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text NOT NULL,
	`status` text DEFAULT 'actief' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_codes_code_unique` ON `group_codes` (`code`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `sales_context` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `commercial_cents` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `chosen_cents` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `difference_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `chosen_vat9_cents` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `chosen_vat21_cents` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `group_code_id` text REFERENCES group_codes(id);
--> statement-breakpoint
CREATE INDEX `orders_group_code_idx` ON `orders` (`group_code_id`);
--> statement-breakpoint
ALTER TABLE `order_lines` ADD `paid_cents` integer;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD `paid_vat_cents` integer;
