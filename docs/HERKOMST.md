# Herkomst: wat er uit Boer Bart is meegenomen

Op 19 november 2026 is dit systeem gestart als kopie van de code van de Boer Bart-backoffice (commit `4d793fe` van
`main`). Alleen de code is gekopieerd: geen gegevens, geen klanten, geen mail, geen sleutels en geen Git-geschiedenis.

## Meegenomen

Producten en prijzen, kassa en werkplekken (keuken, barista, winkel, opnemen aan tafel, voorraad), zelfkassa, zelfscan en
QR-stickers, etiket lezen met Claude, inkoop en voorraad, facturen uit de mail, agenda en reserveringen, gesprekken met gasten
(Gmail, WhatsApp, Messenger, Instagram) met kennisbank, offertes en groepsaanvragen, gezamenlijke rekeningen, online betalen
(Mollie en bunq-betaalverzoek), bonprinters, pushmeldingen, toegang met rollen en onderdelen, de Backoffice-assistent en de
Weekassistent, de managementapp, website-inhoud en privacybeleid, de GitHub-controles en de werkafspraken.

## Niet meegenomen

- **De coöperatie:** Bloei en de Bloeimarkt, leden (A, B en C), participaties en obligaties, BB-tegoed, dividend en rente,
  potten en rollen per pot, ledenplanning en winkeldiensten, overleg en lidafspraken, de ledenapp, de bankverdeling en de
  bonvraag.
- **Producten van Boer Bart:** Ite (tafels en avonden), oogstabonnementen, het leveranciersabonnement.
- **De publieke site van Boer Bart** (`website-fab`), met zijn pagina's en verhalen. De website is nu een eenvoudige
  voorpagina met bestellen en zelfscan.
- **Het planbord** en de ontwikkelomgeving van de Chromebook.
- **Alle gegevens:** adressen, mailadressen, IBAN, KvK, logo, spreadsheet- en Drive-ID's en het Google Sheets-script van
  Boer Bart. Waar een standaardwaarde nodig is, staat nu een voorbeeld (`example.nl`) of moet je hem zelf invullen.

## Nog zichtbaar van Boer Bart (volgende stappen)

- **Werknaam.** De naam „Boerderijrecreatie” staat waar eerst „Boer Bart” stond. Vervang hem door de echte naam van het
  bedrijf waar dat nodig is.
- **Planning.** De activiteiten „Ite” en „speelboerderij” zitten nog in de agenda en openingstijden (`lib/guest-core.ts`,
  `lib/availability.ts`). Pas ze aan naar wat dit bedrijf aanbiedt.
- **Technische namen.** Namen als `x-boer-bart-role`, `__boerBart…` en de cookie- en opslagnamen met `bb` zijn technisch en
  werken gewoon; hernoemen hoeft niet.
- **Commentaar.** Commentaar met „wens eigenaar” en een datum vóór 19 november 2026 gaat over Boer Bart.
