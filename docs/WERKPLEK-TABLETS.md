> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Werkplektablets koppelen met een QR-code

**Besluit eigenaar, 6 november 2026** (in [Inloggen bij livegang](INLOGGEN-BIJ-LIVEGANG.md), „Volgende stappen”). Gebouwd op 9 november 2026, als stap 1 naar echt afrekenen aan de kassa.

**Waarom:** zonder koppeling moest op elke kassatablet een eigenaar inloggen, en die tablet had dan alle rechten van een eigenaar.

## Zo koppel je een tablet

1. **Backoffice → Systeem → Toegang → Werkplektablets.**
   - Geef de tablet een naam, bijvoorbeeld „Kassa koffiebar”.
   - Kies **Tablet koppelen**. De backoffice vraagt eventueel opnieuw je Authenticator-code.
2. **Scan de QR-code met de camera van de tablet**, of **typ de korte code** (zie hieronder).
   - De code werkt **één keer** en **10 minuten**.
   - **Geen camera** (wens eigenaar 15 november 2026, bijvoorbeeld de Unitouch-schermen U-2260): open op het scherm het
     werkstation-adres (werkstation.example.nl; een scherm dat nog niet gekoppeld is, komt vanzelf op het koppelscherm) en typ
     de koppelcode die onder de QR-code staat, bijvoorbeeld `WCGK-X4JK`. Klein, met of zonder streepje mag.
3. **Druk op de tablet op „Deze tablet koppelen”.**
   - De tablet opent de kassa (`/werkplek/kassa`).
   - Via de balk of door te vegen ga je naar kok, barista, winkel, opnemen, voorraad en team. Wisselen laadt de pagina helemaal opnieuw (15 november 2026), zodat trage schermen de kleuren niet half overtekenen.
4. **Zet het scherm op het startscherm**, zoals eerder: de werkplek-app.

## Wat een gekoppelde tablet wel en niet kan

**Wel:**
- de werkplekschermen: `/werkplek/…` en `/opnemen`;
- de gegevens die deze schermen nodig hebben: bestellingen, uitgifte, afrekenen (contant, pin, QR), voorraad, producten, tafels, wie er is en de dagplanning.

**Niet:**
- het backofficemenu;
- leden en Bloei;
- financiën en de bank;
- toegang, koppelingen en proefgegevens.

Ook als iemand een adres zelf intypt, blijft de rest dicht. De tablet heeft geen Authenticator-code, dus gevoelige handelingen kunnen er nooit.

**Wie het deed:** bij bestellingen en afrekenen staat „tablet <naam>”.

## Ontkoppelen

- **Tablet kwijt of weg:** kies bij Werkplektablets **Ontkoppelen**. Binnen een uur werkt de tablet niet meer, ook als hij aan blijft staan.
- **Daarna:** de tablet toont „Deze tablet is niet (meer) gekoppeld”. Opnieuw koppelen kan met een nieuwe QR-code.

## Hoe het werkt

| Onderdeel | Waar |
| --- | --- |
| Regels, de werkplekpas en welke adressen mogen (zonder database, ook in de proxy) | `apps/backoffice/lib/werkplek-pas-core.ts` |
| Koppelen, vernieuwen, ontkoppelen | `apps/backoffice/lib/werkplek-pas.ts` |
| Tabellen | `workplace_devices`, `workplace_pairings` (migratie `0058_werkplektablets`, met RLS) |
| Beheer | `app/toegang/tablets.tsx`, `app/api/toegang/tablets` (alleen eigenaar; gevoelige handeling, vastgelegd) |
| Tablet | `app/tablet/koppelen` (scherm), `app/auth/werkplek/koppelen` (code inwisselen), `app/auth/werkplek/vernieuw` |
| Controle per verzoek | `proxy.ts`, na de gewone backoffice-sessie |

**Twee cookies op de tablet:**
- `bb_werkplek_pas`: het geheime apparaatbewijs, 400 dagen geldig. In de database staat alleen de sha-256 ervan.
- `bb_werkplek`: een ondertekende werkplekpas van 60 minuten. De werkplekschermen vernieuwen die elke 10 minuten, en als het scherm weer zichtbaar wordt, met het apparaatbewijs (`app/werkplek-vernieuwen.tsx`).

**Na de nacht:** is de pas verlopen, dan haalt de tablet bij het openen eerst een nieuwe pas en gaat dan terug naar het scherm. Een ontkoppeld apparaat krijgt geen nieuwe pas meer.

**De QR-code:**
- De code staat achter het `#`-teken in het adres, dus nooit in een serverlogboek.
- Hij wordt pas ingewisseld als iemand op de knop drukt (POST). Een voorvertoning of virusscanner kan hem dus niet „opmaken”.
- In de database staat alleen de hash van de code.

**Een echte backoffice-login gaat voor:** logt een eigenaar op de tablet in, dan geldt diens sessie.

**Tests:** `apps/backoffice/tests/werkplek-tablets.test.mjs`.

## Korte koppelcode (15 november 2026)

De koppelcode is nu 8 tekens uit 31 (geen 0/O en 1/I/L, die je verwisselt), zowel in de QR-code als om te typen. Ze werkt één
keer en 10 minuten (was 2 minuten, om typen mogelijk te maken). Raden is kansloos: 31^8 ≈ 8,5·10^11 mogelijkheden, en het inwisselen
heeft een rem van 30 pogingen per minuut. Alleen de sha-256 van de code staat in de database. Oude lange codes uit een eerdere
QR-code worden nog geaccepteerd zolang ze geldig zijn.

Code: `newPairCode`, `normalizePairCode` en `showPairCode` in `lib/werkplek-pas-core.ts`; `redeemPairing` in `lib/werkplek-pas.ts`;
het invoerveld in `app/tablet/koppelen/page.tsx`; de code onder de QR-code in `app/toegang/tablets.tsx`.
