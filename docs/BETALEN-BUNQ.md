> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Online betalen met een betaalverzoek van bunq

**Wens eigenaar, 10 november 2026:** Mollie gaf (nog) geen akkoord: online betalingen gaven „account suspended”, en voor een betaalterminal komen we niet in aanmerking. „Kan het ook via een betaalverzoekstructuur? Ja, laten we proberen.”

## Aanzetten (eigenaar)

1. **bunq-app → Profiel → Beveiliging → API-sleutels:** maak een sleutel aan.
2. **Backoffice → Systeem & koppelingen → bunq:** plak de sleutel.
3. **Cloud Run:** zet `BUNQ_LIVE_ENABLED=1` (voor echt geld; besluit eigenaar 6 november 2026).
4. **Financiën → Bank & verdeling:** kies welke rekening **bunq Main** is. Daar komen de betalingen binnen.
5. **Systeem & koppelingen → Mollie of bunq-betaalverzoek:** kies bij **Online betalen via** de optie **bunq-betaalverzoek**.

Onderin het menu staat daarna „Live · online betalen met echt geld”, of „Testmodus” zolang bunq in de sandbox staat.

## Zo werkt het

- **Bestelpagina:** de gast kiest „Nu betalen via een betaalverzoek” (eten en drinken gaat standaard op de eigen rekening, zie hieronder). De backoffice maakt een betaalverzoek (bunq.me) op Main, met precies het bedrag en de omschrijving `Boerderijrecreatie bestelling P00054`. De gast betaalt in de eigen bank-app en komt terug op de bestelpagina.
- **Kassa en restaurant:** bij Afrekenen → **QR (iDEAL)** staat de QR-code van het betaalverzoek op het scherm.
  - **Betaalverzoek sturen** deelt dezelfde link via WhatsApp of sms. Op een computer wordt de link gekopieerd.
  - Het scherm ziet vanzelf dat er betaald is.
- **Zelfkassa:** de QR-code werkt op dezelfde manier.
- **Op de rekening, later afrekenen:** dat blijft zoals het was. Kies „Vastleggen, later afrekenen”. Bij het afrekenen kies je contant, pin of het betaalverzoek.

## Wanneer geldt iets als betaald

- **Alleen als bunq het zelf laat zien:** bij het betaalverzoek staat een betaling van precies dit bedrag. Nooit op het woord van de gast.
- **Achtervang:** werkt bunq het verzoek nog niet bij, maar staat er op Main een bijschrijving met precies deze omschrijving en dit bedrag (na het aanmaken), dan telt dat ook.
- **Wanneer de backoffice kijkt:** bij terugkomst op de bestelpagina, elke 3 seconden op de kassa, en elke ronde van het werkproces (elke 2 minuten). Een bestelling komt dus ook in de keuken als de gast na het betalen de pagina sluit.
- **Na betalen:** het verzoek wordt gesloten, zodat niemand twee keer betaalt.
- **Verkeerd bedrag:** dat telt niet.
- **Verlopen verzoek:** die poging telt als mislukt. Een nieuwe poging krijgt een eigen omschrijving (`…-2`). Zo kan een late betaling op een oud verzoek nooit een nieuwe poging betaald maken.
- **Pogingen en dubbele betaling:** hooguit 5 pogingen per bestelling. Contant of BB kan niet terwijl er een betaalverzoek openstaat.
- **Bankverdeling:** betalingen van gasten op Main (omschrijving `Boerderijrecreatie bestelling P…`) tellen als ontvangst mee, net als de uitbetalingen van Mollie.

## Eigen en gezamenlijke rekening (11 november 2026)

Na afloop afrekenen gaat ook via een betaalverzoek: één verzoek per deel van de rekening. Bij een eigen rekening is dat één verzoek voor het hele bezoek, met het bedrag dat de gast zelf koos. De omschrijving is `Boerderijrecreatie rekening <code>` (met `deel n` als de rekening gedeeld wordt, en `-2` bij een nieuwe poging).

De regels zijn dezelfde als bij bestellingen: betaald alleen als bunq precies dit bedrag toont, met de achtervang via de bijschrijving op Main. Het werkproces kijkt open verzoeken van de laatste twee dagen na. De bankverdeling telt deze betalingen als ontvangst. Zie [Gezamenlijke rekening](GEZAMENLIJKE-REKENING.md).

## Wat (nog) via Mollie blijft

- betaalde aanmeldingen voor evenementen;
- oogstabonnementen (incasso);
- de Bloeimarkt.

Staat online betalen op bunq, dan kan een oogstabonnement niet online worden afgesloten. Voor de andere twee blijft de Mollie-sleutel nodig.

## Nog niet bevestigd

De documentatie van bunq kon tijdens het bouwen niet worden geopend. De veldnamen komen uit de bekende bunq-API (`bunqme-tab`, `bunqme_tab_entry`, `bunqme_tab_share_url`, `result_inquiries`). Daarom is er de achtervang via de bijschrijving op Main.

**Test eerst live met € 1:** betaal één bestelling en kijk of die binnen 2 minuten op **Betaald** komt.

Vraag bunq ook:
- of betaalverzoeken gebruikt mogen worden voor winkelverkoop;
- wat het per betaling kost;
- of kaartbetaling mogelijk is.

## Techniek

| Onderdeel | Waar |
| --- | --- |
| Betaalverzoek aanmaken, ophalen, sluiten | `apps/backoffice/lib/bunq.ts` (`createBunqMeTab`, `getBunqMeTab`, `cancelBunqMeTab`) |
| Keuze, starten, stand verwerken | `apps/backoffice/lib/online-payments.ts` (`onlineVia`, `startBunqPayment`, `applyBunq`, `refreshOpenBunqPayments`) |
| Werkproces | `apps/backoffice/lib/assistant-jobs.ts` (`online-betalingen`) |
| Bankverdeling | `apps/backoffice/lib/bank-split-core.ts` (`isGuestInflow`) |
| Tests | `apps/backoffice/tests/bunq-betaalverzoek.test.mjs`, met de nagebootste bunq in `tests/helpers/bunq-mock.mjs` |
