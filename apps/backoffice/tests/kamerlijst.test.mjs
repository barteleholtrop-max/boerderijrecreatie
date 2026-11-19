// Kamerlijst — bewaking tegen "per ongeluk een kamer slopen".
// Elke kamer die nu bestaat, moet blijven bestaan: menu-onderdeel, scherm, API-deur, databasetabel, migratie en websitepagina.
// Verhuist een kamer, dan blijft het oude adres bestaan (doorverwijzing) en wordt deze lijst bewust aangepast in dezelfde pull
// request, met uitleg, zodat de eigenaar het ziet vóór samenvoegen. Nieuwe kamers voeg je hier toe zodra ze in main staan.
//
// Startpakket (19 november 2026): opnieuw opgesteld uit de kopie van de Boerderijrecreatie-backoffice, zonder de onderdelen van de
// coöperatie (Bloei, leden, BB-tegoed, potten, overleg, Ite, oogstabonnementen). Wat hieronder staat, is de beginstand.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = new URL('../app/', import.meta.url);
const exists = rel => fs.existsSync(new URL(rel, app));
const pageFile = route => (route === '/' ? '' : route.slice(1) + '/') + 'page.tsx';

// Menu-onderdelen (adres → naam in het menu). De naam mag veranderen, het adres moet in het menu blijven.
const MENU = {"/": "Dashboard", "/goedkeuringen": "Goedkeuringen", "/assistent": "Weekassistent", "/planning": "Agenda & reserveringen", "/gesprekken": "Gesprekken & klanten", "/offertes": "Offertes & groepen", "/werkplekken": "Kassa & bestellingen", "/producten": "Gerechten & prijzen", "/winkel": "Boerderijwinkel", "/inkoop": "Inkoop & voorraad", "/financien": "Betalingen & facturen", "/website": "Website", "/openingstijden": "Openingstijden & capaciteit", "/bedrijfsgegevens": "Bedrijfsgegevens & documenten", "/toegang": "Toegang", "/koppeling": "Koppelingen & printers"};
// Schermen (eigen pagina of doorverwijzing).
const SCREENS = ["/", "/apps", "/assistent", "/assistent/telefoon", "/assistent/telefoon/boodschappen", "/bedrijfsgegevens", "/bestelopties", "/financien", "/financien/facturen", "/financien/factuur", "/financien/verkoopoverzicht", "/geen-onderdelen", "/gesprekken", "/gesprekken/telefoon", "/goedkeuringen", "/inhoud", "/inkoop", "/inloggen", "/inloggen/code", "/inloggen/nieuw-wachtwoord", "/kassa", "/klanten", "/koppeling", "/koppeling/printers", "/management/assistent", "/management/assistent/boodschappen", "/management/gesprekken", "/management/planning", "/management/taken", "/marketing", "/offerte/[token]", "/offertes", "/offertes/document", "/openingstijden", "/opnemen", "/planning", "/planning/telefoon", "/planning/voorspelling", "/prijsanalyse", "/privacy", "/producten", "/producten/beelden", "/producten/fotos", "/reserveringen", "/tablet/koppelen", "/taken", "/taken/telefoon", "/toegang", "/website", "/werkplek/[station]", "/werkplek/kassa", "/werkplek/voorraad", "/werkplekken", "/winkel", "/winkel/zelfkassa"];
// API-deuren. De publieke deuren (/api/public/...) gebruikt de website; die mogen nooit verdwijnen.
const API = ["assistent", "assistent/boodschappen", "bedrijfsgegevens", "bestelopties", "drive", "drive/koppelen", "gasten", "gasten/chat/[id]", "gasten/koppelingen", "gesprekken/teller", "google-profiel", "google-profiel/koppelen", "health", "hulp", "improvements/[...parts]", "inhoud", "inkoop/factuurmail", "inkoop/factuurmail/koppelen", "inkoop/factuurmail/pdf", "kassa/afrekenen", "kennisbank", "mail", "mail/calendars", "mail/linkable", "mail/oauth/callback", "mail/oauth/start", "mail/threads/[id]", "mail/threads/[id]/attachment", "media", "media/[id]", "meldingen", "meta", "meta/import", "meta/media/[id]", "meta/templates", "meta/threads/[id]", "omgeving", "operations", "orders", "printers", "privacy", "products", "public/availability", "public/etiket", "public/event-signups", "public/group-requests", "public/media/[id]", "public/meta", "public/offerte/[token]", "public/order-options", "public/orders", "public/payments", "public/payments/mollie", "public/printers/sdp", "public/printers/sdp/[token]", "public/products", "public/push", "public/qr", "public/rekening", "public/v1/inhoud", "public/v1/privacy", "public/weekmenu", "recipe-suggestion", "rekeningen", "sheets", "tafels", "telefoon", "toegang", "toegang/tablets", "toegang/telefoons", "voorspelling", "voorstellen", "website-uitstraling", "werkplek/contant", "werkplek/etiket", "werkplek/open", "werkplek/pakbon", "werkplek/tel-foto", "werkproces/ronde", "workplaces"];
// Inloggen en tablets koppelen.
const AUTH = ["auth/aanmelden", "auth/code", "auth/google", "auth/nieuw-wachtwoord", "auth/opnieuw", "auth/telefoon/vernieuw", "auth/terug", "auth/uit", "auth/vergeten", "auth/wachtwoord", "auth/werkplek/koppelen", "auth/werkplek/vernieuw"];
// Databasetabellen (Postgres, drizzle-pg/).
const TABLES = ["access_accounts", "assistant_messages", "assistant_threads", "availability_settings", "bunq_session", "connection_setting_audit", "connection_settings", "content_items", "drive_files", "drive_sync", "event_signups", "forecast_log", "forecast_overrides", "forecast_settings", "gbp_link", "gbp_posts", "group_bill_shares", "group_codes", "guest_advice", "guest_appointments", "guest_audit", "guest_customers", "guest_days", "guest_deliveries", "guest_events", "guest_kb", "guest_knowledge", "guest_locks", "guest_pickups", "guest_requests", "guest_reservations", "guest_settings", "guest_threads", "guest_visits", "guest_workspace", "incoming_orders", "ingredients", "integration_settings", "invoice_lines", "invoice_mails", "invoices", "mail_accounts", "mail_calendar_events", "mail_calendars", "mail_draft_requests", "mail_drafts", "mail_messages", "mail_oauth_states", "mail_sends", "mail_thread_links", "mail_thread_state", "mail_threads", "marketing_tasks", "media", "meta_messages", "meta_sends", "meta_threads", "operation_requests", "operations_state", "order_lines", "order_price_settings", "orders", "outbox_jobs", "payments", "phone_devices", "print_jobs", "printers", "privacy_policy", "products", "proposals", "push_subscriptions", "recipe_history", "recipe_lines", "recipes", "security_audit", "service_tables", "sheet_config", "sheet_links", "shopping_items", "signup_payments", "staff_push", "station_settings", "stock_moves", "website_settings", "week_menu_items", "week_menus", "work_status", "workplace_devices", "workplace_pairings"];
// Postgres-migraties: uitgevoerde migraties mogen nooit weg of veranderen.
const MIGRATIONS = ["0000_basis", "0001_beginwaarden"];
// Bestanden van de website voor gasten (apps/website).
const WEBSITE = ["bestellen-app.json", "bestellen-d.css", "bestellen-e.css", "bestellen-sw.js", "bestellen.css", "bestellen.html", "bestellen.js", "index.html", "zelfkassa-app.json", "zelfkassa.html", "zelfscan-app.json", "zelfscan.html", "beeld/bestellen-192.png", "beeld/bestellen-512.png", "beeld/logo.webp", "beeld/melding-badge.png", "beeld/zelfkassa-192.png", "beeld/zelfkassa-512.png", "beeld/zelfscan-192.png", "beeld/zelfscan-512.png"];

test('elk menu-onderdeel staat nog in het menu', () => {
  const shell = fs.readFileSync(new URL('shell.tsx', app), 'utf8');
  for (const route of Object.keys(MENU)) assert.ok(shell.includes(`'${route}'`), `Menu-onderdeel ${MENU[route]} (${route}) ontbreekt in het menu. Verhuisd? Pas dan bewust de kamerlijst aan.`);
});

test('elk scherm is nog bereikbaar (eigen pagina of doorverwijzing)', () => {
  for (const route of SCREENS) assert.ok(exists(pageFile(route)), `Scherm ${route} bestaat niet meer. Laat een doorverwijzing staan als het verhuisd is.`);
});

test('elke API-deur bestaat nog', () => {
  for (const door of API) assert.ok(exists(`api/${door}/route.ts`), `API /api/${door} is verdwenen.`);
});

test('inloggen en tablets koppelen blijven bereikbaar', () => {
  for (const route of AUTH) assert.ok(exists(route + '/route.ts'), route);
});

test('Postgres: geen migratie verdwenen, elke tabel wordt aangemaakt en nergens weggehaald', () => {
  const dir = new URL('../drizzle-pg/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
  for (const m of MIGRATIONS) assert.ok(files.includes(m + '.sql'), `Postgres-migratie ${m} is verdwenen; uitgevoerde migraties mogen nooit weg.`);
  const sql = files.map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const created = new Set([...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?([a-z0-9_]+)/gi)].map(m => m[1]));
  const dropped = [...sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?[`"]?([a-z0-9_]+)/gi)].map(m => m[1]);
  for (const t of TABLES) {
    assert.ok(created.has(t), `Tabel ${t} wordt in Postgres niet aangemaakt.`);
    assert.ok(!dropped.includes(t), `Tabel ${t} wordt in Postgres verwijderd (DROP TABLE). Alleen met besluit van de eigenaar.`);
    assert.match(sql, new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`), `Tabel ${t} heeft geen beveiliging per rij.`);
  }
});

test('elke websitepagina voor gasten bestaat nog', () => {
  for (const f of WEBSITE) assert.ok(fs.existsSync(new URL('../../website/' + f, import.meta.url)), `Websitebestand ${f} is verdwenen.`);
});
