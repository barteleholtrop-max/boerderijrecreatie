> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Zelfservicekassa in de winkel

**Besluit eigenaar, 4 november 2026.** Gasten rekenen in de boerderijwinkel zelf af op een tablet.
**Planbord:** beslissing `2026-11-04-zelfservicekassa-winkel`, bij „Winkel — betaling & betaalbewijs”.

## Winkel alleen via zelfscannen (besluit eigenaar 11 november 2026)

> „Kassa voor de boerderijwinkel kan wel volledig zelfscannen worden. Dat scheelt ons werk.” — „Ja, dat mag eerst wel weg. Wellicht doen we dat later weer, maar voor nu mag hij weg.”

- **Bestelpagina:** op de gewone bestelpagina staan alleen eten en drinken. Een link naar de winkel (`#winkel`) toont de uitleg „De boerderijwinkel reken je af in de winkel zelf, met de zelfkassa.”
- **Winkel blijft** op de zelfkassa (`?zelfservice=1`) en in de winkel met de eigen telefoon (`?winkel=1`, via de QR-stickers en de Zelfkassa-knop van de ledenpagina).
- **Website-fab:** de winkelpagina toont geen webshop meer, wel „Pak, scan en reken zelf af”.
- **Vooraf bestellen en afhalen** staat daarmee uit. De code staat er nog. Weer aanzetten kan met `SHOP_ONLINE` op `true`, in `apps/website/bestellen.js` en in `apps/website-fab/src/pages/Winkel.tsx`.

## Zelfscan op de eigen telefoon (wens eigenaar 12 november 2026)

- **Eigen pagina en app.** Gasten en leden scannen in de winkel met hun eigen telefoon op een eigen pagina met een eigen app: `<website>/zelfscan.html`, met manifest `zelfscan-app.json` en werkgebied `zelfscan.html`. Alleen de winkel; de app opent niet op volledig scherm.
- **Toegang.** De Zelfkassa-knop van de ledenpagina en de QR-stickers openen deze pagina.
- **Tablet.** De zelfkassa op de tablet heeft sinds 12 november 2026 ook een eigen pagina en app: `zelfkassa.html`, op volledig scherm.
- **Overzicht** van alle apps: [Losse apps op het startscherm](APPS.md).

## Staand of liggend (11 november 2026)

De Zelfkassa-app draait mee met het toestel (`orientation: any`). Een oudere installatie zette de stand vast op liggend. Die app ving bovendien alle links naar de website op, zodat ook de website liggend opende.

- Sinds 11 november hoort alleen de kassapagina bij de app (`scope: bestellen.html`).
- De website (`index.html`) en de bestelpagina geven de schermstand vrij als ze toch in een app openen.

Blijft een telefoon liggend openen, verwijder de app Zelfkassa dan één keer en zet hem opnieuw op het startscherm.

## Zo zet je hem neer

**Boerderijwinkel → Zelfkassa & QR-stickers** (`/winkel/zelfkassa`, wens eigenaar 9 november 2026) geeft de link voor de tablet,
met een QR-code om hem op de tablet te openen en de stappen hieronder:

- de link: `https://<website>/zelfkassa.html` (het websiteadres uit `WEBSITE_URL` / `PUBLIC_ORDER_ORIGINS`). Eigen pagina en app sinds 12 november 2026; het oude adres `bestellen.html?zelfservice=1` werkt nog;
- op de eigen computer: `http://localhost:3002/zelfkassa.html`.

Je ziet dan alleen het winkelmandje, zonder keuze voor eten en drinken, zonder links naar de rest van de website, zonder
afhaalkeuze en zonder werkplekken (barista, kok, voorraad, aanwezigheid, dagplanning).

1. Gebruik een tablet met een camera (bijvoorbeeld een Android-tablet met Chrome).
2. Open de link en kies in Chrome ⋮ → **Toevoegen aan startscherm**.
3. Zet in Android **App vastzetten** aan, zodat gasten de kassa niet verlaten.
4. Zet de tablet zo neer dat de gast met de achtercamera een etiket kan fotograferen; geef de eerste keer toestemming voor de camera.

### Kassa met druktoetsen en tabletstand (wens eigenaar 9 november 2026)

- **Zelfkassa op een telefoon:** scant iemand de tabletlink met de eigen telefoon, dan is er geen QR nodig. Op een klein scherm
  (kortste kant onder 600 pixels) heet de knop **Afrekenen** en gaat het meteen naar de betaalpagina op dat toestel (iDEAL, of
  BB-saldo als de telefoon gekoppeld is). Op de tablet blijft het de QR-code.

- **Druktoetsen zoals onze kassa:** links per productgroep grote toetsen met naam en prijs (een tik = één op de bon, met een
  teller op de toets); rechts altijd de **bon** met plus/min per regel, het totaal, **Afrekenen** en **Bon leegmaken**.
  Bovenaan de toetsen **🏷️ Etiket fotograferen**. Een product met een keuze of een etiketprijs
  opent eerst het productvenster.
- **Etiketten in een reeks (wens eigenaar 9 november 2026):** **🏷️ Etiket fotograferen** opent de camera-app. Na elke foto
  vraagt de kassa **📸 Nog een etiket** of klaar. Elke foto wordt meteen gelezen (Claude, `POST /api/public/etiket`) terwijl de
  klant de volgende maakt; het overzicht toont per foto het product en het bedrag, of „niet gelezen” met **Opnieuw**. Met
  **Alle n in mijn mandje** gaan ze in één keer op de bon. Hooguit 6 foto's per reeks (de backoffice leest er 6 per minuut per
  apparaat). Werkt voor elk winkelproduct, niet alleen voor producten met een etiketprijs.
- **Streepjescodes en nieuwe producten (wens eigenaar 10 november 2026):** de zelfkassa zoekt de streepjescode in de etiketfoto en stuurt hem mee; een verpakt product zonder etiketbedrag (vla van Zuivelrijck) wordt herkend of nieuw aangemaakt met een prijsvoorstel uit de inkoopfactuur (+ 20% marge) en is meteen te koop. Zie [Streepjescodes en Levering fotograferen](STREEPJESCODES-EN-LEVERING.md).
- **Geen camerascanner meer (besluit eigenaar 9 november 2026: „Scan een product kan daarmee wel vervallen”):** de knop
  📷 Scan een product, het lezen van QR-stickers en streepjescodes met de camera en het wisselen van camera zijn weg. De
  QR-sticker op een product werkt nog met een gewone telefoon (opent het product op de bestelpagina). Streepjescodes bij een
  product (Gerechten & prijzen) blijven bewaard.
- **Wie levert het:** klein op de toets (en op de productkaart van de bestelpagina) „Geleverd door Sanne”: de voornaam van het
  lid dat eigenaar is, of de beheerder of naam van de onderdeelpot (`lib/product-suppliers.ts`, openbaar veld `supplier`).
  Nooit een achternaam. Producten van de coöperatie zelf hebben geen leverancier.
- **Camera:** de etiketscanner opent altijd de achtercamera, op de tablet én op de telefoon (besluit eigenaar 12 november 2026:
  „altijd op de achterste camera openen, dat werkt het logischst”). Een eerder bewaarde keuze (`bb-camera`) telt niet meer. Heeft
  een toestel geen achtercamera, dan opent de camera die er is.
- **Wat is het je waard?:** staat het eigen bedrag aan (Bestelopties), dan gaat **Afrekenen met je telefoon** aan zodra er een
  geldig bedrag is ingevuld (hersteld 9 november 2026: de knop bleef uit).
- **Eerst het bedrag, dan hoe** (wens eigenaar 13 november 2026: „hij moet eerst vragen hoeveel je wil betalen”): bij zelfscannen
  op de eigen telefoon staat **Geef wat goed voelt** bovenaan het afrekenscherm, boven **Hoe wil je betalen?** (betaalverzoek of
  BB-saldo). Met BB-saldo betaal je de gemiddelde waarde.
- **Na het betalen** (wens eigenaar 13 november 2026): bij zelfscannen geen „Stuur mij een bericht als het klaar staat” (dat is
  voor eten en drinken), maar **Betaald! Veel plezier met je boodschappen.** met de knop **Klaar**. De bon van de backoffice zegt
  `winkel: true`. Afhalen in de winkel op een later moment houdt het bericht wel.
- **Na betalen terug in de zelfscan** (melding eigenaar 13 november 2026: „als je op Klaar drukt kom je op de bestelpagina”): het
  terugadres na het betaalverzoek mag nu ook `/zelfscan.html` zijn (`returnPage` in `lib/public-orders.ts`). In de zelfscan
  houdt **Klaar** je in de lege zelfscan, met „Klaar! Je kunt de app nu sluiten.” Zelf sluiten is weer weggehaald (melding eigenaar 14
  november 2026): na het betalen opent de bank-app de zelfscan vaak in een nieuw tabblad, en sluiten liet dan een ouder tabblad met de
  bestelpagina (Eten & drinken) zien.
- **Niet op de werkplek Winkel** (wens eigenaar 13 november 2026: „de zelfscankassa hoeft niet in de winkel te verschijnen”): een
  winkelbestelling zonder afhaalmoment (zelfscan en zelfkassa) heeft de klant al meegenomen en komt niet bij Werkplek → Winkel
  (`/api/workplaces`). Afhalen in de winkel op een later moment komt er wel.
- **Eigen app op de tablet:** met `?zelfservice=1` gebruikt de pagina `zelfkassa-app.json` (id `zelfkassa`, start_url
  `bestellen.html?zelfservice=1`, `display: fullscreen`, `orientation: any`: het toestel bepaalt, dus een telefoon staand en een tablet aan de muur liggend; besluit eigenaar 11 november 2026, eerder vast liggend). Geïnstalleerd opent het pictogram **Zelfkassa** dus altijd
  de zelfkassa op volledig scherm, nooit de bestelpagina met eten, drinken en koffie. In de browser vraagt de eerste tik om
  volledig scherm (niet bij de etiketknoppen: dat verzoek verbruikt de tik en dan mag de camera niet open).

## Wat de gast doet

1. Producten aantikken, of de etiketten fotograferen: één foto, **📸 Nog een etiket** voor de volgende, en dan
   **Alle n in mijn mandje**. Een product met een keuze opent het productvenster.
2. Eventueel zelf het bedrag kiezen ("Jou wat goed fielt"), als dat aanstaat bij Bestelopties.
3. **Afrekenen met je telefoon** (wens eigenaar 9 november 2026: niet contant op de tablet). De tablet toont een QR-code naar
   de betaalpagina op de eigen telefoon (`bestellen.html?betaal=<aanvraagnummer>`). Daar:
   - **Betalen met iDEAL** via Mollie;
   - **Betalen met je saldo**: alleen op een telefoon die eerder via de ledenpagina is gekoppeld (knop Zelfkassa). Eerst het
     rentesaldo, daarna het BB-saldo, zoals bij bestellen met dividend.
   De tablet ziet vanzelf dat er betaald is.
4. "Tankjewol!" Na 20 seconden, of met **Volgende klant**, is het scherm weer leeg.

Tikt er 2 minuten niemand iets, dan maakt het scherm het mandje leeg, behalve tijdens het wachten op een betaling (hooguit
15 minuten).

## QR-stickers

Op **Zelfkassa & QR-stickers** kies je per gepubliceerd winkelproduct hoeveel stickers je wilt en print je het vel. De
sticker bevat `https://<website>/bestellen.html?winkel=1&product=<id>`:

- de tablet zet het product meteen in het mandje;
- een gewone telefoon opent het product op de bestelpagina.

De sticker blijft geldig als de prijs verandert; de prijs komt altijd uit de backoffice. Er worden geen streepjescodes (EAN)
gebruikt.

## Etiket fotograferen (wens eigenaar 9 november 2026)

Vlees en andere producten met een etiketprijs (bijvoorbeeld runderlever: 0,690 kg × € 18,50/kg = € 12,77) hoeven niet meer
overgetypt te worden.

- **Zelfkassa (tablet) en Zelfkassa van de ledenapp:** knop **🏷️ Etiket fotograferen**, of in het productvenster **📷 Foto van het
  etiket**. De foto wordt op het apparaat verkleind (onder 1 MB) en naar `POST /api/public/etiket` gestuurd. Claude leest
  naam, gewicht, kiloprijs en totaal en kiest het winkelproduct. De klant ziet **Klopt dit?** met het bedrag en tikt zelf op
  **Ja, in mijn mandje**. Past gewicht × kiloprijs niet bij het totaal, dan vraagt het scherm om het bedrag te controleren.
  Lukt het lezen niet, dan kan de klant een nieuwe foto maken of het bedrag zelf intypen.
- **In de winkel op de telefoon:** wie de winkel opent via de Zelfkassa-knop van de ledenpagina of een QR-sticker
  (`?winkel=1`), kan producten met een etiketprijs ook op de eigen telefoon kopen, alleen met „Nu, ik ben in de winkel”
  (niet vooraf bestellen). Gewoon online staan ze er nog bij als „in de winkel”.
- **Keuken (werkplek Voorraad → Uit de winkel halen):** de kok tikt **📷 Etiket** of typt het etiketbedrag in. Elk stuk is een
  eigen regel. Besluit eigenaar 9 november 2026: de keuken betaalt **het etiketbedrag min het coöperatiedeel** van de eigenaar
  (bijvoorbeeld 15%: € 12,77 → € 10,85); zonder eigenaar het volle etiketbedrag. De server rekent dat zelf uit
  (`internalLabelUnitCents` in `lib/stock-count-core.ts`). Route voor de werkplek: `POST /api/werkplek/etiket` (achter de login).
- **Model en kosten:** Claude Opus 5.5 op lage inspanning (`LABEL_AI_MODEL` kan dat overschrijven), met de Claude-sleutel van
  Systeem & koppelingen. Elke foto kost Claude-gebruik. Daarom geldt een limiet: per apparaat 6 per minuut en 60 per dag,
  samen 60 per minuut en 1.000 per dag (per serverinstantie). Zonder Claude-sleutel staat het lezen uit; intypen werkt altijd.
- **Op de lange termijn:** een prijsbarcode op het etiket (EAN-13 met het bedrag erin) is gratis en foutloos; vraag de slager
  of de etiketprinter dat kan.

## Onbekend product via een etiket (wens eigenaar 9 november 2026)

„Als een product nog niet bestaat, kun je het toevoegen aan de productlijst (niet in het startscherm). Zo krijgen we een mooi
overzicht van wat we verkocht hebben.”

- Past een gefotografeerd etiket bij geen enkel winkelproduct, dan maakt de backoffice het product aan (`lib/label-products.ts`):
  naam van het etiket (netjes gemaakt), afdeling Winkel, station winkel, btw 9%, **klant voert de prijs in**, de etiketprijs als
  richtprijs, **niet op het startscherm** (`onStartscherm: false`) en het kenmerk **nieuw via zelfkassa** (`zelfkassa`).
- Een product met dezelfde naam wordt hergebruikt, nooit dubbel aangemaakt. Hooguit 30 nieuwe producten per dag (per
  serverinstantie). Dit werkt op de zelfkassa, in de Zelfkassa van de ledenapp en bij de keuken (werkplek Voorraad).
- **Nakijken:** Gerechten & prijzen → filter **Nieuw via zelfkassa**. In het product, blok Voorraad & prijsadvies: de melding
  met het etiket, en het vinkje **Op het startscherm van de kassa**. Opslaan haalt het kenmerk weg.
- **Niet op het startscherm:** geen toets of kaart op de zelfkassa, de website en de medewerkerskassa (daar wel te vinden met
  zoeken); wel via een etiket te kopen en zichtbaar in alle verkoopoverzichten. Openbaar veld: `tile`.

## Bonvraag: bij wie hoort de bon? (wens eigenaar 9 november 2026)

„Als er een nieuw product is wat je nog niet hebt herkend, mag je het wel afrekenen. Maar er moet één keer per week, voor het
uitbetalen, gevraagd worden bij wie die bon hoort.” Bijvoorbeeld: is het gescande vlees van Jan, Ingeborg of Pieter?

- **Welke verkopen:** regels van een product dat via een etiket nieuw is aangemaakt (blijvend kenmerk `viaEtiket`, ook na het
  nakijken), zonder eigenaar op de bonregel en zonder eigenaarskeuze bij het product. Proefbestellingen tellen niet mee.
- **Waar:** Boerderijwinkel → Weekafsluiting, blok **Bij wie hoort deze bon?** Per bonregel kies je een lid of **Boerderijrecreatie zelf**.
  Met **Volgende keer ook** (standaard aan) wordt die keuze de eigenaar van het product en komt de vraag niet terug; zonder vinkje
  komt hij elke week terug (handig als vlees van verschillende leden kan zijn). In **Goedkeuringen** staat een herinnering.
- **Gevolg:** het gekozen lid komt op de bonregel (`order_lines.owner_id`), dus de weekafrekening, het BB-tegoed en het
  betaalbestand rekenen het bij dat lid. **Week goedkeuren** kan pas als alle vragen van die week beantwoord zijn.
- **Techniek:** `lib/shop-questions.ts`, tabel `shop_line_answers` (migratie `0050_bonvraag`), `GET /api/cooperatie?bonvragen=<maandag|alle>`,
  `POST /api/cooperatie` met `action: 'bonvraag'`. Test: `apps/backoffice/tests/bonvraag.test.mjs`.

## Wat de backoffice doet

- Een bestelling van de zelfservicekassa is een gewone winkelbestelling. Hij wacht op betaling en komt pas na betaling bij de werkplek Winkel, in de omzet en van de voorraad af.
- Betalen met saldo op de telefoon: `POST /api/public/payments` met `{requestId, method: 'bb', dividend: <telefoonkoppeling>}`
  (`payOrderWithBalance` in `lib/online-payments.ts`). Dezelfde voorwaarden als bij bestellen met dividend; geweigerd als er
  al een iDEAL- of contante betaling voor die bestelling loopt, zodat er nooit twee keer wordt betaald.
- Contant via de API (provider `balie`) bestaat nog voor de medewerkerskassa en oudere schermen; de zelfservicekassa biedt het niet meer aan.
- De QR-code wordt in de backoffice gemaakt (`GET /api/public/qr`), alleen voor betaalpagina's van Mollie en de eigen website.

## Nog niet gebouwd

- **Pin via de Mollie-pinterminal.** Hiervoor is het terminal-ID uit het Mollie-dashboard nodig. Mollie heeft voor terminals waarschijnlijk geen testomgeving.
- **Dividend met lidcode.** De bestelling wordt dan bij de uitkering verrekend. Daarvoor moet eerst worden vastgesteld wie de leden zijn.
- **Bonprinter.** Eventueel later.

Er komt geen weegschaal (besluit eigenaar). Producten per gewicht verkoop je voorverpakt: met een vaste prijs, of met de prijs op het etiket die de klant zelf invoert (zie Etiketprijs hieronder).

## Let op

Begint een gast op de telefoon met iDEAL en wil hij daarna met zijn saldo betalen, dan weigert de backoffice dat tot de iDEAL-betaling is afgerond of verlopen (ongeveer een kwartier).

## Techniek en tests

| Onderdeel | Waar |
| --- | --- |
| Zelfservicestand van de bestelpagina | `apps/website/bestellen.js` (`?zelfservice=1`, etiketten, `?betaal=`, `?product=`), `bestellen.css` |
| Betalen met saldo voor een bestaande bestelling | `apps/backoffice/lib/online-payments.ts` (`payOrderWithBalance`) |
| Link voor de tablet en QR-stickers | `apps/backoffice/app/winkel/zelfkassa/` |
| Contant aanvragen, wachtende betalingen, bevestigen | `apps/backoffice/lib/online-payments.ts` (`requestCash`, `cashWaiting`, `confirmCash`) |
| Gast: `POST /api/public/payments` met `method: 'contant'` | `apps/backoffice/app/api/public/payments/route.ts` |
| Werkplek Winkel: `GET`/`POST /api/werkplek/contant` | `apps/backoffice/app/api/werkplek/contant/route.ts` |
| QR-code | `apps/backoffice/app/api/public/qr/route.ts` (pakket `qrcode`) |

## Etiketprijs: klant voert de prijs in (wens eigenaar 5 november 2026)

Voor producten waarvan de prijs per stuk verschilt, zoals rundvlees, staat het bedrag op het etiket.

- **Instellen:** Gerechten & prijzen → product → Voorraad & prijsadvies → „Klant voert de prijs in”. De productprijs is dan een richtprijs („ca. € 18,00”).
- **Zelfservicekassa:** de klant tikt het product aan en typt de prijs van het etiket in (per stuk, incl. btw). Zonder bedrag kan het niet in het mandje. In het mandje en op de bon staat „prijs van het etiket”.
- **Medewerkerskassa:** het keuzevenster vraagt de medewerker om de prijs van het etiket.
- **Website:** het product staat erbij met „in de winkel”, maar is online niet te bestellen of vooraf te bestellen.
- **Grenzen:** geen (besluit eigenaar). Alleen een vangnet tegen tikfouten: meer dan € 1.000 per stuk wordt geweigerd.
- **Server:** `buildLine` (`lib/orders.ts`) gebruikt het bedrag alleen bij een product met `customerPrice`; bij een gewoon product wordt een meegestuurd bedrag geweigerd. Van de website wordt het alleen aangenomen bij een winkelbestelling die nu in de winkel betaald wordt (`lib/public-orders.ts`); anders genegeerd.

**Tests**
- `tests/etiketprijs.browser.mjs`: bedrag invullen bij de zelfservicekassa en meesturen; online „in de winkel”.
- `apps/backoffice/tests/orders.test.mjs`, `public-orders.test.mjs`, `public-products.test.mjs`: rekenwerk en controles.
- `tests/zelfservice.browser.mjs`: alleen winkel, niet contant, QR naar de betaalpagina, betalen met saldo of iDEAL op de telefoon, sticker-link en weer leeg.
- `tests/etiketten-reeks.browser.mjs`: drie etiketten achter elkaar, één opnieuw, alles in één keer op de bon.
- `tests/betalen.integration.mjs`: contant pas na bevestiging betaald, niet dubbel bevestigen, QR alleen voor Mollie; een tabletbestelling betalen met saldo (één keer, niet naast een lopende iDEAL-betaling).

## Zelfkassa-knop op de ledenpagina (wens eigenaar 7 november 2026)

Bovenaan de ledenpagina staat altijd de knop **🧺 Zelfkassa · boodschappen doen**, „zo kan iedereen makkelijk boodschappen doen”. De knop opent het winkelmandje van de bestelpagina (`bestellen.html?winkel=1`). Dat is dezelfde pagina als voor gasten, dus het lid krijgt geen toegang tot de backoffice of de werkplek.

De eerste keer koppelt de knop deze telefoon aan het lid (`lidkoppeling`, alleen de sha-256 wordt bewaard). Het BB-tegoed hoort zo bij de telefoon van het lid, en het lid betaalt met **Met je BB-tegoed**: eerst het Bloei-dividend, daarna BB tegen de waarde bij Boerderijrecreatie. Daarna onthoudt de ledenpagina op die telefoon dat hij gekoppeld is (alleen een vlag, geen geheim). Route: `POST /api/deelnemer/<link>/lid` met `{action:'zelfkassa',linked}`.
