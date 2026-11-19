> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Inhoud en het dorp van sites

**Wens eigenaar, 13 november 2026:** „De site, het systeem enz. is een prachtig huis geworden. Ik wil nu verder met het dorp. Een logische inrichting van verschillende sites die de informatie uit de backoffice halen. Er moet plek zijn voor nieuwsbrieven, blogs, filmpjes, evenementen enz. Maar dit mag de backoffice niet beïnvloeden.”

## Het idee

- **Het huis** is de backoffice: de enige bron (zie [centrale backoffice](ARCHITECTUUR-CENTRALE-BACKOFFICE.md)).
- **Het dorp** zijn de sites: de hoofdsite, en later Ite, de winkel, de speelboerderij en de coöperatie.
- **Eén poort.** Het dorp komt alleen via de vaste poort `/api/public/v1/…` het huis binnen, en alleen om te lezen.
- **Een contract.** Wat de poort teruggeeft, is een contract:
  - velden mogen erbij komen;
  - velden verdwijnen of veranderen nooit;
  - moet dat toch, dan komt er een `v2` naast `v1`, en `v1` blijft werken.
- Zo kan de backoffice verbouwen zonder dat een site iets merkt, en verandert een site nooit iets aan de backoffice.

## Stap 1 (gebouwd): blogs, nieuws en filmpjes

**In de backoffice:** Marketing & website → **Inhoud · blogs & filmpjes** (`/inhoud`).

- Elk stuk heeft:
  - een soort (blog, nieuws, filmpje);
  - een titel, een korte inleiding en een tekst;
  - een foto uit de beeldbank;
  - een link naar YouTube of Vimeo;
  - de sites waar het op komt;
  - een publicatiedatum.
- **Tekst:** een witregel begint een nieuwe alinea, en een regel die met `## ` begint, is een tussenkop. Er gaat geen HTML mee: de site zet alles als gewone tekst neer.
- **Status:**
  - **Concept:** alleen het team ziet het.
  - **Gepubliceerd:** binnen twee minuten op de aangevinkte sites. Met een datum in de toekomst verschijnt het die dag vanzelf (het scherm toont dan „Gepland”).
  - **Archief:** van de sites af, maar het stuk blijft bewaard.
- **Weghalen** kan alleen bij een concept.
- **Gelijktijdig werken:** slaat iemand anders intussen hetzelfde stuk op, dan meldt het scherm dat. Er wordt niets stil overschreven.
- **Rechten:** eigenaren, en medewerkers met het vinkje *Marketing & website*.
- **Filmpjes:**
  - De filmpjes staan op YouTube of Vimeo, niet bij ons. Er staat alleen de link.
  - De site toont een vaste speler: YouTube zonder volgcookies (`youtube-nocookie.com`), of Vimeo.
  - De speler laadt pas als de gast op „Afspelen” klikt.
  - Elk ander adres wordt geweigerd.
- **Foto's:** een beeldbankfoto wordt pas openbaar (`/api/public/media/<id>`) als het stuk gepubliceerd en verschenen is. Let op herkenbare personen en hun toestemming.
- **Evenementen** blijven in Planning, met aanmelden en betalen. De agenda op de sites leest ze daar (`/api/public/availability`). Er is geen tweede evenementenlijst.

**De poort:** `GET /api/public/v1/inhoud?site=<site>[&soort=blog|nieuws|video][&adres=<adres>][&aantal=1–100]`

- Het antwoord ziet er zo uit: `{versie:1, site, items:[…]}`.
- Elk stuk in `items` heeft precies deze velden: `slug`, `kind`, `title`, `summary`, `blocks` (`[{type:'kop'|'alinea', text}]`), `photo`, `video` (`{provider, id, url, embed, thumbnail}` of `null`), `sites` en `publishedAt`.
- Wie iets schreef, interne kenmerken, concepten en archief gaan nooit naar buiten.
- De database wordt hooguit één keer per minuut gelezen.
- Bij een storing antwoordt de poort met 503. Hij geeft dan nooit oude of geraden inhoud.

**Sites (sleutels):** `boerbart` (hoofdsite), `ite`, `winkel`, `speelboerderij` en `cooperatie`.
- **Indeling 15 november 2026 ([SITES.md](SITES.md)):** Ite, winkel en speelboerderij zijn onderdelen van de hoofdsite, geen aparte sites. Alleen `boerbart` wordt gebruikt; de andere sleutels blijven bestaan.
- Een sleutel wordt nooit hernoemd; er komen alleen sleutels bij (`lib/inhoud.ts`, `SITES`).

**Op de nieuwe website** (`apps/website-fab`):
- `/nieuws/` toont alle stukken voor `boerbart`, met filters, „Lees verder” en de filmpjesspeler.
- Elk stuk heeft een eigen link: `/nieuws/#<adres>`.
- Op de homepage staat het blok „Van het erf” met de nieuwste drie. Zonder stukken verschijnt het blok niet.
- „Nieuws en blog” staat in het mobiele menu en in de voettekst.

## Oude blogs van example.nl (gebouwd, 13 november 2026)

**Vraag eigenaar:** „Hoe halen we nu alle oude blogs van de vorige site?”
**Besluit eigenaar:** eerst als concept.

**In Inhoud:** het blok **„Oude blogs van example.nl”**, met de knop **Oude blogs ophalen**.

- **Waar het draait.** De backoffice haalt de blogs zelf op van de Wix-site, dus ook online, zonder Chromebook.
- **Welke blogs.** De lijst komt uit de sitemap van Wix (`/blog-posts-sitemap.xml`). Op 13 november 2026 stonden daar 87 blogs, van 2015 tot 2026.
- **In porties.** De blogs komen in porties van vijf binnen, met een teller.
- **Wat er per blog meekomt:**
  - titel en inleiding (de eerste alinea);
  - de tekst, met tussenkoppen en opsommingen (`• `);
  - de **oorspronkelijke datum**;
  - de coverfoto, in de beeldbank;
  - een YouTube-filmpje uit de tekst.
- **Status:** alles komt binnen als **concept** op de hoofdsite. Niets is meteen openbaar.
- **Vertalingen overgeslagen:** 5 Engelse blogs en 1 Duitse. Het zijn vertalingen van Nederlandse blogs, en die komen wel mee.
- **Nooit dubbel:**
  - Elk stuk onthoudt waar het vandaan komt (`wix:<oud adres>`, kolom `source`, uniek).
  - Nog eens drukken haalt alleen op wat er nog niet is.
  - Een foto met dezelfde herkomst staat maar één keer in de beeldbank.
- **Publiceren:** vink in de lijst de concepten aan (of „Alle concepten hieronder”) en kies **Geselecteerde publiceren**.
  - Het filter „Oude blogs” toont alleen de overgehaalde stukken.
  - De oude datum blijft staan.
- **Wat niet meekomt:**
  - foto's midden in de tekst (ongeveer 20 blogs hebben er één tot zes);
  - opmaak zoals vet, cursief en links;
  - filmpjes die bij Wix zelf staan.
- **Lukte een coverfoto niet,** dan staat dat in de opmerkingen. Kies die foto dan zelf in het stuk.
- **Veiligheid:** de backoffice vraagt alleen vaste adressen op. Dat zijn de sitemap en `/post/…` op www.example.nl, en foto's op static.wixstatic.com. Er is nooit een adres dat iemand zelf invult.
- **Later:** de herkomst bewaart het oude adres. Gaat example.nl over, dan kan `/post/<oud adres>` doorverwijzen naar `/nieuws/#<adres>`.

**Techniek:**
- Lezen: `lib/wix-blog.ts`.
- Ophalen en opslaan: `lib/wix-import.ts`.
- Publiceren in één keer en vastleggen: `publishMany` en `insertImported` in `lib/inhoud.ts`.
- Migratie: `0066_oude_blogs`.
- Test: `tests/oude-blogs.test.mjs`, met een nagemaakte Wix-pagina (`tests/helpers/wix-pagina.mjs`).
- **Proef op 13 november 2026** tegen de echte site, in een tijdelijke database:
  - 81 blogs overgehaald, 6 vertalingen overgeslagen, niets mislukt;
  - een tweede keer drukken haalde niets dubbel binnen.

## Foto's van de oude site en de webversie (gebouwd, 13 november 2026)

**Besluit eigenaar:** „Ja, dit is een goed plan”. Dat plan: alle foto's van de oude site in originele kwaliteit in de beeldbank, en websites en schermen krijgen een lichte versie.

**Ophalen.** In Inhoud, blok „Oude site example.nl”, staat de knop **Foto's van de oude site ophalen**.

- **Welke pagina's.** De backoffice leest de sitemaps van Wix: pagina's, blogs, menukaarten en avonden.
  - Op 13 november 2026 waren dat 136 pagina's met ongeveer 285 verschillende foto's.
  - De oude rondleiding en de losse agenda-items worden overgeslagen.
- **Originele kwaliteit.** Van elke foto wordt het origineel opgehaald: het bestand zoals het ooit is geüpload, meestal 2000–6000 pixels.
  - Geeft Wix het origineel niet, dan wordt de verkleinde versie van de pagina gebruikt.
  - Sommige foto's bestaan bij Wix niet meer en tonen ook op de oude site niets. Die worden geteld en overgeslagen.
- **Naam en herkomst.** Elke foto heet „<paginanaam> – oude site”. De herkomst is die pagina.
- **Nooit dubbel.** De sleutel per foto is `wix:<foto-ID>`. Dezelfde foto op meerdere pagina's, of als coverfoto van een blog, staat er één keer in.
  - De coverfoto's van de oude blogs worden nu ook als origineel opgehaald.
- **In porties.** Per pagina gaan er hooguit 8 foto's per verzoek, met een teller.
  - Nog eens drukken haalt alleen op wat er nog niet is.
  - Foto's die niet meer bestaan, worden niet eindeloos opnieuw geprobeerd.
- **Opslag.** Ongeveer 1,4 MB per origineel, samen ongeveer 400 MB in Supabase Storage. Op het gratis abonnement is daar 1 GB voor.

**Webversie** (`lib/web-photo.ts`):
- `/api/public/media/<id>` (websites) en `/api/media/<id>` (backoffice) geven voortaan een lichte versie:
  - hooguit 1920 pixels breed of hoog;
  - rechtop gezet volgens de camera;
  - **zonder cameragegevens**, dus ook zonder GPS-plek;
  - JPEG, of WebP als de foto doorzichtig is.
- De webversie wordt bij de eerste keer gemaakt en bewaard naast het origineel. Daarna wordt hij alleen nog doorgegeven.
- `/api/media/<id>?origineel=1` geeft het origineel, voor drukwerk en downloaden.
- Lukt verkleinen niet, dan komt het origineel.
- **Proef 13 november 2026,** tegen de echte site met „Over ons” en „Keuken”:
  - 49 foto's, samen 69 MB;
  - de webversies waren 3 tot 40 keer kleiner, bijvoorbeeld 12 MB naar 295 KB.

**Techniek:**
- Ophalen per pagina: `lib/wix-photos.ts`.
- Opslaan en hergebruiken: `storeWixPhoto` in `lib/wix-import.ts`.
- Verkleinen: `sharp`, nu een vaste afhankelijkheid van de backoffice.
- Test: `tests/oude-fotos.test.mjs`.

## Verhalen van de oude site (gebouwd, 15 november 2026)

**Opdracht eigenaar:** „Ga verder met de verhalen van de oude site.”

**In Inhoud:** in het blok „Oude site example.nl” staat de knop **Verhalen ophalen**. De verhalen komen per drie binnen, met een teller.

- **Vaste lijst van 17 pagina's:** Jerseys, Over ons, Onze keuken, Boerderij, Gras, Kippen, Kippenboer, Mobiel melken, Boerenpaad, Schoolreisje, Kinderfeest, Boerderijrecreatie als coöperatie, Bepaal zelf de waarde, Strategiesessie, Speelboerderij, Ite by Boerderijrecreatie en Boerderijwinkel.
- **Bewust niet mee:**
  - Obligatie (geen tekst);
  - Feest (alleen een formulier);
  - Eten en bestellen (vervangen door de bestelapp);
  - Infographic (alleen een filmpje);
  - de Duitstalige pagina's;
  - de rondleiding.
- **Per pagina:**
  - de tekst binnen de pagina, zonder de kop- en voettekst van de site;
  - koppen, alinea's en opsommingen;
  - de eerste foto van de pagina als coverfoto, als origineel in de beeldbank;
  - een YouTube-filmpje als dat erop staat.
- **Wix-eigenaardigheden die worden opgevangen:**
  - Wix gebruikt kopstijlen ook voor gewone tekst. Een lange „kop” wordt daarom een alinea.
  - Dubbele koppen (voor telefoon en computer) komen er één keer in.
  - Letters met accenten worden goed omgezet (`&euml;` wordt ë).
- **Concept, zonder datum.** De datum wordt vandaag zodra je publiceert. De herkomst is `wix-pagina:<adres>`, uniek, dus er komt nooit iets dubbel binnen.
- **Oude prijzen.** In Schoolreisje, Kinderfeest, Coöperatie, Strategiesessie en Ite staan prijzen uit de oude site. Dat staat bij de opmerkingen.
  - Het bewerkscherm waarschuwt nu bij elke tekst met een prijs (€ of „euro”).
  - Prijzen horen in Gerechten & prijzen (centrale backoffice als enige bron). Haal ze uit het verhaal of verwijs naar de prijzenpagina.
- **Proef 15 november 2026,** tegen de echte site in een tijdelijke database:
  - alle 17 verhalen overgehaald, alle 17 met foto, niets mislukt.
  - Sommige pagina's (zoals Over ons) hebben op Wix elke regel als losse alinea. Die komen zo binnen; trek ze bij het nalezen samen waar dat mooier is.
- **Techniek:**
  - lezen: `parsePage` en `STORY_PAGES` in `lib/wix-blog.ts`;
  - ophalen: `wixStoryList` en `wixImportStories` in `lib/wix-import.ts`;
  - test: `tests/verhalen.test.mjs`.

## Wat er nog meer op de oude site staat (inventaris 13 november 2026)

De Wix-site heeft 63 pagina's naast de blogs.

- **Rondleiding** (`/rondleiding` met 11 stops, zoals welkom, melken, kalfjes-melk-geven en legnesten): **niet overzetten**.
  - Besluit eigenaar, 13 november 2026: „Dit willen we opnieuw opbouwen met een soort van interactieve app voor de rondleiding over de boerderij. Komt nog en mag weg.”
  - Hangen er op het erf QR-codes naar deze adressen, laat ze bij de overstap van example.nl dan tijdelijk doorverwijzen, tot de nieuwe rondleiding er is.
- **Nog te bespreken:**
  - menukaarten en avonden nalopen tegen Gerechten & prijzen en Planning;
  - doorverwijzingen van de oude adressen;
  - wat de eigenaar zelf uit het Wix-dashboard exporteert: contacten met hun nieuwsbrieftoestemming, reviews, jaarkaarten en cadeaubonnen, boekingen.

## Techniek

- **Tabel:** `content_items` (`db/schema.ts`, migratie `drizzle-pg/0064_inhoud.sql`, met beveiliging per rij).
- **Regels:** `lib/inhoud.ts`.
- **Beheer:** `app/inhoud/page.tsx` en `app/api/inhoud/route.ts`.
- **Poort:** `app/api/public/v1/inhoud/route.ts`, als openbaar adres in `proxy.ts`.
- **Foto's:** `app/api/public/media/[id]/route.ts`.
- **Site:** `src/content/inhoud.ts`, `src/pages/Nieuws.tsx` en `src/components/NewsTeaser.tsx`.
- **Tests:** `apps/backoffice/tests/inhoud.test.mjs`. Die bewaakt:
  - de velden van het contract;
  - wat niet openbaar mag;
  - de filmpjeslinks;
  - dat de poort openbaar en alleen-lezen is;
  - de rechten;
  - opslaan tegen een echte database.
- De kamerlijst noemt de nieuwe kamers.

## Volgende stappen

2. **Meer sites.** Een thema per site en een eigen domein, bijvoorbeeld `nieuw.example.nl`, later ook voor Ite en de winkel. Alle sites lezen dezelfde poort met hun eigen sleutel.
3. **Een nieuwsbrief.**
   - De backoffice is de bron van de inhoud en van wie toestemming gaf (klantenkaart).
   - Het versturen gebeurt via een nieuwsbriefdienst, vanaf een eigen verzendadres (bijvoorbeeld `nieuws.example.nl`).
   - Op de sites komt een archief van eerdere nieuwsbrieven.
4. **Vaste teksten en prijzen** in `apps/website-fab/src/content/site.ts` (entree, kinderfeest, schoolreisje, Ite, lidmaatschap) moeten nog uit de backoffice komen.
   - Prijzen horen bij Gerechten & prijzen, niet bij Inhoud.
   - Daarom zijn ze in deze stap bewust niet verhuisd.

## Stap 2 (gebouwd): privacy voor alle sites

Eén privacybeleid, beheerd bij Marketing & website → **Privacy · alle sites** (`/privacy`). Elke site haalt het op via de vaste poort `GET /api/public/v1/privacy`; bedrijfsnaam, adres, KvK en e-mail komen uit Bedrijfsgegevens. Zie [Privacy voor alle sites](PRIVACY-ALLE-SITES.md).
