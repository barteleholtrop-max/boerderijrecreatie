> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# WhatsApp, Messenger en Instagram in Gesprekken

**Akkoord eigenaar:** 9 november 2026. De keuzes van die dag:
- het zakelijke WhatsApp-nummer zelf;
- ~~1 maand oude gesprekken ophalen~~ (vervallen, zie hieronder);
- alles voor altijd bewaren bij de klantenkaart;
- akkoord met betaalde sjablonen;
- Messenger en Instagram meteen mee, maar alleen privéberichten en geen reacties onder berichten.

**Gewijzigd besluit (eigenaar, 9 november 2026):** „we hebben het liefst alles via de app, dus dan maar helemaal naar de backoffice.” Het WhatsApp-nummer gaat **volledig naar de backoffice**. De WhatsApp Business-app op de telefoon stopt voor dit nummer; alle gesprekken met gasten lopen via de backoffice-app. Daardoor vervalt de regel „app eens per 13 dagen openen”, maar komen de oude gesprekken uit de app **niet** mee (Meta haalt die alleen op als de app blijft meedoen).

**Status (11 november 2026):**
- Meta-app **Boerderijrecreatie Backoffice** staat live (gepubliceerd), met de gebruiksscenario's WhatsApp, Messenger en Instagram (Instagram via *API setup with Facebook login*).
- **Messenger** werkt: pagina **Boerderijrecreatie** (ID 762165914159469, de pagina met de veldfoto) is geabonneerd op `messages` en `message_echoes`; berichten komen binnen in Gesprekken.
- **Instagram** werkt: webhook-object Instagram, veld `messages`; DM's komen binnen in Gesprekken.
- **Antwoorden** staat aan op Cloud Run (`META_SEND_ENABLED=1`).
- **Bedrijfsverificatie:** rond (bedrijfsportfolio **Boerderijrecreatie 2023**, ID 358232751396446).
- **WhatsApp** werkt volledig sinds 18 november 2026: ontvangen sinds 13 november, versturen sinds 18 november. Versturen gaf tot dan **code 10/2593181** („geen toestemming om berichten te versturen namens dit WhatsApp Business-account”). De oorzaak was de **kredietlijn van 360dialog**, die nog als standaard-betaalmethode aan het account hing. Nadat 360Messenger was opgezegd, verdween de kredietlijn. Toen de eigen **MasterCard** de standaard werd (Facturen en betalingen → Berichtenaccounts → Boerderijrecreatie), werkte versturen meteen.
- **Nog niet:** App Review. Tot die is goedgekeurd laat Meta alleen berichten door van accounts die een rol in de app hebben. Gewone klanten komen pas daarna binnen via Messenger en Instagram. Bij WhatsApp geldt dit niet.

### Stand WhatsApp-nummer (13 november 2026)

- Nummer **+31 6 21368255**. Het account in de WhatsApp Business-app is verwijderd en het nummer is bevestigd met de simkaart.
- In de app **Boerderijrecreatie Backoffice** (Step 2. Production setup) staat het nummer met **telefoonnummer-ID 668895899630515**, onder het WhatsApp-account (berichtenaccount) **Boerderijrecreatie, ID 992375692875046**. Deze twee ID's horen in de backoffice.
- Dat account is ooit via **360Messenger / 360dialog** aangemaakt (voor een WhatsApp-dienst via Wix): betaalmethode „Kredietlijn 360dialog GmbH”. Zolang die partner eraan hangt, staat bij het nummer „Number registration and webhook subscription are unavailable for this account”. De dienst bij 360Messenger is opgezegd en via een helpticket is gevraagd het nummer vrij te geven (13 november 2026). De WhatsApp-dienst via Wix stopt daarmee.
- Er bestaan nog twee andere WhatsApp-accounts in hetzelfde portfolio: **Boerderijrecreatie, ID 663854316391939** (met een losse, niet-aangemelde vermelding van hetzelfde nummer, ID 657605990763491) en het **Test Messaging Account** van Meta (1142478395179292). Die worden niet gebruikt; de sleutel van backoffice kan 663854316391939 ook niet lezen.
- **Na de vrijgave door 360dialog:**
  1. Eigen betaalmethode op account 992375692875046 (Bedrijfsinstellingen → Berichtenaccounts → Betalingsinstellingen) en 360dialog weg bij **Partners**.
  2. Systeemgebruiker **backoffice** volledige controle op 992375692875046.
  3. Boerderijrecreatie Backoffice → Step 2: **Register** (pincode van 6 cijfers, goed bewaren) en **Subscribe webhooks** aan.
  4. Backoffice → Systeem & koppelingen: telefoonnummer-ID 668895899630515, account-ID 992375692875046, opslaan, **Koppeling controleren bij Meta**.
  5. Proefbericht vanaf een andere telefoon.
- **Let op bij de sleutel:** de toegangssleutel is van de systeemgebruiker **backoffice** voor de app **Boerderijrecreatie Backoffice**. Een nieuwe sleutel moet door een tweede beheerder (Sanne) worden goedgekeurd bij Bedrijfsinstellingen → Verzoeken. In de Graph API Explorer hoort de sleutel in het veld Access Token, het adres in de balk erboven.

**Backoffice:**
- **Gesprekken & klanten** (`/gesprekken`): WhatsApp, Messenger en Instagram staan in dezelfde lijst als de mail en de websitechats. Bovenaan kies je een kanaal.
- Instellen: **Systeem & koppelingen → WhatsApp, Messenger en Instagram**. Op dezelfde pagina zie je de stand onder **WhatsApp, Messenger en Instagram · stand**.

## Waar vind je het

- **Gesprekken (telefoon)** in het linkermenu, bij de Weekassistent (`/gesprekken/telefoon`): alle gesprekken in de uitstraling van het goedgekeurde telefoonontwerp. Mail, WhatsApp, Messenger en Instagram open je daar schermvullend; een websitechat opent in het volledige scherm. Een melding op de telefoon opent het gesprek hier.
- **Gesprekken & klanten** (`/gesprekken`): dezelfde lijst in dezelfde uitstraling, met het gesprek ernaast, plus klanten en de kennisbank.

## Managerapp en gesprek voor een lid (10 november 2026)

- **App Gesprekken** (eigen icoon GESPREKKEN op het beginscherm, start op `/gesprekken/telefoon`): onderin Gesprekken, Assistent (het weekgesprek van deze week), Boodschappen, Agenda (`/planning/telefoon`) en terug naar de Backoffice. Zonder het backofficemenu.
- **Altijd ingelogd:** na één keer inloggen kies je **Ingelogd houden**; daarna blijft de app op die telefoon ingelogd ([Managerapp op de telefoon](MANAGERAPP-TELEFOON.md)).
- **Toegang:** alleen wie bij **Toegang** het vinkje **Managerapp (telefoon)** heeft (een eigenaar altijd). Een werkplekaccount (barista, kok, winkel) komt er niet in; de werkplekschermen linken er niet heen.
- **Voor lid:** bij elk gesprek kies je een lid („dit gesprek is voor Pieter”). Het lid krijgt een melding en een bericht in de ledenapp, ziet het gesprek onder **Gesprekken** en antwoordt zelf (WhatsApp, Messenger, Instagram binnen 24 uur, of mail). Sanne en Jan zien alles mee en krijgen een melding als het lid heeft geantwoord. Regels: `lib/gesprek-lid.ts`; tabel `conversation_members` (migratie `0057_gesprek_lid`).

## Wat het doet

| Onderwerp | Werking |
| --- | --- |
| Binnenkomen | Meta stuurt elk nieuw bericht meteen naar de backoffice: de webhook op `/api/public/meta`. Er zit geen klok of ophaalronde tussen. |
| Melding | Sanne en Jan krijgen een melding op de telefoon, net als bij nieuwe mail ([meldingen](KLANTGESPREKKEN-GMAIL.md#meldingen-in-de-backoffice-app)). Tikken opent het gesprek. |
| De app op de telefoon | Stopt voor dit nummer. Alles gaat via de backoffice-app: lezen, antwoorden en meldingen. |
| Oude gesprekken | Komen niet mee uit de WhatsApp Business-app. Exporteer belangrijke gesprekken vóór de overstap (stap 3). Vanaf de overstap blijft alles bewaard in de backoffice. |
| Bewaren | Alle berichten blijven bewaard. Een gesprek koppel je aan een klantenkaart (of je maakt er een), en daarna staat het daar voor altijd. Heeft precies één klantenkaart hetzelfde telefoonnummer, dan stelt de backoffice die voor. Koppelen doe je zelf. |
| Lezen | Het gesprek als chat, met foto's, spraakberichten (afspelen), video en documenten. De backoffice haalt die bijlagen zelf op bij Meta. Openen verandert niets bij de klant: geen blauwe vinkjes. |
| Afhandeling | Toewijzen, Afgehandeld of Weer openen, en Aanvraag in Planning, net als bij mail. Schrijft de klant na afhandeling opnieuw, dan staat het gesprek op „Nieuw bericht na afhandeling”. |
| Antwoorden | Binnen 24 uur na het laatste bericht van de klant mag je vrij en gratis antwoorden. Boven het antwoordveld staat hoe lang dat nog kan. Versturen gaat met één tik op **Versturen**, zonder extra vraag (wens eigenaar 11 november 2026). |
| Na 24 uur | Bij WhatsApp alleen een **goedgekeurd sjabloon**. Dat kost een klein bedrag per bericht; dat staat bij het kiezen, zonder extra vinkje. Bij Messenger en Instagram kan het pas weer als de klant opnieuw schrijft. |
| Nooit dubbel | Elke verzending heeft een eigen aanvraag-id. Dubbelklikken, herladen of een tweede tabblad verstuurt niets extra. Staat er intussen een nieuw bericht van de klant, dan gaat er niets weg. |
| Onzeker | Valt de verbinding weg tijdens het versturen, dan blijft het gesprek op slot. Controleer in WhatsApp of Meta Business Suite of het bericht is aangekomen en kies daarna **Is aangekomen** of **Niet aangekomen**. |
| Niet | Geen reacties onder berichten (feed, comments), geen groepsgesprekken, geen automatische antwoorden. TikTok zit er niet in. |

## Oude gesprekken uit een WhatsApp-export importeren (13 november 2026)

Gesprekken die je vóór de overstap uit de WhatsApp Business-app hebt geëxporteerd („Chat exporteren”, met of zonder media), zet je zo bij de klant in Gesprekken:

1. **Systeem & koppelingen → WhatsApp, Messenger en Instagram · stand → WhatsApp-export importeren.**
2. Kies de **.zip** van de export (iPhone en Android met media), of het **.txt**-bestand met eventueel de losse foto's en spraakberichten erbij. Eén gesprek per keer.
3. Controleer wie in de export **Boerderijrecreatie** is, en vul het **telefoonnummer** en de **naam** van de klant in. Is de klant niet in je contacten opgeslagen, dan staat het nummer al ingevuld.
4. Klik **Importeren**. Eerst gaan de berichten erin, daarna de bijlagen één voor één.

Hoe het werkt:
- **In de browser:** de export wordt in de browser uitgepakt en gelezen. De backoffice krijgt alleen de berichten en de bijlagen die bij een bericht horen. Er is geen extra pakket nodig; de zip wordt gelezen met de ingebouwde `DecompressionStream` van de browser.
- **Bij welk gesprek:** de berichten komen bij het WhatsApp-gesprek met dat telefoonnummer.
- **Een nieuw gesprek** uit de export staat meteen op **afgehandeld**. Er gaan geen meldingen uit en de teller voor ongelezen berichten verandert niet. Schrijft de klant later opnieuw, dan staat het gesprek op „Nieuw bericht na afhandeling”.
- **Nog eens importeren** zet niets dubbel, want elk bericht krijgt een vaste sleutel uit zijn inhoud. Ontbreekt er een bijlage, importeer dan dezelfde export opnieuw met dat bestand erbij.
- **Bijlagen** staan in de eigen privé-opslag van de backoffice (Supabase Storage), tot 25 MB per bestand. Een bijlage die niet in de export zat, staat als tekst „📎 … (niet in de export)” in het gesprek.
- **Formaten:** Android en iPhone, Nederlands en Engels, dag-maand en maand-dag, en AM/PM. Tijden worden omgerekend van Nederlandse tijd naar UTC. Meldingen van WhatsApp zelf (zoals over versleuteling) worden niet overgenomen.
- **Techniek:**
  - het lezen van de export: `lib/whatsapp-export.ts`;
  - het opslaan: `importWhatsapp` en `importWhatsappMedia` in `lib/meta-store.ts`;
  - de API: `app/api/meta/import`;
  - het scherm: `app/koppeling/whatsapp-import.tsx`;
  - de tests: `tests/whatsapp-import.test.mjs`.

## De assistent laten leren van oude WhatsApp-gesprekken (13 november 2026)

De voorstellen van de assistent bij WhatsApp, Messenger, Instagram en mail gebruiken de goedgekeurde **kennisbank** (Gesprekken & klanten → Kennisbank). Oude WhatsApp-gesprekken gaan daar zo in:

1. Open **Kennisbank → Geschiedenis uit Trello, Wix of WhatsApp inlezen** en kies **WhatsApp-export (.zip of .txt)**.
2. Controleer de **naam van Boerderijrecreatie** zoals die in de export staat, en kies één of meer exports.
3. De assistent stelt kennisitems voor (veelgestelde vragen met jullie antwoord, huisregels, werkwijzen). Jullie keuren ze goed of af. Pas daarna gebruikt de assistent ze.

Wat er naar de assistent gaat:
- alleen de tekst, met **„Gast”** in plaats van de naam van de klant;
- telefoonnummers en e-mailadressen worden eruit gehaald;
- foto's en spraakberichten gaan niet mee;
- alleen gesprekken waarin Boerderijrecreatie antwoordt;
- het bestand zelf wordt nergens bewaard;
- elk stuk tekst kost één AI-aanvraag, net als bij Trello en Wix.

Regels in `whatsappEntries` (`lib/kennisbank-core.ts`); tests in `tests/kennisbank.test.mjs`.

## Wat jij bij Meta regelt (eenmalig)

Dit kan alleen de beheerder van het Meta-bedrijfsaccount van Boerderijrecreatie. Er is nog niets bij Meta aangemaakt.

### 1. Meta Business Suite

1. Ga naar [business.facebook.com](https://business.facebook.com) en kies (of maak) het bedrijfsaccount **Boerderijrecreatie**.
2. **Instellingen → Beveiligingscentrum → Bedrijfsverificatie**: laat Boerderijrecreatie verifiëren. Houd het KvK-uittreksel bij de hand. Dit kan een paar dagen duren.
3. Controleer bij **Accounts** dat de Facebook-pagina en het zakelijke Instagram-account aan dit bedrijfsaccount hangen. Instagram moet aan de Facebook-pagina gekoppeld zijn.

### 2. De app

1. Ga naar [developers.facebook.com/apps](https://developers.facebook.com/apps) → **App maken** → type **Business** en koppel hem aan het bedrijfsaccount Boerderijrecreatie.
2. Voeg de producten **WhatsApp**, **Messenger** en **Instagram** toe.
3. Kopieer bij **App-instellingen → Basis** het **App-geheim**.
4. Vul bij **App-instellingen → Basis** ook in: de privacyverklaring van de website (`/privacy/`) bij *Privacy Policy URL* en bij *User data deletion*, categorie *Bedrijven en pagina's*, en als app-icoon [`docs/beeld/meta-app-icoon-1024.png`](beeld/meta-app-icoon-1024.png) (1024×1024, het logo). Daarna **Publiceren → Publish**.

### 3. Het WhatsApp-nummer volledig naar de backoffice

Het nummer werkt daarna alleen nog via de backoffice, niet meer in de WhatsApp Business-app. Doe dit op een rustig moment: tussen stap 3.2 en 3.4 komen er geen berichten binnen.

1. **Belangrijke gesprekken bewaren.** Open in de WhatsApp Business-app elk gesprek dat je wilt houden → ⋮ → **Meer → Chat exporteren** en bewaar het bestand (bijvoorbeeld in Drive). Deze gesprekken komen niet in de backoffice.
2. **Het nummer uit de app halen.** WhatsApp Business-app → **Instellingen → Account → Account verwijderen** (voor dit nummer). Pas daarna kan Meta het nummer voor de backoffice gebruiken.
3. **Het nummer toevoegen bij Meta.** In de app bij Meta: **WhatsApp → API-instellingen → Telefoonnummer toevoegen**. Vul de weergavenaam **Boerderijrecreatie** in (Meta keurt die goed) en bevestig het nummer met de code per sms of telefoontje.
4. **Pincode kiezen.** Bedenk een pincode van 6 cijfers voor verificatie in twee stappen en bewaar die goed (bijvoorbeeld in de wachtwoordkluis). Die vul je in stap 6a in de backoffice in; daarmee meldt de backoffice het nummer bij Meta aan. Meta vraagt die pincode als het nummer ooit opnieuw gekoppeld moet worden.
5. **Profiel.** Vul in WhatsApp Manager het profiel in (foto, omschrijving, adres, website), zodat gasten zien dat ze met Boerderijrecreatie praten.

> Wil je toch de laatste maand aan oude gesprekken in de backoffice? Dat kan alleen via de route waarbij de app blijft meedoen (coexistence) en de oude gesprekken worden opgehaald. Of je daarna de app alsnog kunt loslaten zonder het nummer opnieuw te koppelen, is bij Meta niet duidelijk gedocumenteerd. Daarom is de eenvoudige route hierboven gekozen.

### 4. Een vaste sleutel

1. **Business Suite → Instellingen → Gebruikers → Systeemgebruikers**: maak een systeemgebruiker **backoffice** (rol Beheerder).
2. Geef hem toegang tot de app, het WhatsApp-account, de Facebook-pagina en het Instagram-account.
3. **Token genereren**, zonder vervaldatum, met deze rechten:
   - `whatsapp_business_messaging` en `whatsapp_business_management`;
   - `pages_messaging`, `pages_manage_metadata` en `pages_show_list`;
   - `instagram_basic` en `instagram_manage_messages`.
4. Haal met dezelfde systeemgebruiker ook een **paginasleutel** op voor de Facebook-pagina (voor Messenger en Instagram).

### 5. Invullen in de backoffice

Open **Systeem & koppelingen → WhatsApp, Messenger en Instagram** en vul in:

| Veld | Waar je het vindt |
| --- | --- |
| Meta app-geheim | Stap 2.3 |
| Verificatiecode voor de webhook | Kies zelf een willekeurige code van minstens 20 tekens |
| WhatsApp telefoonnummer-ID | App → WhatsApp → API-instellingen: het **ID** bij het nummer (niet het nummer zelf) |
| WhatsApp Business-account-ID | Op dezelfde plek |
| WhatsApp toegangssleutel | De sleutel uit stap 4.3 |
| Facebook-pagina-ID | Pagina → Info → Paginatransparantie, of Business Suite → Accounts → Pagina's |
| Instagram-account-ID | Business Suite → Accounts → Instagram-accounts |
| Paginasleutel | De sleutel uit stap 4.4 |

Alles wordt versleuteld bewaard. Zet ook het zakelijke WhatsApp-nummer bij **Bedrijfsgegevens**. Dat is de enige plek voor het nummer.

### 6. De webhook

1. Ga in de app naar **WhatsApp → Configuratie → Webhook**:
   - terugbel-URL: `https://backoffice.example.run.app/api/public/meta` (het adres staat ook onder **WhatsApp, Messenger en Instagram · stand**);
   - verificatietoken: dezelfde verificatiecode als in stap 5.
2. Klik **Verifiëren en opslaan** en abonneer op `messages`.
3. Doe hetzelfde bij **Messenger → Instellingen** (veld `messages`, ook `message_echoes`) en bij **Instagram → Webhooks** (veld `messages`). Abonneer **niet** op `feed` of `comments`.
4. Zet de app op **Live** (bovenaan in het app-dashboard).

### 6a. Koppelen bij Meta en controleren (in de backoffice, 11 november 2026)

Open **Systeem & koppelingen → WhatsApp, Messenger en Instagram · stand**:

1. Vul bij **Pincode WhatsApp-nummer** de pincode uit stap 3.4 in en kies **Koppelen bij Meta** (alleen een eigenaar). De backoffice doet dan de drie stappen die alleen via Meta's Graph API kunnen:
   - het WhatsApp Business-account abonneren op de app (zonder dit stuurt Meta geen WhatsApp-berichten naar de webhook);
   - het WhatsApp-nummer aanmelden met de pincode (zonder dit kan het nummer niets ontvangen of versturen);
   - de Facebook-pagina abonneren op `messages` en `message_echoes` (Messenger en Instagram).
   De pincode gaat alleen naar Meta en wordt nergens bewaard. Is het nummer al aangemeld, laat de pincode dan leeg.
2. Kies **Koppeling controleren bij Meta**. Per onderdeel zie je **In orde**, **Actie nodig** (met de reden van Meta) of **Nog niet ingevuld**: webhook, WhatsApp-nummer (nummer, naam, goedkeuring van de naam, kwaliteit, aangemeld), WhatsApp-berichten naar de webhook, Messenger (pagina en abonnement), Instagram (account bereikbaar met de paginasleutel) en verzenden. Controleren verandert niets bij Meta.

### 7. (vervallen) Oude gesprekken ophalen

Niet nodig: het nummer gaat volledig naar de backoffice (stap 3). De knop in de backoffice werkt alleen bij koppelen met de app erbij.

### 8. Sjablonen voor na 24 uur

1. Ga in **WhatsApp Manager → Berichtsjablonen** en maak minstens:
   - **antwoord_op_vraag** (categorie Hulpprogramma, Nederlands): „Hoi {{1}}, je stelde ons een vraag. We hebben een antwoord voor je klaarstaan. Wil je het lezen?”
   - eventueel **bevestiging_reservering** en **herinnering_bezoek**.
2. Meta keurt ze meestal binnen een dag goed. Alleen goedgekeurde sjablonen verschijnen in de backoffice.
3. Sjablonen met een afbeelding in de kop of een link met een variabele worden (nog) niet getoond.

### 9. Verzenden aanzetten

Verzenden staat uit tot op de server `META_SEND_ENABLED=1` staat (Cloud Run, zie [Cloud Run](CLOUD-RUN.md)). Zet dat pas aan na de proef hieronder.

## Proef (na de stappen hierboven)

1. Laat `META_SEND_ENABLED` uit. Stuur vanaf een privételefoon een WhatsApp-bericht naar het zakelijke nummer. Binnen een paar seconden moeten het gesprek in Gesprekken en de melding op de telefoon verschijnen.
2. Zet in de backoffice-app op de telefoon **Meldingen aanzetten** aan (Gesprekken) en controleer dat het bericht een melding geeft.
3. Stuur een foto en een spraakbericht. Beide moeten in de backoffice te openen zijn.
4. Doe hetzelfde via Messenger en Instagram Direct. Een reactie onder een bericht mag **niet** verschijnen.
5. Zet `META_SEND_ENABLED=1` en antwoord vanuit de backoffice aan je eigen privételefoon. Het bericht moet één keer aankomen.

## Techniek

| Onderdeel | Plek |
| --- | --- |
| Regels (ontleden, venster, sjablonen) | `apps/backoffice/lib/meta-core.ts` |
| Handtekening van Meta | `apps/backoffice/lib/meta-signature.ts` |
| Opslag, verzenden, bijlagen | `apps/backoffice/lib/meta-store.ts` |
| Webhook | `app/api/public/meta` (openbaar, alleen met een geldige handtekening van Meta: `X-Hub-Signature-256` met het app-geheim) |
| Backoffice | `app/api/meta` (lijst, oude gesprekken, `controleren`, `koppelen`), `app/api/meta/threads/[id]` (gesprek, afhandeling, verzenden), `app/api/meta/templates`, `app/api/meta/media/[id]` |
| Scherm | `app/gesprekken/meta.tsx`, `app/koppeling/meta-sync.tsx` |
| Tabellen | `meta_threads`, `meta_messages` en `meta_sends` (migratie `drizzle-pg/0054_meta_berichten.sql`, met beveiliging per rij) |
| Rechten | Dezelfde als de klantmail: onderdeel Gasten en, als `GUEST_ACCESS` is ingesteld, alleen wie mailtoegang heeft; verzenden alleen met `"send": true`. Oude gesprekken ophalen: alleen een eigenaar. |
| Bijlagen | Alleen van Meta zelf (`fbsbx.com`, `fbcdn.net`, `cdninstagram.com`, `whatsapp.net`), via https, tot 25 MB, nooit als link naar buiten. |
| Graph API | Standaard versie `v23.0`. Aan te passen met de instelling `META_GRAPH_VERSION` als Meta die versie uitfaseert. |
| Tests | `apps/backoffice/tests/meta.test.mjs`. Ontleden (WhatsApp, echo's, geschiedenis met grens, Messenger, Instagram, geen reacties), handtekening, venster, sjablonen. Daarnaast een echte tijdelijke database met een nagebootste Meta: niets dubbel, melding, afhandeling met versie, verzenden met bevestiging en eenmalig, onzeker en vrijgeven, sjabloon na 24 uur, Messenger, en de webhook met en zonder geldige handtekening. |

## Nog niet

- **Spraakberichten uitschrijven.** Het ontwerp toont het al, maar het vraagt een keuze voor een spraakdienst, met kosten en privacy (het geluid gaat naar die dienst). Apart besluit.
- **TikTok.** TikTok heeft een eigen berichten-API die alleen via goedgekeurde partners werkt. Apart uitzoeken.
- **Een AI-voorstel bij WhatsApp.** Bij mail werkt dat al. Bij WhatsApp volgt het, met dezelfde assistent en kennisbank.
