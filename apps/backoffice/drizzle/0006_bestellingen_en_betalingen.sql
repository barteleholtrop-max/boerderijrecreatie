CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`position` integer NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`station` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`vat` text NOT NULL,
	`vat_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_lines_order_position_unique` ON `order_lines` (`order_id`,`position`);--> statement-breakpoint
CREATE INDEX `order_lines_station_order_idx` ON `order_lines` (`station`,`order_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`method` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`external_ref` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_request_id_unique` ON `payments` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_external_ref_unique` ON `payments` (`provider`,`external_ref`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `mode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `status` text DEFAULT 'vastgelegd' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'niet-gekoppeld' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `total_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `vat9_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `vat21_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `test` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created`);--> statement-breakpoint
-- Eenmalig vullen vanuit de bestaande, ongewijzigde bestel-JSON. De JSON blijft de historische vastlegging.
UPDATE `orders` SET
	`mode` = coalesce(json_extract(`data`, '$.mode'), ''),
	`reference` = coalesce(json_extract(`data`, '$.reference'), ''),
	`total_cents` = coalesce(json_extract(`data`, '$.totalCents'), 0),
	`vat9_cents` = (SELECT coalesce(sum(json_extract(l.value, '$.vatCents')), 0) FROM json_each(`orders`.`data`, '$.lines') l WHERE json_extract(l.value, '$.vat') = '9'),
	`vat21_cents` = (SELECT coalesce(sum(json_extract(l.value, '$.vatCents')), 0) FROM json_each(`orders`.`data`, '$.lines') l WHERE json_extract(l.value, '$.vat') = '21'),
	`test` = CASE WHEN json_extract(`data`, '$.test') = 1 THEN 1 ELSE 0 END;--> statement-breakpoint
INSERT OR IGNORE INTO `order_lines` (`order_id`, `position`, `product_id`, `name`, `station`, `quantity`, `unit_cents`, `total_cents`, `vat`, `vat_cents`)
SELECT o.`id`, l.key, json_extract(l.value, '$.productId'), json_extract(l.value, '$.name'), json_extract(l.value, '$.station'), json_extract(l.value, '$.quantity'),
	json_extract(l.value, '$.unitCents'), json_extract(l.value, '$.totalCents'), json_extract(l.value, '$.vat'), json_extract(l.value, '$.vatCents')
FROM `orders` o, json_each(o.`data`, '$.lines') l;
