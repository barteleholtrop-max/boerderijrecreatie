-- Gastgegevens in eigen tabellen (akkoord eigenaar, 3 november 2026).
-- Wat groeit (reserveringen, klanten, evenementen, afhalen, bezoekdagen, gesprekken, groepskennis, groepsadvies, logboek)
-- krijgt een eigen tabel; de kleine instellingen (openingstijden, uitzonderingen, tafels, capaciteit, tijdblokken, Yte) blijven één document.
-- Elke rij heeft een eigen versienummer (rev). guest_days houdt per dag een versienummer bij, zodat een boeking alleen
-- botst met een gelijktijdige wijziging op dezelfde dag. De bestaande gegevens worden hieronder eenmalig gekopieerd,
-- in dezelfde transactie als het aanmaken van de tabellen. guest_workspace blijft onaangeroerd bewaard als naslag.
-- seq telt elke opslagactie; zolang die gelijk is, mag de backoffice de rijen uit het geheugen gebruiken.
CREATE TABLE guest_settings (id INTEGER PRIMARY KEY CHECK(id=1), rev INTEGER NOT NULL, res_rev INTEGER NOT NULL, seq INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
CREATE TABLE guest_reservations (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE INDEX guest_reservations_day_idx ON guest_reservations(day);
CREATE TABLE guest_customers (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE TABLE guest_events (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE INDEX guest_events_day_idx ON guest_events(day);
CREATE TABLE guest_pickups (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE INDEX guest_pickups_day_idx ON guest_pickups(day);
CREATE TABLE guest_visits (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE TABLE guest_threads (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE TABLE guest_knowledge (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE TABLE guest_advice (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, pos INTEGER NOT NULL, day TEXT, data TEXT NOT NULL);
CREATE TABLE guest_days (day TEXT PRIMARY KEY, rev INTEGER NOT NULL);
CREATE TABLE guest_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, by TEXT NOT NULL, action TEXT NOT NULL, reference TEXT NOT NULL);

-- Eenmalige kopie uit het bestaande document. Bij dubbele kenmerken telt de eerste (zoals de huidige code met find()).
INSERT INTO guest_settings(id,rev,res_rev,data)
 SELECT 1, version, 0, json_remove(data,'$.reservations','$.customers','$.events','$.pickups','$.visits','$.threads','$.groupKnowledge','$.groupAdvice','$.audit')
 FROM guest_workspace WHERE id=1;
INSERT OR IGNORE INTO guest_settings(id,rev,res_rev,data) VALUES(1,0,0,'{}');
INSERT OR IGNORE INTO guest_reservations(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,json_extract(j.value,'$.date'),j.value FROM guest_workspace w, json_each(w.data,'$.reservations') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_customers(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,NULL,j.value FROM guest_workspace w, json_each(w.data,'$.customers') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_events(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,json_extract(j.value,'$.date'),j.value FROM guest_workspace w, json_each(w.data,'$.events') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_pickups(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,json_extract(j.value,'$.date'),j.value FROM guest_workspace w, json_each(w.data,'$.pickups') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_visits(id,rev,pos,day,data) SELECT json_extract(j.value,'$.date'),1,j.key,json_extract(j.value,'$.date'),j.value FROM guest_workspace w, json_each(w.data,'$.visits') j WHERE json_extract(j.value,'$.date') IS NOT NULL;
INSERT OR IGNORE INTO guest_threads(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,NULL,j.value FROM guest_workspace w, json_each(w.data,'$.threads') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_knowledge(id,rev,pos,day,data) SELECT json_extract(j.value,'$.id'),1,j.key,NULL,j.value FROM guest_workspace w, json_each(w.data,'$.groupKnowledge') j WHERE json_extract(j.value,'$.id') IS NOT NULL;
INSERT OR IGNORE INTO guest_advice(id,rev,pos,day,data) SELECT j.key,1,row_number() OVER (),NULL,j.value FROM guest_workspace w, json_each(w.data,'$.groupAdvice') j;
INSERT OR IGNORE INTO guest_days(day,rev) SELECT DISTINCT day,1 FROM guest_reservations WHERE day IS NOT NULL;
INSERT INTO guest_audit(at,by,action,reference) SELECT COALESCE(json_extract(j.value,'$.at'),''),COALESCE(json_extract(j.value,'$.by'),''),COALESCE(json_extract(j.value,'$.action'),''),COALESCE(json_extract(j.value,'$.reference'),'') FROM guest_workspace w, json_each(w.data,'$.audit') j ORDER BY j.key;
