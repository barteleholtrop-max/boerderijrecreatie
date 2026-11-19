CREATE TABLE `incoming_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`remaining` real NOT NULL,
	`due` text NOT NULL,
	`status` text NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`article` text DEFAULT '' NOT NULL,
	`stock` real DEFAULT 0 NOT NULL,
	`known` integer DEFAULT 0 NOT NULL,
	`counted_at` text DEFAULT '' NOT NULL,
	`pack` real NOT NULL,
	`min` real DEFAULT 0 NOT NULL,
	`lead_days` real DEFAULT 0 NOT NULL,
	`shelf_days` real DEFAULT 0 NOT NULL,
	`allergens` text DEFAULT '[]' NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`invoice_id` text NOT NULL,
	`id` text NOT NULL,
	`position` integer NOT NULL,
	`article` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`net_cents` integer NOT NULL,
	`ingredient_id` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`order_id` text,
	PRIMARY KEY(`invoice_id`, `id`),
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_ingredient_idx` ON `invoice_lines` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoices_date_idx` ON `invoices` (`date`);--> statement-breakpoint
CREATE TABLE `operation_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`version` integer,
	`action` text DEFAULT '' NOT NULL,
	`created` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_requests_version_unique` ON `operation_requests` (`version`);--> statement-breakpoint
CREATE TABLE `recipe_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`date` text NOT NULL,
	`portion_cents` integer,
	`recipe` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_history_product_idx` ON `recipe_history` (`product_id`);--> statement-breakpoint
CREATE TABLE `recipe_lines` (
	`product_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`position` integer NOT NULL,
	`quantity` real NOT NULL,
	PRIMARY KEY(`product_id`, `ingredient_id`),
	FOREIGN KEY (`product_id`) REFERENCES `recipes`(`product_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`product_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`yield` real NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`loss_pct` real DEFAULT 0 NOT NULL,
	`packaging_cents` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_moves_seq_unique` ON `stock_moves` (`seq`);--> statement-breakpoint
CREATE INDEX `stock_moves_ingredient_idx` ON `stock_moves` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `stock_moves_reason_idx` ON `stock_moves` (`reason`);--> statement-breakpoint
-- Eenmalig overzetten uit het JSON-document operations_state (dat blijft ongewijzigd staan als back-up).
INSERT INTO `ingredients` (`id`,`name`,`unit`,`supplier`,`article`,`stock`,`known`,`counted_at`,`pack`,`min`,`lead_days`,`shelf_days`,`allergens`,`checked`,`notes`,`position`)
SELECT json_extract(i.value,'$.id'), json_extract(i.value,'$.name'), json_extract(i.value,'$.unit'), coalesce(json_extract(i.value,'$.supplier'),''), coalesce(json_extract(i.value,'$.article'),''),
	coalesce(json_extract(i.value,'$.stock'),0), coalesce(json_extract(i.value,'$.known'),0), coalesce(json_extract(i.value,'$.countedAt'),''), json_extract(i.value,'$.pack'), coalesce(json_extract(i.value,'$.min'),0),
	coalesce(json_extract(i.value,'$.leadDays'),0), coalesce(json_extract(i.value,'$.shelfDays'),0), coalesce(json_extract(i.value,'$.allergens'),'[]'), coalesce(json_extract(i.value,'$.checked'),0), coalesce(json_extract(i.value,'$.notes'),''), i.key
FROM `operations_state` o, json_each(o.`data`,'$.ingredients') i WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `invoices` (`id`,`supplier`,`number`,`date`,`source`,`reviewed`,`position`)
SELECT json_extract(v.value,'$.id'), json_extract(v.value,'$.supplier'), json_extract(v.value,'$.number'), json_extract(v.value,'$.date'), coalesce(json_extract(v.value,'$.source'),''), coalesce(json_extract(v.value,'$.reviewed'),0), v.key
FROM `operations_state` o, json_each(o.`data`,'$.invoices') v WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `invoice_lines` (`invoice_id`,`id`,`position`,`article`,`description`,`quantity`,`unit`,`net_cents`,`ingredient_id`,`kind`,`received`,`order_id`)
SELECT json_extract(v.value,'$.id'), json_extract(l.value,'$.id'), l.key, coalesce(json_extract(l.value,'$.article'),''), coalesce(json_extract(l.value,'$.description'),''), json_extract(l.value,'$.quantity'), json_extract(l.value,'$.unit'),
	json_extract(l.value,'$.netCents'), coalesce(json_extract(l.value,'$.ingredientId'),''), json_extract(l.value,'$.kind'), coalesce(json_extract(l.value,'$.received'),0), json_extract(l.value,'$.orderId')
FROM `operations_state` o, json_each(o.`data`,'$.invoices') v, json_each(v.value,'$.lines') l WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `recipes` (`product_id`,`name`,`yield`,`method`,`loss_pct`,`packaging_cents`,`version`,`reviewed`,`position`)
SELECT json_extract(r.value,'$.productId'), json_extract(r.value,'$.name'), json_extract(r.value,'$.yield'), coalesce(json_extract(r.value,'$.method'),''), coalesce(json_extract(r.value,'$.lossPct'),0),
	coalesce(json_extract(r.value,'$.packagingCents'),0), coalesce(json_extract(r.value,'$.version'),1), coalesce(json_extract(r.value,'$.reviewed'),0), r.key
FROM `operations_state` o, json_each(o.`data`,'$.recipes') r WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `recipe_lines` (`product_id`,`ingredient_id`,`position`,`quantity`)
SELECT json_extract(r.value,'$.productId'), json_extract(l.value,'$.ingredientId'), l.key, json_extract(l.value,'$.quantity')
FROM `operations_state` o, json_each(o.`data`,'$.recipes') r, json_each(r.value,'$.lines') l WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `recipe_history` (`product_id`,`date`,`portion_cents`,`recipe`)
SELECT json_extract(h.value,'$.recipe.productId'), json_extract(h.value,'$.date'), json_extract(h.value,'$.portionCents'), json_extract(h.value,'$.recipe')
FROM `operations_state` o, json_each(o.`data`,'$.recipeHistory') h WHERE o.`id`=1 ORDER BY h.key;--> statement-breakpoint
INSERT INTO `stock_moves` (`id`,`seq`,`ingredient_id`,`quantity`,`date`,`reason`,`reference`)
SELECT json_extract(m.value,'$.id'), m.key+1, json_extract(m.value,'$.ingredientId'), json_extract(m.value,'$.quantity'), json_extract(m.value,'$.date'), json_extract(m.value,'$.reason'), coalesce(json_extract(m.value,'$.reference'),'')
FROM `operations_state` o, json_each(o.`data`,'$.moves') m WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `incoming_orders` (`id`,`ingredient_id`,`quantity`,`remaining`,`due`,`status`,`supplier`,`position`)
SELECT json_extract(x.value,'$.id'), json_extract(x.value,'$.ingredientId'), json_extract(x.value,'$.quantity'), json_extract(x.value,'$.remaining'), json_extract(x.value,'$.due'), json_extract(x.value,'$.status'), coalesce(json_extract(x.value,'$.supplier'),''), x.key
FROM `operations_state` o, json_each(o.`data`,'$.incoming') x WHERE o.`id`=1;--> statement-breakpoint
INSERT OR IGNORE INTO `operation_requests` (`request_id`,`version`,`action`,`created`)
SELECT r.value, NULL, 'voor migratie 0007', '' FROM `operations_state` o, json_each(o.`data`,'$.requests') r WHERE o.`id`=1;--> statement-breakpoint
INSERT INTO `operation_requests` (`request_id`,`version`,`action`,`created`)
SELECT 'migratie-0007', o.`version`, 'migratie', o.`updated` FROM `operations_state` o WHERE o.`id`=1;
