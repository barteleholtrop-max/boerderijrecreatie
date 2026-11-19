-- Beginwaarden die de backoffice verwacht (zoals in de SQLite-migraties 0009 en 0021). Bestaan ze al, dan blijven ze staan.
INSERT INTO "availability_settings" ("id","data","version","updated") VALUES (1,'{"openingHours":[null,null,null,null,null,null,null],"closedDays":[],"yte":{"weekdays":[4],"times":["19:00"],"capacityGuests":50,"weeksAhead":8,"closedDates":[]}}',1,'2026-11-02T00:00:00.000Z') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "guest_settings" ("id","rev","res_rev","data") VALUES (1,0,0,'{}') ON CONFLICT DO NOTHING;
