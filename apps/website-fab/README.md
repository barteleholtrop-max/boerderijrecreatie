# Hoofdsite (boerbart.nl)

> **Indeling, 15 november 2026:** dit is de **hoofdsite** van Boer Bart en komt op boerbart.nl. De naam „proefwebsite” hieronder is geschiedenis. Overzicht van alle sites: [docs/SITES.md](../../docs/SITES.md).

## Geschiedenis: proefwebsite in het ontwerp van StudioFab

**Wens eigenaar, 4 november 2026.** Het websiteontwerp van StudioFab (Fab, `andreattafabio/boerbart`, commit `ec77a87`) draait hier als proef naast de eigen website, om de look en feel te ervaren. De eigen website (`apps/website`, poort 3002/3003) blijft zoals hij is.

## Starten

- `./boerbart-test` start hem vanzelf mee op **http://localhost:3004**. De eerste keer worden de onderdelen geïnstalleerd.
- Los: start de backoffice op 3001 en daarna `npm run dev:website-fab`.

## Wat er uit de backoffice komt

De backoffice is de enige bron (`docs/ARCHITECTUUR-CENTRALE-BACKOFFICE.md`). Via `/api` (doorgestuurd naar de backoffice op 3001):

- **Openingstijden en gesloten dagen** uit Planning (`/api/public/availability`). Speelboerderij en winkel volgen het ene weekrooster van de boerderij. „Vandaag op het erf” telt gesloten dagen mee.
- **Ite-avonden**: de eerstvolgende avond en het tijdstip.
- **Contactgegevens**: telefoon, e-mail, WhatsApp en adres.
- **Aanvraagformulier** (Contact): komt in Gesprekken, aanvragen & klanten (`/api/public/group-requests`). Bij kinderfeest, schoolreisje en groep krijgt de gast direct een indicatie op de datum.

Is de backoffice niet bereikbaar, dan blijven de vaste teksten van Fab staan.

## Nog vast in de code (`src/content/site.ts`)

Prijzen (entree, kinderfeest, schoolreisje, Ite, coöperatie), teksten, veelgestelde vragen, KvK en de heropeningsdatum. Die moeten nog uit de backoffice komen voordat dit ontwerp live kan.

Aangepast ten opzichte van Fab: „Yte bij Boer Bart” heet „Ite by Boer Bart” (besluit eigenaar) en het menu is speelboerderij, winkel, Ite.

## Het beste van twee werelden (5 november 2026)

**Wens eigenaar:** de functies van onze eigen website (`apps/website`, poort 3003) in deze vormgeving. Deze site groeit stap voor stap uit tot dé website. Fabio's ontwerp was het voorbeeld; we bouwen hier verder.

**Stap 1 (gebouwd): webshop en bestellen**
- **Webshop** op de winkelpagina (`/boerderijwinkel/#online`):
  - het live aanbod uit de backoffice, met prijs, foto en „uitverkocht”;
  - „In je mandje” en daarna „Afrekenen en afhalen”;
  - het mandje is hetzelfde als dat van de bestelapp, dus er staan hier geen eigen prijzen.
- **Bestelapp op `/bestellen/`**, ook via „Bestellen” in het menu:
  - dezelfde bestelapp als op onze site, met al zijn functies: eten en drinken, winkel, afhalen, eigen bedrag, groepscode, betalen via Mollie, meldingen en de zelfservicekassa (`/bestellen/?zelfservice=1`);
  - in deze vormgeving: lettertypen, kleuren en het woordmerk.
  - De code blijft in `apps/website/bestellen.*`. `bestelapp/plugin.ts` serveert hem hier (ontwikkelen) en zet hem in `dist/bestellen` (bouwen), met `bestelapp/thema.css`.

**Stap 2 (gebouwd): agenda met aanmelden en betalen**
- **Agenda** op `/agenda/`, ook in het menu:
  - de evenementen uit de backoffice (Gasten → evenementen), met datum, tijd, foto, prijs en vrije plaatsen;
  - aanmelden met naam, e-mail, telefoon en aantal personen;
  - bij een betaald evenement meteen online betalen via Mollie; terug op `/agenda/?aanmelding=…` ziet de gast of de betaling gelukt is;
  - „In je agenda” zet het evenement in de eigen agenda (ics-bestand).
- **Op de voorpagina** „Binnenkort op het erf”: de eerstvolgende drie evenementen. Zonder evenementen verschijnt dit blok niet.
- Terug van Mollie na een bestelling komt de gast nu goed uit op `/bestellen/` (eerder `/bestellen.html`).

**Stap 3 (gebouwd): speelboerderij plannen**
- Op de speelboerderijpagina (`/speelboerderij/#plannen`, ook via „Plan je bezoek”):
  - de gast kiest een dag en een tijdblok uit de planning van de backoffice (Planning → tijdblokken met plek voor bezoekers), en met hoeveel kinderen en andere gasten ze komen;
  - daarna: „Zet in je agenda” (ics), Google Agenda of „Delen met vrienden” (deelknop van de telefoon, anders kopiëren of WhatsApp);
  - er wordt niets verstuurd of gereserveerd, net als op onze eigen website. Wie zeker wil zijn van een plek, gaat door naar het aanvraagformulier.
- Datums beginnen nu met een hoofdletter en de rest blijft klein („Zaterdag 7 november”); eerder kreeg elk woord een hoofdletter.

**Stap 4 (gebouwd): Ite aanvragen**
- Op de Ite-pagina (`/yte/#reserveren`, ook via „Reserveer een tafel”):
  - de gast kiest een avond uit de Ite-momenten van de backoffice (dichte avonden staan er niet bij), het aantal personen, aanschuiven bij anderen of een eigen tafel, en allergieën of wensen;
  - de aanvraag gaat naar `/api/public/yte-requests`, dezelfde deur als op onze eigen website: hij komt in Planning als „aanvraag” op de klantenkaart met hetzelfde e-mailadres;
  - na het versturen: „Zet in je agenda” (ics) of Google Agenda.

**Stap 5 (gebouwd): Mijn Bloei**
- Op `/mijn-bloei/` (in de voettekst en op de coöperatiepagina via „Al lid? Naar Mijn Bloei”) staat de ledenomgeving van Bloei.
  - Het is hetzelfde onderdeel als op onze eigen website (`<bloei-proef>` met `bloei-proef.js` en `bloei-proef.css` uit de backoffice); Bloei blijft de enige kapitaaladministratie.
  - Niet in zoekmachines (noindex). Zolang de livegangvoorwaarden niet rond zijn, zijn de leden fictief.
- Bij het ontwikkelen stuurt Vite `/api`, `/bloei-proef.js`, `/bloei-proef.css` en `/brand.css` door naar de backoffice. Bij het online zetten moet de hosting dezelfde adressen doorsturen.

**Stap 6 (gebouwd, 13 november 2026): nieuws, blog en filmpjes**
- `/privacy/` leest het ene privacybeleid van alle sites uit de backoffice (Marketing & website → Privacy · alle sites) via `/api/public/v1/privacy`. Zie `docs/PRIVACY-ALLE-SITES.md`.
- `/nieuws/` en het blok „Van het erf” op de homepage lezen de stukken uit de backoffice (Inhoud · blogs & filmpjes) via de vaste poort `/api/public/v1/inhoud?site=boerbart`. Zie `docs/INHOUD-EN-DORP.md`.

**Volgende stappen**
7. Prijzen en teksten uit de backoffice, plus vindbaarheid (agendafeed, gegevens voor zoekmachines).

## Opbouwstand (15 november 2026)

**Wens eigenaar:** een eerste pagina die vertelt dat we in ontwikkeling zijn. „De gemeente vindt alles nog spannend”: daarom **nog geen opening noemen**, ook geen datum, en geen prijzen. Met een winterbeeld. Het blok met negen foto's: „eigenlijk wel leuk”. Kop: „We werken aan het nieuwe Boer Bart.” „Contact hoeft nog niet.”

- **Aan/uit per onderdeel:** in de backoffice, Website & uitstraling → Onderdelen van de hoofdsite (sinds 15 november 2026, zie [docs/SITES.md](../../docs/SITES.md)). `opbouw` in `src/content/site.ts` is alleen nog de standaard zolang de backoffice niets zegt.
- **Voorpagina** (`OpbouwHome` in `src/pages/Home.tsx`):
  1. openingsbeeld (in kleur) met „We werken aan het nieuwe Boer Bart.” en de knop „Volg ons op Instagram”;
  2. „Straks weer op het erf”: negen foto's in een raster van 3 bij 3, ook op de telefoon;
  3. „Wat er komt”: speelboerderij, Ite, winkel en groepen, met een link naar hun pagina;
  4. „Van het erf” (bouwverslagen uit Inhoud) en de agenda; zonder stukken of evenementen verschijnen die niet.
- **Bewust weggelaten:** „Vandaag op het erf” (dat zou „weer open op …” kunnen tonen), het contactblok, „Alvast meedoen” (aanvragen en lid worden: „hoeft ook nog niet”), de knop „Plan je bezoek” in de kop en de vaste knoppenbalk onderaan. Telefoon en e-mail staan alleen nog in de voettekst.
- **Alleen de startpagina** („eigenlijk is alleen de startpagina eerst voldoende”, „je hoeft geen lid te worden”): geen menu. Elke andere pagina (speelboerderij, Ite, winkel, agenda, groepen, ons verhaal, vragen, contact, nieuws) toont op haar eigen adres een pagina „in ontwikkeling” in dezelfde stijl als de voorpagina (`src/pages/InOntwikkeling.tsx`): grote foto, koel ingekleurd met CSS, eigen titel en één zin. De adressen blijven bestaan, dus oude Wix-adressen komen netjes aan. Gewoon bereikbaar blijven privacy, Mijn Bloei, Bloeimarkt en de bevestigingspagina (`altijdOpen`).
- **Volg ons** gaat naar Instagram: Nieuws heeft nog geen gepubliceerde stukken.
- **Op elke pagina:** een smalle balk „We werken aan het nieuwe Boer Bart. Volg ons” (naar Instagram). In de voettekst adres, contact, privacy en voor bestaande leden Mijn Bloei en de Bloeimarkt; op die twee pagina's staat ook een klein menu met alleen die twee.
- **Het coöperatieve verhaal** staat op de startpagina („De boerderij die ons samen draagt”), met „je hoeft geen lid te worden” (wens eigenaar 15 november 2026). De pagina /cooperatie/ is vervallen (pull request 473) en verwijst door naar /over-ons/.
- **Openingsbeeld in kleur** (16 november 2026, eigenaar: het zwart-witte winterbeeld „lijkt op een rouwkaart”): de echte foto „zonsopkomst” (Bart langs de sloot), zonder filter. Ook de pagina's „in ontwikkeling” tonen hun foto weer in kleur.
- **Opening:** pas noemen als de eigenaar dat zegt; de datum komt dan uit Planning in de backoffice, nooit vast in de code.
- **Test:** `tests/website-combinatie.test.mjs` („opbouwstand”).
