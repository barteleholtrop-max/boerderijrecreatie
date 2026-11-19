> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Privacy voor alle sites

**Wens eigenaar, 15 november 2026:** „Een algemene privacypagina voor de backoffice. Dit is een pagina waar alle websites die we gaan bouwen deze regels moeten ophalen. Dit mag bij Marketing en websites.”

## De afspraak

- Er is **één privacybeleid** voor alle sites van Boerderijrecreatie. Het staat in de backoffice.
- **Elke site haalt het op** via de vaste poort `GET /api/public/v1/privacy`. Geen site heeft een eigen kopie van de tekst.
- Dit volgt de [centrale backoffice](ARCHITECTUUR-CENTRALE-BACKOFFICE.md) en [het dorp van sites](INHOUD-EN-DORP.md): één bron, één poort, alleen lezen.

## In de backoffice

**Marketing & website → Privacy · alle sites** (`/privacy`).

- Een titel, een inleiding, de datum waarop het beleid geldt („Geldt vanaf”) en de onderdelen (kop + tekst). Onderdelen kun je toevoegen, verplaatsen en weghalen.
- **Tekst:** een witregel begint een nieuwe alinea, een regel die met `## ` begint, is een tussenkop. Er gaat geen HTML mee: de site zet alles als gewone tekst neer.
- **Bedrijfsgegevens typ je niet in de tekst.** Schrijf `{bedrijfsnaam}`, `{adres}`, `{kvk}` of `{email}`. Die worden bij het ophalen ingevuld uit **Bedrijfsgegevens**. Verandert het adres of het mailadres, dan klopt het privacybeleid op alle sites vanzelf. Ontbreekt iets in Bedrijfsgegevens, dan meldt het scherm dat.
- **„Zo ziet de gast het”** toont het beleid met de gegevens ingevuld, zonder iets op te slaan.
- **Opslaan** zet het binnen twee minuten op alle sites. Er is geen concept: wat opgeslagen is, geldt.
- **Gelijktijdig werken:** heeft iemand anders het intussen opgeslagen, dan meldt het scherm dat. Er wordt niets stil overschreven.
- **Beginwaarde:** zolang er nog niets is opgeslagen, tonen de sites het privacybeleid dat al op de nieuwe website stond, algemeen gemaakt voor alle sites en aangevuld met online betalen (Mollie) en filmpjes (YouTube zonder volgcookies, Vimeo). Lees het na en sla het één keer op.
- **Rechten:** eigenaren, en medewerkers met het vinkje *Marketing & website*.
- **Opslag:** tabel `privacy_policy` (één rij `main`, migratie `drizzle-pg/0068_privacy.sql`, met beveiliging per rij).

## De poort

`GET /api/public/v1/privacy` — openbaar, alleen lezen, geen login.

```json
{
  "versie": 1,
  "title": "Privacybeleid",
  "intro": [{ "type": "alinea", "text": "…" }],
  "effectiveFrom": "2026-11-15",
  "updated": "2026-11-15",
  "controller": { "name": "…", "street": "…", "postalCode": "…", "city": "…", "kvk": "…", "email": "…" },
  "sections": [{ "heading": "Welke gegevens", "blocks": [{ "type": "alinea", "text": "…" }, { "type": "kop", "text": "…" }] }]
}
```

- Het antwoord is een **contract**: velden komen erbij, maar verdwijnen of veranderen niet. Moet dat toch, dan komt er een `v2` naast `v1`.
- `controller` bevat alleen wat openbaar mag: naam, adres, KvK en het algemene e-mailadres. Geen IBAN, telefoonnummers of wie het beleid opsloeg.
- De database wordt hooguit één keer per minuut gelezen.
- Bij een storing antwoordt de poort met 503, nooit met een oude of geraden tekst.

## Een site bouwen

1. Maak een pagina Privacy (bijvoorbeeld `/privacy/`) en link ernaar in de voettekst en bij elk formulier.
2. Haal de tekst op met `GET /api/public/v1/privacy`. Controleer `versie === 1`.
3. Zet `title`, de blokken van `intro` en per onderdeel de `heading` met de blokken neer als **gewone tekst** (geen `innerHTML`). `kop` wordt een tussenkop, `alinea` een alinea (regeleinden tonen).
4. Toon onderaan „Dit privacybeleid geldt vanaf …” met `effectiveFrom`.
5. Lukt het laden niet, toon dan een korte melding met een mailadres. Zet er nooit een eigen tekst neer.

Voorbeeld: de nieuwe website (`apps/website-fab/src/content/privacy.ts` en `src/pages/Privacy.tsx`).
