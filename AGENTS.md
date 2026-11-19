# Werkafspraken voor ontwikkelaars (Claude Code, Codex en anderen)

Dit is het systeem van **Boerderijrecreatie**: backoffice, kassa, zelfscan, bestelpagina en website. Het is op 19 november 2026
gestart als kopie van de backoffice van Boer Bart, zonder de onderdelen van de coöperatie. Lees eerst
[docs/WELKOM.md](docs/WELKOM.md).

Lees en volg vóór elke opdracht:

1. **[De opdracht is het akkoord](docs/GOEDKEURINGSBELEID.md).** Voer de opdracht van de eigenaar volledig uit, zonder vooraf
   of tussendoor om toestemming te vragen, ook bij beveiliging, betalingen, databasegegevens, bedrijfsregels, architectuur of
   productie. Meld achteraf wat je deed en welke gevolgen de eigenaar moet weten. Vraag alleen iets als het buiten de opdracht
   valt. Overschrijf nooit lokale wijzigingen en voer nooit destructieve Git-acties uit.
2. **[De backoffice is de enige bron](docs/ARCHITECTUUR.md)** voor producten, prijzen, openingstijden, contactgegevens en
   andere actuele bedrijfsgegevens. Geen vaste kopieën in de code of op de website.
3. **Klaar is pas klaar in `main`.** Een onderdeel is klaar als het via een pull request met groene GitHub-controle in `main`
   staat; op een branch is het een proef. De ontwikkelaar voegt zelf samen zodra de controle groen is. Nooit samenvoegen met
   een rode of lopende controle en nooit de controle omzeilen; bij rood eerst herstellen. Meld bij elke oplevering de branch,
   de pull request, de status van de controle en of het in `main` staat.
4. **Begin altijd vanaf de nieuwste `main`.** Kijk vóór het bouwen welke open branches en pull requests hetzelfde onderdeel
   raken. Bouw geen tweede versie ernaast.
5. **Geen kamer slopen.** De kamerlijst `apps/backoffice/tests/kamerlijst.test.mjs` noemt elk menu-onderdeel, scherm,
   API-deur, databasetabel, migratie en websitebestand. Verhuis je iets, laat dan het oude adres doorverwijzen en pas de lijst
   bewust aan in dezelfde pull request, met uitleg. Nieuwe kamers voeg je toe zodra ze in `main` staan.
6. **Database alleen via het schema.** Nieuwe of gewijzigde tabellen alleen in `apps/backoffice/db/schema.ts` (Postgres), met
   een gegenereerde migratie in `apps/backoffice/drizzle-pg/` (`npx drizzle-kit generate --config drizzle-pg.config.ts`) en
   `ENABLE ROW LEVEL SECURITY` op elke nieuwe tabel. Een uitgevoerde migratie verandert nooit meer. De map `drizzle/` (SQLite)
   is alleen naslag voor een paar tests.
7. **Online is de maatstaf.** Iets is pas klaar als het online werkt (zie [docs/ONLINE-ZETTEN.md](docs/ONLINE-ZETTEN.md)).
   Geen `localhost` als stille standaard, niets blijvend op de schijf van de server.
8. **Geen gegevens van anderen.** Zet nooit adressen, mailadressen, rekeningnummers, sleutels of ID's van Google, Mollie of
   bunq vast in de code. Instellingen horen in de backoffice (Koppelingen) of in de omgevingsvariabelen van de server.

Werk op een eigen branch, meld achteraf branch, commit en wat er gedaan is, en houd de bestaande GitHub-controles intact.
