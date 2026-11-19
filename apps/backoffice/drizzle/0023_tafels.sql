-- Tafels voor het opnamescherm (wens eigenaar 3 november 2026: „zelf instelbaar”). Volgorde = position.
CREATE TABLE `service_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_tables_name_unique` ON `service_tables` (`name`);
