-- Herkomst en eigen prijs per ingrediënt (besluit eigenaar 3 november 2026).
-- origin: 'inkoop' (ingekocht; de factuurprijs gaat altijd voor) of 'eigen' (van eigen boerderij, nooit gekoppeld aan inkoopfacturen).
-- own_cents: eigen kostprijs (bij 'eigen') of tijdelijke schatting (bij 'inkoop') per kg, liter of stuk, exclusief btw. Leeg = geen prijs.
-- Bestaande ingrediënten krijgen 'inkoop' en geen eigen prijs: hun kostprijs verandert niet.
ALTER TABLE `ingredients` ADD `origin` text DEFAULT 'inkoop' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ingredients` ADD `own_cents` real;
