-- Deelnemerspagina: een deelnemer voegt zelf een product toe (besluit eigenaar 4 november 2026: meteen live, met een
-- kleine melding voor Rianne en Bartele). De melding is een verzoek van de soort 'nieuw-product' met het product erbij.
ALTER TABLE `coop_requests` ADD `product_id` text;
