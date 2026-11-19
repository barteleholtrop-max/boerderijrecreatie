# Boer Bart Planbord 2027 — zelfstandige export

Export van 29 oktober 2026. De bestaande sites zijn niet gewijzigd of gepubliceerd. Deze map kan in een eigen private GitHub-repository. Planbord en backoffice draaien op standaard Node.js/Next.js met SQLite en bestanden; er is geen ChatGPT Work-, Codex- of Claude-runtime nodig.

## Snel starten

Voor de vaste lokale ontwikkelbasis op Chromebook: zie [ontwikkelbasis en resterende samenvoegcontroles](docs/ONTWIKKELBASIS.md). De ontwikkelomgeving controleert bij start en elke 5 minuten of GitHub `main` nieuwere commits heeft en werkt alleen bij na een veiligheidscontrole en expliciete bevestiging; zie [versiecontrole](docs/VERSIECONTROLE.md). Na eenmalige installatie start `boerbart-test` de website op poort 3003, backoffice op 3001 en planbord op 3000, met gescheiden testgegevens en samenvoegen uitgeschakeld.

Installeer Node.js 24 (getest met 24.22.1), npm en eventueel Git. Pak de volledige ZIP uit; houd de mappen bij elkaar.

```sh
npm run setup
npm run install:apps
npm run build
npm start
```

**Inloggen staat uit tijdens het ontwikkelen** (besluit eigenaar 3 november 2026): er is nergens een login of wachtwoord nodig. Live log je in via Supabase, met Google of met e-mail en wachtwoord, en altijd met een code uit je Authenticator-app (besluit eigenaar 6 november 2026); zie [inloggen bij livegang](docs/INLOGGEN-BIJ-LIVEGANG.md).

`setup` maakt uitsluitend ontbrekende lokale `.env.local` bestanden, met een gedeelde sessiesleutel (`AUTH_SECRET`) en een nieuwe encryptiesleutel. Er staan geen wachtwoorden in. Deze bestanden nooit committen. Open http://localhost:3000 (planbord), http://localhost:3001 (backoffice) en http://localhost:3002 (websiteprototype). Wie er mag inloggen, beheer je live in de backoffice onder Systeem & koppelingen → Toegang. De websitepreview is statisch en heeft lokaal geen aanmelding.

Bij de eerste API-aanvraag worden de meegeleverde gegevens eenmalig geïmporteerd in `apps/<naam>/var/`. Deze map blijft bij een herstart behouden. Zet `APP_DATA_DIR` op een andere blijvende map als gewenst. Latere builds overschrijven deze gegevens niet. Verwijder deze map niet om een update uit te voeren.

Ontwikkelen: `cd apps/planbord` of `cd apps/backoffice`, daarna `npm run dev`. Backoffice: `npm run dev -- --port 3001`. Voor een andere poort/host ook `APP_ORIGIN` aanpassen; deze moet exact de publieke oorsprong zijn, bijvoorbeeld `https://planbord.eigendomein.nl`. Productie: gebruik HTTPS via een reverse proxy; HTTP Basic-auth uitsluitend via HTTPS buiten localhost. Dit is een eigenaar-login, geen uitgewerkt systeem met verschillende personeelsrollen.

## Inhoud

| Map | Inhoud |
| --- | --- |
| apps/planbord | Zelfstandig interactief planbord: vormgeving, navigatie, onderwerpen, procesflows, backend |
| apps/backoffice | Producten, media, bestellingen, recept-/factuur-/voorraadberekeningen, Google Sheets-adapter |
| apps/website | Bestaand statisch website-/mobiel ontwerp, inclusief assets |
| data | Vastgelegde actuele gegevens en herkomst-/integriteitsrapporten |
| integrations/google | Beschikbare Apps Script-bronbestanden |
| originals/published | Ongewijzigde bronbestanden van de gepubliceerde versies |
| originals/working-tree | Lokale werkversies, inclusief nog niet gepubliceerde wijzigingen |
| originals/git-history | Volledige beschikbare broncodegeschiedenis als drie Git-bundles |
| docs | Technische uitleg, hosting, Google-koppelingen en testresultaten; zie [backoffice-indeling](docs/BACKOFFICE-UITSTRALING.md) |
| tools | Lokale installatie-, start- en verpakkingshulpen |

De oorspronkelijke technische structuur is dus naast de zelfstandige variant behouden. Zie [portabiliteit](docs/PORTABILITEIT.md) en [exportgrenzen](docs/EXPORTGRENZEN.md). Het websiteprototype is geen complete productie-webwinkel.

## Verbeteringen voorstellen op de website

Met `npm run setup` en `npm run dev:website` kan een eigenaar op de websiteserver voorstellen bewaren (zonder login, alleen via het ingestelde adres). De ontwikkelmodus staat standaard uit; de bestaande website en het centrale planbord blijven intact. Zie [ontwikkelmodus en Chromebook-instructies](docs/WEBSITE-VOORSTELLEN.md) voor aanmelden, statusbeoordeling, opslag, tests en de privé Codespaces-route. De voorstellen worden lokaal bewaard; synchronisatie naar het gepubliceerde planbord is nog niet gerealiseerd.

Voor selectieopmerkingen op **website én backoffice**: voer na `npm run install:apps` het commando `npm run review:local` uit. Dit start beide apps met dezelfde selectiebediening en bestaande eigenaarlogin. Klik op ‘Onderdeel aanwijzen’, kies een element en bewaar je opmerking. Op een privé Codespace gebruik je `npm run review:codespaces`. Zie de bovenstaande instructies voor toegang op een Chromebook en de bescherming van bedrijfsgegevens.

‘Voorstellen terugvinden’ toont nu één gezamenlijk overzicht. Selecteer voorstellen, bevestig de centrale planbordbeslissing en gebruik **‘Geselecteerde voorstellen naar Codex’** om één GitHub Issue met een kopieerbare opdracht te maken. Alleen expliciet goedgekeurde voorstellen kunnen worden verstuurd; een Issue start Codex niet automatisch. Zie [gezamenlijk versturen en GitHub-toegang](docs/VOORSTELLEN-NAAR-CODEX.md).

## Controle

```sh
npm test
npm run typecheck
```

Beide productiebuilds en startprocessen zijn getest zonder platform-authenticatie of platformopslag. Zie [validatie](docs/VALIDATIE.md). Geautomatiseerde controles dekken geen volledige visuele vergelijking of echte Google-schrijftransacties. Een ontwikkelaar kan alle bronnen met een editor of AI-programmeertool naar keuze aanpassen.

## Eigen private GitHub-repository

Maak in GitHub een lege **private** repository. Voer lokaal uit:

```sh
git init -b main
git add .
git commit -m "Zelfstandige export Boer Bart 2027"
git remote add origin git@github.com:UW-ORGANISATIE/boer-bart-2027.git
git push -u origin main
git tag export-2026-10-29
git push origin export-2026-10-29
```

De ZIP bevat bedrijfsinformatie en hoort privé te blijven. Er is in deze opdracht geen nieuwe GitHub-repository aangemaakt of geüpload. `.gitignore` sluit lokale wachtwoorden, opslag, logs en builds uit. De exportdata blijven bewust mee versiebeheer in gaan als uitgangspunt; toekomstige persoonsgegevens horen in de runtime-opslag.

De oude bronhistorie kan afzonderlijk worden geopend met bijvoorbeeld `git clone originals/git-history/planbord.bundle ../oude-planbord-bron`. De zelfstandige wijzigingen vormen een nieuwe baseline; de originele geschiedenis is niet herschreven.

## Terugdraaien en back-ups

Gebruik Git-commits/tags voor bronwijzigingen; bijvoorbeeld `git revert <commit>`. Een bronrollback draait databasewijzigingen niet terug. Maak vóór updates een back-up: stop de processen, kopieer beide volledige `var/` mappen (inclusief SQLite/WAL/SHM en media) en bewaar de bijbehorende commit plus `.env.local` veilig buiten Git. Herstel met gestopte processen naar dezelfde `APP_DATA_DIR`. Verlies van `SHEETS_CONFIG_KEY` maakt lokaal opgeslagen Google-sleutels onleesbaar; opnieuw koppelen blijft mogelijk. Test herstel op een kopie voordat je eigen productieomgeving gebruikt.

Sinds de overstap naar Supabase (4 november 2026) staat de database van de backoffice in Postgres: online bij Supabase (`DATABASE_URL`, met de back-ups van Supabase), en zonder `DATABASE_URL` in `apps/backoffice/var/pgdata`. Maak van die map een back-up met de backoffice gestopt. Het oude `var/database.sqlite` blijft na de verhuizing als reservekopie staan. Zie `docs/SUPABASE-OVERSTAP.md`.

Zie [Google](docs/GOOGLE.md) voor heraansluiting en [hosting](docs/HOSTING.md) voor eigen hosting. Geen wachtwoorden, toegangstokens of bestaande geheime Google-configuratie zijn meegeleverd.

## Centraal verbeteringenoverzicht en dagelijkse goedkeuring

De ontwikkelmodus bevat **Ontwikkelingen & dagelijkse goedkeuring**: één overzicht voor website en backoffice, ontwikkelaar-/PR-koppelingen, zeven ontwikkelstatussen en exports voor Codex en Claude Code. Een dagelijkse selectie wordt eerst gecombineerd en getest op een aparte integratiebranch; samenvoegen vereist expliciete eigenaarbevestiging. Samenvoegen staat standaard uit totdat de actuele planbordbron, bescherming van main en scheiding van live-publicatie zijn ingesteld. Zie [gebruik, veiligheid en configuratie](docs/CENTRAAL-VERBETERINGEN.md).
