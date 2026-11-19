-- Wens eigenaar 16 november 2026: „Ite is een apart onderdeel wat we op de avond doen... Het aanslaan hoort bij het dag restaurant.”
-- en „alles vóór 18:00 is dagrestaurant”. Eenmalig: eerdere bestellingen op de route Ite (yte) die vóór 18:00 Nederlandse tijd
-- zijn aangeslagen, gaan naar de route Dagrestaurant (zelfservice). Bedragen, betalingen en weekafsluitingen veranderen niet;
-- alleen het verkoopkanaal in het verkoopoverzicht. Geen tabel- of kolomwijziging.
UPDATE "orders" SET "mode"='zelfservice'
 WHERE "mode"='yte' AND ("created"::timestamptz AT TIME ZONE 'Europe/Amsterdam')::time < time '18:00';
