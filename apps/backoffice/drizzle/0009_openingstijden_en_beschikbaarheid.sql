-- Openingstijden en Yte-momenten: centrale bron voor de website (lampje open/gesloten, boekbare dagen).
-- Eén rij met versieveld; een verouderde wijziging geeft 409 in plaats van te overschrijven.
-- Beginwaarde Yte volgt de planbordafspraak van 20 oktober 2026 (donderdag 19.00 uur, voorlopig 50 gasten).
-- Openingstijden zijn nog niet bekend en blijven leeg tot de eigenaar ze invult.
CREATE TABLE `availability_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `availability_settings` (`id`,`data`,`version`,`updated`) VALUES (1,'{"openingHours":[null,null,null,null,null,null,null],"closedDays":[],"yte":{"weekdays":[4],"times":["19:00"],"capacityGuests":50,"weeksAhead":8,"closedDates":[]}}',1,'2026-11-02T00:00:00.000Z');
