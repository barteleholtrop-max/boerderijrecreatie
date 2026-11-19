> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Klantgesprekken — Gmail en Google Agenda in Gesprekken

**Status:** gebouwd en getest tegen een gesimuleerde Gmail en Google Agenda (2 en 3 november 2026). **Nog niet live gekoppeld:** de Google-configuratie hieronder moet eerst worden ingesteld. Testgegevens zijn geen werkende livekoppeling.
**Backoffice:** Overzicht → **Gesprekken & klanten** (`/gesprekken`). Dit is de enige inbox: klantmail en websitechats staan hier samen.
**Planbord:** onderwerp „Klantgesprekken — Gmail-koppeling in Gesprekken (TODO Klanten)” in de groep Klanten & contact.

## Eén inbox (besluit eigenaar, 3 november 2026)

Er waren twee versies gebouwd: de gastcontact-werkplek van Codex (`/gesprekken`, PR #31) en een losse Gmail-pagina (`/klantgesprekken`, PR #30). Ze zijn samengevoegd tot één inbox op `/gesprekken`:

| Onderdeel | Herkomst |
| --- | --- |
| Gmail-koppeling | Uit #30: labelfilter, server-side OAuth, beperkte rechten, synchronisatie op de achtergrond, live lezen, concepten, de controle vlak voor verzenden en één verzending per concept |
| Werkplek | Uit #31: toewijzing aan een medewerker, klantenkaarten, aanvragen en reserveringen via Planning, AI-voorstel op verzoek, websitechats en rechten per medewerker |
| Sleutels | Op de centrale plek: Systeem & koppelingen → Gmail |

`/klantgesprekken` bestaat niet meer; die pagina heeft nooit in `main` gestaan.

**WhatsApp, Messenger en Instagram** (akkoord eigenaar 9 november 2026) staan in dezelfde inbox, met een filter per kanaal. Zie [WhatsApp, Messenger en Instagram](WHATSAPP-META.md).

## Overstap naar info@example.nl en meldingen in de app (besluit eigenaar, 9 november 2026)

Al het gastcontact gaat via een eigen Workspace-account **info@example.nl**, alleen in de backoffice. De backoffice-assistent is de enige mailassistent voor gasten; de ChatGPT-taak in sanne@ stopt met gastmail. Het overstapplan staat in Claude Docs („Overstapplan: gastmail naar info@example.nl”).

| Stap | Wie | Hoe |
| --- | --- | --- |
| Mailbox | Jan | Systeem & koppelingen → Gmail → **Mailbox voor klantgesprekken**: `info@example.nl`, daarna **Google koppelen** als info@. |
| Alle mail tonen | Jan | **Gmail-label voor klantgesprekken**: `INBOX`. Dan staat elk gesprek uit de inbox van info@ in Gesprekken, zonder label TODO Klanten. Gearchiveerd in Gmail = uit de lijst. |
| Agenda's | Jan | Bij Agenda's de agenda's van info@ de rol Klanten-agenda en Evenementen-agenda geven. |
| Meldingen | Sanne en Jan | In Gesprekken op **Meldingen aanzetten** tikken, op de telefoon of tablet waar de backoffice-app op staat. |

**Sinds 11 november 2026 is info@example.nl de standaard** (bevestigd door de eigenaar). Zonder ingevulde mailbox gebruikt de backoffice info@ met het label TODO Klanten. sanne@ is niet meer gekoppeld. Alle mail aan gasten (antwoorden, bevestigingen, offertes en de factuurmail met betaallink van de gezamenlijke rekening) gaat vanaf info@.

Herstel op dezelfde dag: online keek het werkproces en de website buiten de opgeslagen instellingen naar de standaardmailbox (toen nog sanne@). Daardoor liep de Gmail-ronde voor info@ niet en beloofde de website geen bevestigingsmail. Die controles gebruiken nu de instellingen van Systeem & koppelingen.

### Meldingen in de backoffice-app

- **Wanneer:** bij een nieuw bericht van een gast in de mailbox (niet bij ons eigen antwoord, niet bij automatische mail en niet bij de eerste volledige synchronisatie), bij een nieuwe aanvraag voor groepen en feesten via de website, en bij een nieuwe reservering voor Ite via de website.
- **Wie:** iedereen die meldingen aanzette én toegang heeft tot de klantgesprekken (`GUEST_ACCESS`). Wie die toegang verliest, krijgt niets meer.
- **Tikken** opent het gesprek in Gesprekken, of Reserveringen bij Ite.
- **Hoe snel:** mail wordt elke 5 minuten opgehaald door het werkproces (online: Cloud Scheduler op `/api/werkproces/ronde`). Een aanvraag via de website gaat via dezelfde wachtrij, dus binnen een paar minuten.
- **Telefoon:** Android werkt direct. Op een iPhone eerst de backoffice op het beginscherm zetten en van daaruit openen.
- **Online:** de sleutels `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en `VAPID_SUBJECT` moeten in Cloud Run staan (zie [Cloud Run](CLOUD-RUN.md)); anders maakt elke server eigen sleutels en vallen aanmeldingen weg.
- **Code:** `lib/staff-push-core.ts` (regels en teksten), `lib/staff-push.ts` (aanmelden en versturen), `app/api/meldingen` (aan en uit), `public/backoffice-sw.js` (tonen en openen), `app/gesprekken/meldingen.tsx` (knop). Tabel `staff_push` (migratie `drizzle-pg/0046_gastcontact.sql`, met beveiliging per rij).

## Wat het doet

Sanne en Jan lezen en beantwoorden klantvragen, reserveringen en boekingen uit de mailbox **sanne@example.nl**. Er is één bron: **Gmail**. Wat je in de backoffice doet, staat ook gewoon in Gmail, en omgekeerd.

| Onderwerp | Werking |
| --- | --- |
| Welke gesprekken | Alleen gesprekken met het Gmail-label **TODO Klanten**. Het label-ID wordt uit het account opgehaald; er staat geen ID in de code. Het algemene label TODO en alle andere mail blijven buiten beeld, en zijn via de backoffice ook niet op te vragen. |
| Eerste koppeling | Alle bestaande gesprekken met het klantlabel worden opgehaald, ook als het er meer dan één pagina zijn. |
| Daarna | Elke 5 minuten worden de wijzigingen opgehaald via de Gmail-history: nieuwe berichten, antwoorden die rechtstreeks uit Gmail zijn verstuurd, concepten en een verwijderd label. Dat gebeurt in de bestaande achtergrondtaak, plus de knop „Nu synchroniseren”. Is de history te oud, dan volgt automatisch een volledige synchronisatie. |
| Overzicht | Per gesprek: klant, onderwerp, datum, of er iets ongelezen is, bijlagen, een concept, de verantwoordelijke medewerker, en wie op wie wacht (**Klant wacht op ons**, **Wij wachten op klant**, **Afgehandeld**, **Nieuw bericht na afhandeling**). Websitechats staan in dezelfde lijst. Het overzicht komt uit de index van de backoffice: een paginaverversing vraagt niets aan Gmail. |
| Gesprek openen | De volledige conversatie wordt live uit Gmail gelezen: tekst, bijlagen (downloaden) en concepten. Opgemaakte mail wordt als tekst getoond, nooit als HTML. **Openen markeert niets als gelezen.** |
| Afhandeling | Status open of afgehandeld, een verantwoordelijke en een klantenkaart. Dit is backofficewerk, beveiligd met een versienummer; in Gmail verandert er niets. Schrijft de klant na afhandeling weer, dan verschijnt het gesprek als „Nieuw bericht na afhandeling”. |
| Klantenkaarten | Gmail-gesprekken tellen mee in de klantenkaarten van het gastcontact (automatisch op e-mailadres, of handmatig gekozen). Er wordt geen mailtekst naar het gastcontact gekopieerd. |
| Aanvragen | „Aanvraag / reservering beheren” opent Planning met dit gesprek al ingevuld. Een mail maakt nooit zelf een boeking; beschikbaarheid en capaciteit komen uit Planning. Een gesprek kun je ook koppelen aan een bestaande bestelling. |
| Concepten | Bestaande Gmail-concepten worden getoond en hergebruikt, ook die van de dagelijkse ChatGPT-taak. Een eenvoudig tekstconcept kun je hier bewerken; de wijziging komt in hetzelfde Gmail-concept. Een concept met opmaak of bijlagen bewerk je in Gmail. Staat er al een concept, dan maakt de backoffice geen tweede. Is een concept intussen in Gmail gewijzigd, dan zie je de nieuwe versie en is er niets overschreven. |
| AI-voorstel | Alleen als je erom vraagt; het voorstel komt in de editor en wordt niet opgeslagen of verzonden. Er is geen automatische conceptgenerator naast de dagelijkse ChatGPT-taak. Automatische berichten krijgen geen voorstel. |
| Verzenden | Met één tik op **Verzenden** bij het concept, zonder extra vraag (wens eigenaar 11 november 2026: „De extra vraag om te bevestigen hoeft niet”), vanuit de mailbox en in hetzelfde Gmail-gesprek. Vlak vóór verzenden wordt gecontroleerd of er een nieuw bericht of een gewijzigd concept is; zo ja, dan wordt er niets verzonden. Dubbelklikken, herladen, een tweede tabblad of een herhaalde aanvraag versturen niets extra. Valt de verbinding weg, dan wordt dat concept niet nogmaals verzonden tot de synchronisatie heeft vastgesteld wat er gebeurde. |
| Automatische berichten | Boekingsbevestigingen, notificaties, nieuwsbrieven en automatische antwoorden worden herkend en gemarkeerd. |
| Niets automatisch | Niets wordt gearchiveerd, verwijderd of herlabeld. De inbox en het klantlabel blijven zoals ze zijn. |

## Agenda's: meerdere agenda's, elk met een rol

> Sinds 3 november 2026 (verzoek eigenaar) staan koppelen, synchroniseren en de agendarollen bij **Systeem & koppelingen → Gmail en agenda's** (`/koppeling#gmail`). In Gesprekken staat alleen nog een statusregel met een link daarheen, zodat het gespreksscherm rustig blijft.

Na „Google koppelen” toont **Systeem & koppelingen → Gmail en agenda's** onder **Agenda's** de agenda's van het account waarin geschreven mag worden. Per agenda kies je een rol:

| Rol | Wat de backoffice erin zet |
| --- | --- |
| **Klanten-agenda** | Concept-aanvragen en geldige opties uit Planning, als voorlopig item („CONCEPT · aanvraag · …”). Een optie houdt tijd vast, een aanvraag niet. **Bevestigde afspraken zet de bestaande dagelijkse taak in de agenda.** Wordt een aanvraag bevestigd, geannuleerd of verloopt een optie, dan ruimt de backoffice zijn eigen concept op. Zo staat een afspraak er nooit dubbel in. |
| **Evenementen-agenda** | De evenementen uit Planning, zonder feestdagen en voorbeelden. |
| Niet gebruiken | Niets. |

- De backoffice is de bron; Google Agenda is de weergave.
- Elk item heeft een vast ID per agenda en wordt bijgehouden in `mail_calendar_events`. Herhaald synchroniseren maakt dus niets dubbel, en ongewijzigde items kosten geen Google-aanvraag.
- **Alleen items die de backoffice zelf maakte, worden gewijzigd of verwijderd.** Afspraken van de dagelijkse taak of van mensen blijven onaangeroerd.
- De agenda's synchroniseren elke 15 minuten, direct na een wijziging in Planning, en met de knop „Agenda's nu synchroniseren”. Fouten staan per agenda zichtbaar.
- Een agendavermelding is geen capaciteitscontrole; die doet Planning.

## Rechten

- **Google:** `gmail.readonly` (lezen), `gmail.compose` (concepten en verzenden), `calendar.events` (agenda-items) en `calendar.calendarlist.readonly` (de lijst met agenda's om uit te kiezen). Zonder `gmail.modify` **kan** de koppeling technisch niets archiveren, verwijderen, labelen of als gelezen markeren.
- **Medewerkers:**
  - Zonder `GUEST_ACCESS` mag elke backoffice-login (Jan, Sanne via `BASIC_AUTH_USER_2`) de klantmail lezen, concepten maken en verzenden.
  - Met `GUEST_ACCESS` alleen accounts met een niet-lege `mailboxes`-lijst, en verzenden alleen met `"send": true`. Bijvoorbeeld:
    ```json
    {"bart":{"mailboxes":["gmail"],"send":true,"calendar":true,"manage":true},"sanne":{"mailboxes":["gmail"],"send":true,"manage":true}}
    ```
  - Planning en chats volgen de bestaande regels van het gastcontact (`manage`).
- **Bijgehouden:** bij status, toewijzing, koppelingen, concepten en verzendingen wordt bewaard wie het deed.

## Opslag en beveiliging

- **OAuth:** volledig server-side. Het refresh token staat versleuteld (AES-GCM, met de bestaande `SHEETS_CONFIG_KEY`) in `mail_accounts`. Access tokens staan alleen in het geheugen. Tokens komen nooit in de browser, logs, Git of de koppelingsinstellingen.
- **Mailbox-controle:** bij het koppelen wordt gecontroleerd dat het account echt de ingestelde mailbox is. Een ander account wordt geweigerd en de toegang meteen ingetrokken.
- **Koppelpoging:** de state is eenmalig, 10 minuten geldig en hoort bij de login die begon.
- **Index:** alleen metadata, geen mailteksten. Thread- en message-ID's zijn sleutels, dus er ontstaan geen dubbele records.
- **Tabellen:** `mail_accounts`, `mail_threads`, `mail_messages`, `mail_drafts`, `mail_draft_requests`, `mail_thread_state`, `mail_thread_links`, `mail_sends`, `mail_oauth_states`, `mail_calendars`, `mail_calendar_events` (migratie `0013_klantgesprekken_gmail`, alleen nieuwe tabellen).

## Wat nog ingesteld moet worden (Google-configuratie)

Dit kan alleen de beheerder van het Google Workspace-account van example.nl. Er is nog niets bij Google aangemaakt.

1. **Project.** Ga naar [console.cloud.google.com](https://console.cloud.google.com) en gebruik een bestaand project of maak er een, bijvoorbeeld „Boerderijrecreatie backoffice”.
2. **API's aanzetten.** Ga naar APIs & Services → Library en zet **Gmail API** en **Google Calendar API** aan.
3. **OAuth-toestemmingsscherm.**
   - Kies type **Intern** (alleen gebruikers van example.nl).
   - Vul een app-naam en contactadressen in.
   - Voeg de vier scopes hierboven toe.
4. **OAuth-client.** Ga naar Credentials → OAuth client ID:
   - Kies type **Webapplicatie**.
   - Voeg als redirect-URI precies `<adres van de backoffice>/api/mail/oauth/callback` toe, bijvoorbeeld `http://localhost:3001/api/mail/oauth/callback`. Elke omgeving heeft haar eigen URI nodig.
5. **Instellingen in de backoffice.** Ga naar Systeem & koppelingen → **Gmail** en vul de client-ID en het clientgeheim in. Mailbox en label zijn standaard sanne@example.nl en TODO Klanten. Dit wordt versleuteld opgeslagen; je kunt het ook in `.env.local` zetten.
6. **Label.** Controleer dat het label **TODO Klanten** in sanne@example.nl bestaat, met precies deze naam.
7. **Logins.** Geef Sanne een eigen login (`BASIC_AUTH_USER_2`). Stel eventueel `GUEST_ACCESS` in (zie Rechten).
8. **Koppelen.** Open **Systeem & koppelingen** → **Gmail en agenda's** → **Google koppelen**. Log in als **sanne@example.nl** en sta alles toe.
9. **Agenda's.** Kies op dezelfde plek onder **Agenda's** de klanten-agenda en de evenementen-agenda, bijvoorbeeld de gezamenlijke agenda `c_a8dd15980053fe5d5dfb2c9500c0fbb984f9a009479b08b8302a8b47ede021fc@group.calendar.google.com` als klanten-agenda. Het account moet in die agenda mogen schrijven.
10. **Pas daarna verzenden aanzetten.** Zet `MAIL_SEND_ENABLED=1` alleen in de omgeving waar echt verzonden mag worden, na de proef hieronder.

## Testen

**Automatisch, zonder Google en zonder echte mail.**
- `npm test` bevat de regels voor mail en agenda's (`apps/backoffice/tests/mail-core.test.mjs`, `guest-workspace.test.mjs`).
- Na `npm run build` draait `npm run test:gmail` de volledige keten tegen een gesimuleerde Gmail en Google Agenda (`tests/gmail-mock.mjs`, 19 scenario's). Daaronder vallen:
  - koppelen, een verkeerde mailbox, paginering, history en volledige synchronisatie, tijdelijke fouten en verlopen toegang;
  - concepten, de controle vóór verzenden, dubbele en onderbroken verzending;
  - rechten per medewerker, het niet lekken van tokens en mailteksten, en één inbox met Planning;
  - meerdere agenda's: concepten erin, opruimen, niets dubbel.
- GitHub voert deze test bij elke wijziging uit.

**Handmatig, na de Google-configuratie.** Verstuur geen echte klantmail tijdens het testen.
1. Koppel met `MAIL_SEND_ENABLED=0`. Controleer dat de gesprekken met TODO Klanten verschijnen en dat „laatste geslaagde synchronisatie” een tijd toont.
2. Open een gesprek en controleer in Gmail dat het nog ongelezen is als het dat was.
3. Stuur vanaf een eigen privéadres een testmail naar sanne@example.nl en geef die het label TODO Klanten. Na „Nu synchroniseren” staat hij als „Klant wacht op ons” in de lijst.
4. Maak een concept bij dat testgesprek en controleer in Gmail dat het in hetzelfde gesprek staat. Pas het daarna in Gmail aan: de backoffice moet „elders gewijzigd” melden.
5. Koppel een **test-agenda** als klanten-agenda en maak in Planning een aanvraag. Controleer dat er een CONCEPT-item verschijnt, en dat het verdwijnt als je de aanvraag annuleert.
6. Alleen voor je eigen testgesprek: zet `MAIL_SEND_ENABLED=1`, herstart en verzend. Controleer dat het antwoord één keer aankomt, in hetzelfde gesprek, en dat het label en de inbox ongewijzigd zijn.

## Bekende grenzen

- Als gelezen markeren gebeurt alleen in Gmail; daarvoor zou de bredere `gmail.modify`-scope nodig zijn.
- Eén mailbox (sanne@example.nl).
- Synchronisatie elke 5 minuten (agenda's elke 15 minuten en na wijzigingen), zonder Pub/Sub-push.
- Wijzigingen die iemand in Google Agenda zelf aanbrengt in een concept- of evenementitem van de backoffice, worden bij de volgende wijziging in Planning overschreven: de backoffice is leidend.
