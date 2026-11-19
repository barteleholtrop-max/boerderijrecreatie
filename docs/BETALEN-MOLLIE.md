> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Online betalen via Mollie (stap 2 van de bestelpagina)

**Besluit eigenaar, 3 november 2026 (keuze E):** gasten betalen online via Mollie. Het account bestaat al. Mollie betaalt uit op de bunq-rekening; bunq blijft de bank.
**Stand (bijgewerkt 10 november 2026):** live betalen kan.
- **Cloud Run:** `MOLLIE_LIVE_ENABLED=1` en `MOLLIE_WEBHOOK_ORIGIN` staan aan (9 november 2026).
- **Welke modus:** dat bepaalt de sleutel bij Systeem & koppelingen → Mollie. Een `live_`-sleutel betekent echt geld, een `test_`-sleutel de testmodus.
- **In de schermen:** de backoffice laat zelf zien wat er geldt (onderin het menu, op de kassa en bij Financiën) via `/api/omgeving`.
- **Als Mollie weigert:** bijvoorbeeld bij een account dat (nog) niet is vrijgegeven.
  - De gast ziet: „Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.”
  - De kassa ziet daarnaast de tekst van Mollie zelf.
  - Die tekst staat ook in het logboek van Cloud Run (`[mollie]`).
- **Op het bankafschrift:** de omschrijving begint met „Boerderijrecreatie”, zonder speciale tekens, bijvoorbeeld `Boerderijrecreatie bestelling P00054`. De naam van de ontvanger komt uit het websiteprofiel in Mollie.
**Planbord:** beslissing `2026-11-03-betalen-mollie`, bij „Online bestellen” en „Afrekenstap vanuit de winkelmand”.

## Zo werkt het voor de gast

1. De gast kiest op de bestelpagina en drukt op **Bestelling plaatsen**. De backoffice rekent alles opnieuw uit en legt de bestelling vast met de status *wacht op betaling*.
2. De bestelpagina stuurt de gast meteen door naar de betaalpagina van Mollie (iDEAL, kaart, Apple Pay: wat in Mollie aanstaat).
3. Na het betalen komt de gast terug op de bestelpagina. Die vraagt de stand op en toont **Betaald!** met het bestelnummer.
4. Pas dan verschijnt de bestelling bij keuken, koffiebar of winkel (Bestellingen & uitgifte).

Lukt het betalen niet of breekt de gast af, dan blijft de bestelling *wacht op betaling* en kan de gast op **Opnieuw betalen** drukken. Per bestelling kan dat maximaal 5 keer.

## Wat de backoffice controleert

- **Betaald geldt alleen als Mollie het zelf zegt.** De backoffice haalt elke betaling zelf op bij Mollie. Een melding (webhook) of een terugkeer naar de pagina is alleen een aanleiding om te kijken. Bedrag, valuta, test/live en het kenmerk moeten precies kloppen. Klopt er iets niet, dan blijft de bestelling onbetaald.
- **Niets dubbel.** Twee keer op betalen drukken geeft dezelfde betaalpagina. Dezelfde melding nog eens verandert niets. De bestelling komt één keer bij de werkplek.
- **Gegevens.** Elke betaalpoging is een regel in de bestaande tabel `payments` (provider `mollie-test` of `mollie-live`, kenmerk `tr_…`). Er is geen nieuwe tabel of migratie. Betaalregel en bestelling worden samen bijgewerkt.
- **Wat de gast ziet.** Alleen de bon en de betaalstand. Geen kenmerken van Mollie, werkplekken of andere interne gegevens.

## Instellen (testmodus)

1. Log in op het Mollie-dashboard → **Ontwikkelaars → API-sleutels** en kopieer de **testsleutel** (begint met `test_`).
2. Open in de backoffice **Systeem & koppelingen → Mollie** en plak de sleutel. Hij wordt versleuteld opgeslagen en is daarna niet meer leesbaar.
3. Bestel op de bestelpagina en betaal in de testomgeving van Mollie. Kies daar de uitkomst: betaald, mislukt of geannuleerd.

Een live-sleutel (`live_…`) wordt geweigerd zolang de server niet `MOLLIE_LIVE_ENABLED=1` heeft. Dat zetten we pas aan bij publiceren.

### Melding van Mollie (webhook)

Mollie kan alleen een openbaar https-adres bereiken.

- **In de telefoonstand** (`./boerbart-test --telefoon`) gebruikt de backoffice daarvoor het tijdelijke Cloudflare-adres.
- **Op de eigen computer** (localhost) is er geen melding. De bestelpagina vraagt de stand op bij terugkomst; dat is genoeg om te testen.
- **Na publiceren** zet je `MOLLIE_WEBHOOK_ORIGIN` op het vaste adres van de backoffice.

## Techniek

| Onderdeel | Waar |
| --- | --- |
| Mollie-API (aanmaken, ophalen, controles) | `apps/backoffice/lib/mollie.ts` |
| Betalen starten, stand verwerken, bestelling vrijgeven | `apps/backoffice/lib/online-payments.ts` |
| Gast: starten en stand (`POST`/`GET /api/public/payments`) | `apps/backoffice/app/api/public/payments/route.ts` |
| Melding van Mollie (`POST /api/public/payments/mollie`) | `apps/backoffice/app/api/public/payments/mollie/route.ts` |
| Bestelpagina: doorsturen en terugkomst | `apps/website/bestellen.js` |

## Testen

- `apps/backoffice/tests/mollie.test.mjs` test de regels: sleutels, bedragen, statussen, controles en de terugweg.
- `npm run test:betalen` draait de volledige keten tegen de gebouwde backoffice en een nagebootste Mollie (`tests/mollie-mock.mjs`). Daarin zitten:
  - starten en dubbel klikken;
  - een nagemaakte melding;
  - afbreken en opnieuw betalen;
  - betaald via een melding en via de terugkomst;
  - een verkeerd bedrag.

  GitHub draait deze test bij elke wijziging.
- `tests/bestellen.browser.mjs` controleert de bestelpagina: zonder sleutel, en terug van Mollie.

## Nog niet gebouwd

- **Terugbetalen.** Dat doe je voorlopig in het Mollie-dashboard; de backoffice ziet dat nog niet.
- **Ite-reserveringen.** Die betalen nog niet via Mollie. De kassa wel (QR), zie `KASSA-AFREKENEN.md`.
- **Live betalen.** Pas bij publiceren, met apart akkoord.

## Eigen bedrag en groepsrekening (3 november 2026)

- Koos de gast een eigen bedrag („Wat is het je waard?”), dan is dát het bedrag bij Mollie, en geldt de bestelling als betaald zodra dat bedrag binnen is (`amountDue` in `lib/online-payments.ts`).
- Bij € 0,00 wordt er geen betaling aangemaakt; de bestelling gaat meteen door (betaalstatus `nul-bedrag`).
- Een bestelling op een groepsrekening (groepscode) wordt nooit bij Mollie afgerekend: de gastheer betaalt achteraf. Zie [BESTELPAGINA.md](BESTELPAGINA.md).

## Evenementen online betalen (3 november 2026)

**Besluit eigenaar, 3 november 2026:** „Ja evenementen ook via mollie laten betalen.” Ook dit staat in testmodus. Er gaat geen echt geld om totdat live bij publiceren aangaat.

**Voor de gast**
1. De gast meldt zich op de website aan voor een betaald evenement en drukt op **Aanmelden en betalen**.
2. De backoffice legt de aanmelding vast en houdt de plaats **60 minuten** vast.
3. De website stuurt de gast door naar de betaalpagina van Mollie, met het bedrag uit de backoffice (prijs × personen op het moment van aanmelden).
4. Na het betalen komt de gast terug op de agenda (`?aanmelding=…`). De website toont dan **Je hebt betaald, je plek staat vast**, of anders **Nog niet betaald**, met **Opnieuw betalen**.
5. De bevestigingsmail gaat pas **na** de betaling, met „Je hebt online betaald”.

**Voor het team (Planning)**
- Per evenement staat **Gasten betalen bij het aanmelden online (Mollie)**. Dit staat standaard aan bij een prijs.
- Zet je het uit, dan geldt de betaalinstructie, bijvoorbeeld betalen ter plekke, en vink je zelf **betaald** aan.
- Bij elke aanmelding zie je de stand:
  - *wacht op online betaling tot 14:35*;
  - *online betaald (test)*;
  - *niet online betaald · plaats vrijgegeven*.
- Staat Mollie niet aan, dan valt een betaald evenement vanzelf terug op de betaalinstructie.

**Regels**
- **Plaats vasthouden.** Een onbetaalde online aanmelding telt 60 minuten mee voor het maximum en daarna niet meer.
  - Wie later toch wil betalen, kan dat alleen als er dan nog plaats is. Dat wordt in de database zelf gecontroleerd.
  - Een betaalde aanmelding telt altijd mee, ook als de betaling binnenkomt nadat de 60 minuten voorbij zijn. In dat zeldzame geval kan het evenement één aanmelding te vol raken.
- **Terugzetten door het team** maakt een aanmelding weer gewoon meetellend.
- **Zelfde controles als bij bestellingen.** De stand komt altijd van Mollie zelf, met een vast kenmerk per poging. Per aanmelding kan maximaal 5 keer betaald worden, en dezelfde melding nog eens verandert niets.
- **Gegevens.** Elke betaalpoging is een regel in de nieuwe tabel `signup_payments`. De vasthoudtijd staat in `event_signups.hold_until`, via migratie `0019_evenement_online_betalen` (alleen toevoegingen).
- **Openbare paden.** Er komt geen nieuwe openbare route bij. De bestaande `POST /api/public/payments` met `{aanmelding,page}` en `GET /api/public/payments?aanmelding=…` worden gebruikt, en de melding van Mollie komt binnen op dezelfde `/api/public/payments/mollie`.
- **Code.**
  - `apps/backoffice/lib/signup-payments.ts` is nieuw.
  - Regels in `lib/event-signups-core.ts`: `paysOnline`, `holdsPlace` en `HOLD_MINUTES`.
  - Opslag in `lib/event-signups.ts`: `markPaidOnline` en `renewHold`.
- **Testen.** `npm run test:betalen` (scenario „betaald evenement”) en `apps/backoffice/tests/event-signups.test.mjs`.
- **Nog niet gebouwd.** Terugbetalen bij afmelden doe je voorlopig in het Mollie-dashboard.
