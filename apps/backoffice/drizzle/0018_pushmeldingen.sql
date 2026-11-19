-- Pushmelding "Je bestelling staat klaar" (akkoord eigenaar 3 november 2026). Eén aanmelding per bestelling en telefoon.
-- Aanmeldingen worden na 1 dag verwijderd (expires). sent: de werkplekken waarvoor de melding al is verstuurd.
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL REFERENCES `orders`(`id`),
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`sent` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_order_endpoint_unique` ON `push_subscriptions` (`order_id`,`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_expires_idx` ON `push_subscriptions` (`expires`);
