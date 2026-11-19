// Kamerlijst — bewaking tegen "per ongeluk een kamer slopen" (besluit eigenaar, 2 november 2026).
// Elke kamer die nu bestaat, moet blijven bestaan: menu-onderdeel, scherm, API-deur, databasetabel,
// migratie en websitepagina. Verhuist een kamer, dan blijft het oude adres bestaan (doorverwijzing) en
// wordt deze lijst bewust aangepast in dezelfde pull request, zodat de eigenaar het ziet vóór samenvoegen.
// Nieuwe kamers voeg je hier toe zodra ze in main staan.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = new URL('../app/', import.meta.url);
const exists = rel => fs.existsSync(new URL(rel, app));

// Menu-onderdelen (adres → naam in het menu). De naam mag veranderen, het adres moet in het menu blijven.
const MENU = {
  // Bloei-proef, in main sinds PR #94.
  '/bloei': 'Bloei · houders & kapitaal', // was „Bloei · leden & tegoeden” (8 november 2026: obligatiehouders zijn geen leden)
  '/overleg': 'Overleg',
  '/': 'Managementdashboard', '/assistent': 'Weekassistent',
  // Gesprekken in telefoonstand, bij de Weekassistent (PR #384, 9 november 2026).
  '/gesprekken/telefoon': 'Gesprekken (telefoon)', '/goedkeuringen': 'Goedkeuringen', '/taken/telefoon': 'Vandaag (managerapp)',
  '/planning': 'Agenda & reserveringen', '/personeelsplanning': 'Ledenplanning', '/openingstijden': 'Openingstijden & capaciteit', '/gesprekken': 'Gesprekken & klanten',
  '/werkplekken': 'Bestellingen & uitgifte', '/yte': 'Ite by Boer Bart & tafels', '/producten': 'Gerechten & prijzen',
  '/offertes': 'Offertes & groepen', '/winkel': 'Boerderijwinkel',
  // Ledenkaart (PR #194, 5 november 2026). Beloning heet sinds 5 november 2026 „Winstdeling & rollen” (geen uren meer); het adres blijft.
  // 5 november 2026 (besluit eigenaar): leden, personeel en deelnemers in één menu-onderdeel „Leden & winstdeling”. Winstdeling & rollen
  // (/beloning) is daar een tabblad geworden en staat daarom bij de schermen hieronder; het adres blijft hetzelfde.
  // 8 november 2026 (wens eigenaar): „beloning” mag nergens meer op loon lijken; het menu heet „Leden & winstdeling”, tabblad
  // „Winstdeling & rollen”. Alleen de naam verandert; adressen (/leden, /beloning) blijven.
  '/leden': 'Leden & winstdeling',
  '/inkoop': 'Inkoop & voorraad', '/financien': 'Financiën & betalingen',
  '/website': 'Website & uitstraling', '/koppeling': 'Koppelingen & printers',
  // Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek voor naam, adres, KvK, btw en IBAN.
  '/bedrijfsgegevens': 'Bedrijfsgegevens',
  // Inhoud (13 november 2026) en Privacy (15 november 2026) zijn sinds 16 november 2026 tabbladen van Website; zie SCREENS.
  // Nieuwe indeling (wens eigenaar 16 november 2026: „logische indeling, dubbele dingen eruit”; voorstel akkoord). Eigen menu-onderdelen:
  // Weekafsluitingen en Bank & uitbetalen onder GELD, Toegang onder INSTELLINGEN, Abonnementen onder VERKOOP & KEUKEN.
  // Uit het menu, als scherm bereikbaar (zie SCREENS): Reserveringen (zit in Agenda & reserveringen, /reserveringen stuurt door)
  // en Marketing & AI (nog niet gebouwd). Inhoud en Privacy zijn tabbladen van Website (16 november 2026), zie SCREENS. Stap 2: Vandaag & taken staat op het dashboard; /taken stuurt door naar /#taken. Gesprekken (telefoon) staat als knop op het dashboard.
  '/financien/weekafsluiting': 'Weekafsluitingen', '/financien/bank': 'Bank & uitbetalen', '/toegang': 'Toegang', '/abonnementen': 'Abonnementen',
};
// Schermen die bereikbaar moeten blijven (ook zonder eigen menu-onderdeel, zoals de kassa).
// /openingstijden verwees van 2 november 2026 (PR #31) tot 3 november 2026 door naar /planning. Sinds 3 november 2026
// is het weer een eigen menu-onderdeel: Openingstijden & capaciteit (wens eigenaar), los van de agenda in Planning.
// Eigen bedrag & groepscodes (3 november 2026): tabblad onder Bestellingen & uitgifte.
const SCREENS = [...Object.keys(MENU), '/inhoud', '/privacy', '/personeelsplanning/winkeldiensten', '/taken', '/reserveringen', '/marketing', '/leden/deelnemers', '/bestelopties', '/winkel/afrekening', '/financien/deelnemers', '/werkplek/[station]', '/werkplek/kassa', '/werkplek/team', '/werkplek/dagplanning', '/opnemen', '/producten/beelden', '/kassa', '/klanten', '/openingstijden', '/prijsanalyse',
  // Deelnemerspagina van de coöperatieve winkel (4 november 2026): persoonlijke link, zonder login.
  '/deelnemer/[token]',
  // Inloggen voor leden en tablet koppelen (PR #381, 10 november 2026).
  '/lid/inloggen', '/lid/nieuw-wachtwoord', '/tablet/koppelen',
  // Winstdeling & rollen: tabblad van Leden & winstdeling sinds 5 november 2026 (eerder een eigen menu-onderdeel).
  '/beloning',
  // Offerte als document om te downloaden (wens eigenaar 5 november 2026).
  '/offertes/document',
  // Offerte voor de gast via de persoonlijke link (wens eigenaar 5 november 2026).
  '/offerte/[token]',
  // Gecontroleerde echte Bloei-import; bestaande leden- en proefadressen blijven.
  '/bloei/import',
  // Openbare Bloeimarkt en centraal documentbeheer (6 november 2026).
  '/bloei/markt', '/bloei/documenten',
  // Coöperatieve ledenafspraken, eigen archief en leveranciersrooster (6 november 2026).
  '/leden/afspraken', '/leden/winkeldiensten', '/bloei/inkomensleningen', '/bloei/waarde', '/deelnemer/[token]/afspraken',
  // Onderdeelpotten, eerst de kippenpot (wens eigenaar 5 november 2026): tabblad van Leden & winstdeling.
  '/leden/potten',
  // Voorspelling daggasten (PR #266) en Rollen per pot (PR #268), 6 november 2026.
  '/planning/voorspelling', '/leden/rollen',
  // Zelfkassa & QR-stickers: tabblad van Boerderijwinkel (PR #354, wens eigenaar 9 november 2026).
  '/winkel/zelfkassa',
  // App Gesprekken (10 november 2026): de Weekassistent en de boodschappenlijst in de app.
  '/assistent/telefoon', '/assistent/telefoon/boodschappen', '/planning/telefoon',
  // Managementapp in een eigen werkgebied (12 november 2026); de adressen hierboven sturen hierheen door.
  '/management/gesprekken', '/management/taken', '/management/assistent', '/management/assistent/boodschappen', '/management/planning',
  // /apps (PR #415): sinds besluit eigenaar 12 november 2026 een doorverwijzing naar de managementapp met de startschermvraag.
  '/apps',
  // Verdeling in één oogopslag: tabblad van Leden & winstdeling (wens eigenaar 9 november 2026).
  '/leden/verdeling'];
// API-deuren. De publieke deuren (/api/public/...) gebruikt de website; die mogen nooit verdwijnen.
// Vervallen met besluit (PR #31, 2 november 2026): /api/availability (nu Planning via /api/gasten) en
// /api/integrations (nu /api/gasten/koppelingen). Beide waren alleen voor de backoffice zelf.
const API = [
  'bloei-proef', 'public/bloei-proef', 'bloei', 'public/bloei', 'bloei/import',
  'bloei/markt', 'bloei/documenten', 'bloei/documenten/[id]', 'public/bloeimarkt', 'public/bloeimarkt/mollie',
  'public/bloeimarkt/documenten/[id]', 'deelnemer/[token]/bloei-documenten/[[...id]]',
  // ShareCouncil-contracten in één keer bij het juiste lid (12 november 2026).
  'bloei/documenten/koppelen',
  'overleg', 'deelnemer/[token]/overleg',
  'leden/afspraken', 'leden/winkeldiensten', 'leden/verdeling', 'leden/ledenlogin', 'leden/uitnodigen', 'bloei/inkomensleningen', 'bloei/waarde', 'bloei/waarde/snelstart',
  'deelnemer/[token]/lidafspraak', 'deelnemer/[token]/inkomenslening', 'deelnemer/[token]/winkeldiensten',
  'assistent', 'bestelopties', 'cooperatie', 'tafels',
  // Backoffice-assistent: typbalk onderaan elk scherm (PR #247, akkoord eigenaar 6 november 2026).
  'hulp',
  // Gastcontact (PR #355, 9 november 2026): meldingen voor medewerkers en de kennisbank voor gastmail.
  'meldingen', 'kennisbank',
  // WhatsApp, Messenger en Instagram in Gesprekken (PR #368, 9 november 2026). De webhook van Meta mag nooit verdwijnen.
  'meta', 'meta/threads/[id]', 'meta/templates', 'meta/media/[id]', 'public/meta',
  // WhatsApp-export importeren (13 november 2026).
  'meta/import',
  // Bolletje in de app Management: hoeveel gesprekken op ons wachten (18 november 2026).
  'gesprekken/teller',
  // Boodschappenlijst bij de Weekassistent (PR #384).
  'assistent/boodschappen',
  // Gesprek voor een lid: kiezen in de backoffice en beantwoorden in de ledenapp (10 november 2026).
  'gesprek-lid', 'deelnemer/[token]/gesprekken',
  // Google Drive als beeldbank (akkoord eigenaar 3 november 2026).
  'drive', 'drive/koppelen', 'gasten', 'gasten/koppelingen', 'health',
  // Gmail-koppeling van Gesprekken (PR #30, 3 november 2026).
  'mail', 'mail/calendars', 'mail/linkable', 'mail/oauth/callback', 'mail/oauth/start', 'mail/threads/[id]', 'mail/threads/[id]/attachment', 'improvements/[...parts]', 'media', 'media/[id]', 'operations', 'orders',
  'products', 'public/availability', 'public/event-signups', 'public/media/[id]', 'public/order-options', 'public/orders', 'public/products', 'public/weekmenu',
  // Online betalen via Mollie (besluit eigenaar 3 november 2026, keuze E): starten/status en de melding van Mollie.
  'public/payments', 'public/payments/mollie',
  // Groepen & feesten: direct antwoord op de datum en de aanvraag naar de inbox (besluit eigenaar 3 november 2026).
  'public/group-requests',
  // Zelfservicekassa winkel (4 november 2026): QR-code voor de betaalpagina en contant bevestigen bij de werkplek.
  'public/qr', 'werkplek/contant', 'werkplek/open',
  // Etiket fotograferen (PR #354, wens eigenaar 9 november 2026): zelfkassa (openbaar, met limieten) en werkplek Voorraad (achter de login).
  'public/etiket', 'werkplek/etiket',
  // Pakbon fotograferen (wens eigenaar 17 november 2026): werkplek Voorraad → Levering (achter de login).
  'werkplek/pakbon',
  // Tellen met foto's (wens eigenaar 17 november 2026): werkplek Voorraad → Voorraad tellen (achter de login).
  'werkplek/tel-foto',
  // Pushmelding "Je bestelling staat klaar" (akkoord eigenaar 3 november 2026).
  'public/push',
  'recipe-suggestion', 'sheets', 'voorstellen', 'workplaces',
  // Bijgewerkt 4 november 2026 (kamers die al in main stonden): facturen uit de mail, gastchat, Ite-aanvragen,
  // afrekenen in de kassa, deelnemerspagina (met nieuw product) en het Google Bedrijfsprofiel.
  'inkoop/factuurmail', 'inkoop/factuurmail/koppelen', 'inkoop/factuurmail/pdf', 'gasten/chat/[id]', 'public/yte-requests', 'kassa/afrekenen',
  'deelnemer/[token]', 'deelnemer/[token]/manifest', 'deelnemer/[token]/product', 'google-profiel', 'google-profiel/koppelen',
  // Ledenkaart (PR #194, 5 november 2026): beheer door de eigenaar en de eigen gegevens op de ledenpagina.
  'leden', 'deelnemer/[token]/lid',
  // Pot-afspraken met instemming van de leden (PR #199, 5 november 2026).
  'pot-afspraken', 'deelnemer/[token]/afspraken',
  // Restaurantpot per dag en weekafrekening (PR #205, 5 november 2026).
  'pot-weken', 'deelnemer/[token]/beloning',
  // Personeelsplanning (PR #215, 5 november 2026).
  'pot-planning', 'dagplanning', 'deelnemer/[token]/rooster',
  // Agenda koppelen (PR #299, 7 november 2026): agendalink tonen of vernieuwen, en de alleen-lezen agendafeed.
  'deelnemer/[token]/agenda', 'agenda/[token]',
  // Ledenpagina → Financiën van een leverancier (5 november 2026).
  'deelnemer/[token]/financien',
  // Ledenpagina → berichten op deze telefoon (5 november 2026).
  'deelnemer/[token]/push',
  // Bedrijfsgegevens lezen (5 november 2026); opslaan loopt via gasten.
  'bedrijfsgegevens',
  // Online akkoord of een vraag van de gast op een offerte (wens eigenaar 5 november 2026).
  'public/offerte/[token]',
  // Onderdeelpotten (5 november 2026): beheer door de eigenaar en potbeheer op de ledenpagina.
  'onderdeelpotten', 'deelnemer/[token]/potbeheer',
  // BB-tegoed op de ledenpagina (6 november 2026).
  'deelnemer/[token]/bb',
  // Voorspelling daggasten (PR #266) en Rollen per pot (PR #268), 6 november 2026.
  'voorspelling', 'rollen',
  // Officiële documenten van de coöperatie (6 november 2026): beheer en de ledenpagina.
  'coop-documenten', 'deelnemer/[token]/documenten/[[...id]]',
  // Evenementen van leden (besluit eigenaar 8 november 2026): aanvragen op de ledenpagina, beslissen bij Goedkeuringen.
  'ledenevenementen', 'deelnemer/[token]/evenementen',
  // Ledenpagina → Waar gaat het geld heen? (9 november 2026).
  'deelnemer/[token]/verdeling',
  // Werkplektablets (QR) en test of live in de schermen (PR #381 en vervolg, 10 november 2026).
  'toegang/tablets', 'toegang/telefoons', 'telefoon', 'omgeving',
  // Inhoud voor het dorp (13 november 2026): beheer, en de vaste poort v1 waar alle sites uit lezen. Die poort mag nooit
  // verdwijnen of anders antwoorden; een nieuwe vorm komt als v2 ernaast.
  'inhoud', 'public/v1/inhoud',
  // Privacy voor alle sites (15 november 2026): beheer, en de vaste poort v1 waar alle sites het privacybeleid uit lezen.
  'privacy', 'public/v1/privacy',
];
// Databasetabellen met bedrijfsgegevens. Een tabel weghalen kan gegevens kosten: alleen met besluit van de eigenaar.
const TABLES = [
  'bloei_proef',
  'assistant_messages', 'assistant_threads', 'availability_settings', 'connection_setting_audit', 'connection_settings', 'event_signups',
  'guest_deliveries', 'guest_locks', 'guest_requests', 'guest_workspace', 'incoming_orders', 'ingredients', 'integration_settings',
  'invoice_lines', 'invoices',
  'mail_accounts', 'mail_calendar_events', 'mail_calendars', 'mail_draft_requests', 'mail_drafts', 'mail_messages', 'mail_oauth_states', 'mail_sends', 'mail_thread_links', 'mail_thread_state', 'mail_threads',
  'marketing_tasks', 'media', 'operation_requests', 'operations_state', 'order_lines', 'orders',
  'outbox_jobs', 'payments', 'products', 'proposals', 'recipe_history', 'recipe_lines', 'recipes', 'sheet_config', 'sheet_links',
  'stock_moves', 'week_menu_items', 'week_menus', 'work_status',
  // Eigen bedrag en groepscode (3 november 2026).
  'group_codes', 'order_price_settings', 'push_subscriptions',
  // Evenementen online betalen via Mollie (3 november 2026).
  'signup_payments',
  // Google Drive als beeldbank (3 november 2026).
  'drive_files', 'drive_sync',
  // Gastgegevens in eigen tabellen (3 november 2026); guest_workspace blijft bestaan als naslag.
  'guest_advice', 'guest_audit', 'guest_customers', 'guest_days', 'guest_events', 'guest_knowledge', 'guest_pickups', 'guest_reservations',
  'guest_settings', 'guest_threads', 'guest_visits',
  // Coöperatieve winkel (3 november 2026).
  'coop_participants', 'coop_rates', 'coop_settings', 'coop_weeks', 'product_owners', 'service_tables',
  // Facturen uit de mail (3 november 2026), deelnemerspagina en Google Bedrijfsprofiel (4 november 2026).
  'invoice_mails', 'coop_portal_links', 'coop_requests', 'gbp_link', 'gbp_posts',
];
// Uitgevoerde migraties mogen nooit verdwijnen (de backoffice controleert ze bij elke start).
const MIGRATIONS = [
  '0093_bloei_proef',
  '0000_steep_annihilus', '0001_cuddly_silver_sable', '0002_chubby_phalanx', '0003_majestic_jane_foster', '0004_high_purple_man',
  '0005_silly_doctor_faustus', '0006_bestellingen_en_betalingen', '0007_voorraad_in_tabellen', '0008_weekassistent',
  '0009_guest_workspace', '0009_openingstijden_en_beschikbaarheid', '0010_connection_settings', '0010_koppelingen_sleutels', '0013_klantgesprekken_gmail', '0014_ingredienten_herkomst_eigen_prijs', '0015_evenement_aanmeldingen',
  '0016_eigen_bedrag_groepscode', '0017_facturen_uit_mail', '0018_pushmeldingen', '0019_evenement_online_betalen', '0020_drive_beeldbank',
  '0021_gastgegevens_eigen_tabellen', '0022_cooperatie_afrekening', '0023_tafels',
  '0024_deelnemerspagina', '0025_google_bedrijfsprofiel', '0026_deelnemer_nieuw_product',
];
// Postgres-opbouw (overstap naar Supabase, 4 november 2026). Uitgevoerde Postgres-migraties mogen evenmin verdwijnen.
const PG_MIGRATIONS = ['0000_basis', '0001_beginwaarden', '0002_afscherming', '0003_bloei_proef',
  // Bijgewerkt 5 november 2026 (al in main): toegangslijst, gezamenlijke rekening en de ledenkaart.
  '0004_toegang', '0005_gezamenlijke_rekening', '0006_ledenkaart', '0007_pot_afspraken',
  '0008_rekening_mail', '0009_meebetalen', '0010_dividend_telefoons', '0011_restaurantpot', '0012_personeelsplanning', '0013_ledenrollen', '0014_printers', '0015_dienst_overnemen', '0016_halve_dienst', '0017_cloudy_mister_sinister',
  // Onderdeelpotten, eerst de kippenpot (5 november 2026).
  '0020_onderdeelpotten',
  // Lid als bedrijf (6 november 2026): kolom op de bestaande ledenkaart.
  '0021_lid_als_bedrijf',
  // BB-tegoed stap 1 (6 november 2026).
  '0022_bb_tegoed',
  // Bankverdeling via bunq (PR 249) en BB-tegoed stap 2: maandagvraag en documenten (6 november 2026).
  '0023_bankverdeling', '0024_verdeling_bevestigen', '0025_bb_maandagvraag',
  // Openbare Bloeimarkt en documentruimte (6 november 2026).
  '0026_overleg', '0027_smiling_sumo',
  // Omschrijving per dienst (PR #263, akkoord eigenaar 6 november 2026).
  '0028_dienst_omschrijving', '0029_voorspelling', '0030_lidmaatschapsafspraken', '0031_functiecontracten', '0032_rollen_per_pot', '0033_inloggen_tweestaps', '0034_rolcontract_concept',
  // Officiële documenten van de coöperatie bij Bedrijfsgegevens (6 november 2026).
  '0035_coop_documenten',
  // Agendalink per lid (PR #299, 7 november 2026).
  '0038_agenda_koppelen',
  // Evenementen van leden (8 november 2026).
  '0043_ledenevenementen',
  // Gastcontact: meldingen, kennisbank en afspraken (PR #355, 9 november 2026).
  '0046_gastcontact',
  // Afrekening van evenementen van leden (9 november 2026).
  '0049_evenement_afrekening',
  // Bonvraag: bij wie hoort een verkoop van een nieuw zelfkassa-product (9 november 2026).
  '0050_bonvraag',
  // Inkoop in de bankverdeling en evenementen 30% (9 november 2026).
  '0051_inkoop_evenementen','0052_bb_vrijwilliger','0053_evenement_btw',
  // WhatsApp, Messenger en Instagram (PR #368).
  '0054_meta_berichten',
  // Zelf toegevoegde boodschappen (PR #384).
  '0056_boodschappen',
  // Gesprek voor een lid (10 november 2026).
  '0057_gesprek_lid',
  // Werkplektablets en bon bij een uitgave van een pot (PR #381, 10 november 2026).
  '0058_werkplektablets', '0059_bon_bij_uitgave', '0060_eigen_rekening', '0061_telefoon_ingelogd',
  // Bloei per lid (12 november 2026): versleuteld uittreksel per lid, afgeleid van bloei_administration.
  '0062_bloei_leden',
  // Zonder code binnenkomen per account (13 november 2026).
  '0063_access_quick_login',
  // Inhoud voor het dorp: blogs, nieuws en filmpjes (13 november 2026).
  '0064_inhoud',
  // Student naast vrijwilliger op de ledenkaart (13 november 2026).
  '0065_volunteer_kind',
  // Oude blogs van boerbart.nl overhalen: herkomst per stuk (13 november 2026).
  '0066_oude_blogs',
  // Werkplek open of dicht (wens eigenaar 14 november 2026).
  '0067_werkplek_open',
  // Privacy voor alle sites (15 november 2026).
  '0068_privacy',
  // Website-onderdelen (15 november 2026).
  '0069_website_onderdelen',
  // Kassaverkoop overdag hoort bij het dagrestaurant (wens eigenaar 16 november 2026).
  '0070_dagrestaurant_overdag',
  // Eén verzameling officiële documenten: vinkje „Op de Bloeimarkt” (wens eigenaar 16 november 2026).
  '0071_documenten_een_verzameling'];
// Tabellen die alleen in Postgres bestaan (Supabase-indeling, besluit eigenaar 5 november 2026; geen SQLite-tegenhanger).
const PG_TABLES = [...TABLES, 'access_accounts', 'group_bill_shares', 'pot_agreements', 'pot_consents',
  // Dividend-telefoons (PR #207) en restaurantpot (PR #205), 5 november 2026.
  'member_devices', 'pot_shifts', 'pot_weeks', 'pot_needs',
  // Halve dienst en pushberichten naar leden (5 november 2026).
  'member_push', 'pot_help_calls',
  // Echte bronadministratie versleuteld; de fictieve administratie blijft bestaan.
  'bloei_administration', 'bloei_leden',
  'bloei_market', 'bloei_waardering',
  'overleg_meetings', 'overleg_proposals', 'overleg_votes', 'overleg_actions',
  'forecast_settings', 'forecast_overrides', 'forecast_log',
  'member_agreement_rules', 'member_agreement_rule_versions', 'member_agreements', 'bloei_income_loans', 'bloei_loan_repayments', 'member_shop_shifts',
  // Onderdeelpotten, eerst de kippenpot (5 november 2026).
  'unit_funds', 'unit_fund_products', 'unit_fund_entries',
  // BB-tegoed stap 1 (6 november 2026).
  'bb_entries',
  // Bankverdeling via bunq (PR 249, 6 november 2026).
  'bank_settings', 'bunq_session', 'bank_splits', 'bank_split_transfers', 'bank_inflows', 'bb_payouts',
  // BB-tegoed stap 2: maandagvraag en documenten (6 november 2026).
  'bb_choices', 'bb_documents',
  'pot_roles',
  // Officiële documenten van de coöperatie (6 november 2026).
  'coop_documents',
  // Agendalink per lid (PR #299, 7 november 2026).
  'member_calendar_links',
  // Evenementen van leden (8 november 2026).
  'member_events', 'member_event_settings',
  // Gastcontact: meldingen, kennisbank en afspraken (PR #355, 9 november 2026).
  'staff_push', 'guest_kb', 'guest_appointments',
  // Afrekening van evenementen van leden (9 november 2026).
  'member_event_settlements',
  // Bonvraag (9 november 2026).
  'shop_line_answers',
  // WhatsApp, Messenger en Instagram in Gesprekken (PR #368, 9 november 2026).
  'meta_threads', 'meta_messages', 'meta_sends',
  // Zelf toegevoegde boodschappen (PR #384, 9 november 2026).
  'shopping_items',
  // Gesprek voor een lid (10 november 2026).
  'conversation_members',
  // Werkplektablets (PR #381, 10 november 2026).
  'workplace_devices', 'workplace_pairings', 'phone_devices',
  // Inhoud voor het dorp (13 november 2026).
  'content_items', 'station_settings',
  // Privacy voor alle sites (15 november 2026).
  'privacy_policy'];
// Websitepagina's voor gasten.
// afrekenen.html is bewust weggehaald (besluit eigenaar 3 november 2026: „het oude adres verwijderen”). Het was de oude
// proefafrekenstap zonder betaling; afrekenen gaat nu altijd via bestellen.html (eigen bedrag, groepscode, Mollie).
// Opruimen 15 november 2026 (besluit eigenaar, docs/SITES.md): bestelscherm-e.html (een ontwerpvoorbeeld) is bewust
// weggehaald, zonder doorverwijzing: „wat niemand gebruikt, mag weg”. Het ontwerp leeft voort in bestellen-e.css.
const WEBSITE = ['index.html', 'bestellen.html', 'bestellen.css', 'bestellen.js', 'bestellen-sw.js', 'bestellen-app.json', 'beeld/boerbart-logo.webp'];

const pageFile = route => (route === '/' ? '' : route.slice(1) + '/') + 'page.tsx';

test('elk menu-onderdeel staat nog in het menu', () => {
  const shell = fs.readFileSync(new URL('shell.tsx', app), 'utf8');
  for (const route of Object.keys(MENU)) {
    assert.ok(shell.includes(`'${route}'`), `Menu-onderdeel ${MENU[route]} (${route}) ontbreekt in het menu. Verhuisd? Pas dan bewust de kamerlijst aan.`);
  }
});

test('elk scherm is nog bereikbaar (eigen pagina of doorverwijzing)', () => {
  for (const route of SCREENS) assert.ok(exists(pageFile(route)), `Scherm ${route} bestaat niet meer. Laat een doorverwijzing staan als het verhuisd is.`);
});

test('elke API-deur bestaat nog', () => {
  for (const door of API) assert.ok(exists(`api/${door}/route.ts`), `API /api/${door} is verdwenen.`);
});

test('de bestaande beheerlogin en eigen contractondertekening blijven bereikbaar',()=>{
 for(const route of ['auth/aanmelden','auth/code','auth/nieuw-wachtwoord','auth/vergeten','auth/wachtwoord','auth/google','auth/terug','auth/uit','auth/lid/google','auth/lid/terug','auth/lid/uit',
  // Ledenlogin en werkplektablets (PR #381, 10 november 2026).
  'auth/lid/wachtwoord','auth/lid/aanmelden','auth/lid/eerste-keer','auth/lid/vergeten','auth/lid/nieuw-wachtwoord','auth/werkplek/koppelen','auth/werkplek/vernieuw','auth/telefoon/vernieuw',
  // Vaste ingang van de ledenapp (13 november 2026, eigen adres leden.boerbart.nl).
  'lid'])assert.ok(exists(route+'/route.ts'),route);
});

test('elke databasetabel wordt nog aangemaakt en geen migratie is verdwenen', () => {
  const dir = new URL('../drizzle/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
  for (const m of MIGRATIONS) assert.ok(files.includes(m + '.sql'), `Migratie ${m} is verdwenen; uitgevoerde migraties mogen nooit weg.`);
  const sql = files.map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const created = new Set([...sql.matchAll(/CREATE TABLE\s+[`"]?([a-z_]+)/gi)].map(m => m[1]));
  const dropped = [...sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?[`"]?([a-z_]+)/gi)].map(m => m[1]);
  for (const t of TABLES) {
    assert.ok(created.has(t), `Tabel ${t} wordt niet meer aangemaakt.`);
    assert.ok(!dropped.includes(t), `Tabel ${t} wordt verwijderd (DROP TABLE). Dat kan gegevens kosten: alleen met besluit van de eigenaar.`);
  }
});

test('Postgres: geen migratie verdwenen, elke tabel wordt aangemaakt en nergens weggehaald', () => {
  const dir = new URL('../drizzle-pg/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
  for (const m of PG_MIGRATIONS) assert.ok(files.includes(m + '.sql'), `Postgres-migratie ${m} is verdwenen; uitgevoerde migraties mogen nooit weg.`);
  const sql = files.map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const created = new Set([...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?([a-z_]+)/gi)].map(m => m[1]));
  const dropped = [...sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?[`"]?([a-z_]+)/gi)].map(m => m[1]);
  for (const t of PG_TABLES) {
    assert.ok(created.has(t), `Tabel ${t} wordt in Postgres niet aangemaakt.`);
    assert.ok(!dropped.includes(t), `Tabel ${t} wordt in Postgres verwijderd (DROP TABLE). Alleen met besluit van de eigenaar.`);
  }
});

test("elke websitepagina voor gasten bestaat nog", () => {
  for (const f of WEBSITE) assert.ok(fs.existsSync(new URL('../../website/' + f, import.meta.url)), `Websitebestand ${f} is verdwenen.`);
});

test('de openbare Bloeimarkt blijft als websitepagina bereikbaar',()=>{
 const fab=new URL('../../website-fab/src/',import.meta.url);
 assert.ok(fs.existsSync(new URL('pages/Bloeimarkt.tsx',fab)),'De openbare Bloeimarkt-pagina ontbreekt.');
 assert.ok(fs.readFileSync(new URL('routes.ts',fab),'utf8').includes('"/bloeimarkt/"'),'Behoud het openbare adres /bloeimarkt/.');
});

test('de landingspagina van Nijemoed Bloemen blijft bereikbaar',()=>{
 // Landingspagina voor een coöperatielid (wens eigenaar 17 november 2026).
 const fab=new URL('../../website-fab/src/',import.meta.url);
 assert.ok(fs.existsSync(new URL('pages/Nijemoed.tsx',fab)),'De pagina van Nijemoed Bloemen ontbreekt.');
 assert.ok(fs.readFileSync(new URL('routes.ts',fab),'utf8').includes('"/nijemoed-bloemen/"'),'Behoud het adres /nijemoed-bloemen/.');
});
