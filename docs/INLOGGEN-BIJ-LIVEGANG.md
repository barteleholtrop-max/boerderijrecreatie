> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Inloggen: altijd aan, via Supabase met tweestapsverificatie

> **Besluit eigenaar 8 november 2026: inloggen staat altijd aan.** „Inloggen gaat nu erg goed en snel. Dus inlog moet altijd aanstaan. De functie dat dit niet zo is moet vervallen.” De schakelaar `BOER_BART_LOGIN`, de uitzondering zonder login op de eigen computer (`LOCAL_NO_LOGIN`), de telefoonstand zonder login (`TUNNEL_NO_LOGIN`) en `--met-login` zijn vervallen. Backoffice en planbord vragen overal om inloggen met de Authenticator-code: online, op de Chromebook en in de telefoonstand.
>
> **Bijgewerkt 6 november 2026.** Bij de livegang log je in met **Google**, of met **e-mail en wachtwoord** voor wie geen Google-account heeft. Daarna vraagt de backoffice **altijd een code uit de Authenticator-app**. De oude noodrem met wachtwoorden (Basic Auth) en het oude inlogontwerp zijn verwijderd.

**Besluiten eigenaar, 6 november 2026:**
- „Eenvoudig, maar veilig inloggen”: via Supabase, met een scherm voor „Inloggen met Google”. Wie geen Google-mail heeft, maakt een account met e-mailadres en wachtwoord.
- Tweestapsverificatie met Google Authenticator. Voor de backoffice geldt dit voor iedereen, ook voor administratie@example.nl, die alle rechten heeft.
- Er komen drie eigenaren als achtervang: administratie@example.nl, Sanne en janholtrop@gmail.com. Raakt iemand zijn telefoon kwijt, dan reset een andere eigenaar diens Authenticator.
- Alle oude inlogontwerpen mogen weg.

Eerdere besluiten blijven gelden:
- 3 november: geen login tijdens het ontwikkelen. **Vervallen op 8 november 2026:** inloggen staat altijd aan.
- 4 november: Supabase als database en voor het inloggen, en administratie@example.nl als eigenaar.

## Tijdens het ontwikkelen

- Ook op je eigen computer en in de telefoonstand log je in, precies zoals online (besluit eigenaar 8 november 2026).
- Zet daarvoor `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `AUTH_SECRET` in `apps/backoffice/.env.local`, en dezelfde `AUTH_SECRET` in `apps/planbord/.env.local`. Zonder die instellingen blijven backoffice en planbord dicht (503).
- Voeg `http://localhost:3001/auth/terug`, `http://localhost:3001/inloggen?bevestigd=1` en `http://localhost:3001/inloggen/nieuw-wachtwoord` toe aan de Redirect URLs van Supabase. In de telefoonstand geldt dat ook voor het tijdelijke tunneladres.
- Opslaan vanaf een andere website wordt geweigerd (herkomstcontrole).

## Live: zo werkt het inloggen

1. **Inlogscherm (`/inloggen`):** je kiest **„Inloggen met Google”** of **„Inloggen met e-mail en wachtwoord”**.
   - **Account aanmaken:** voor wie geen Google-account heeft, met het e-mailadres dat de eigenaar op de lijst heeft gezet. Supabase stuurt een mail om het adres te bevestigen. Het wachtwoord moet minstens 10 tekens hebben.
   - **Wachtwoord vergeten:** je krijgt een herstelmail. Heb je de Authenticator al gekoppeld, dan vraagt het nieuwe wachtwoord ook om de code. Een gestolen mailbox alleen is dus niet genoeg.
   - Voor een adres dat niet op de lijst staat, wordt geen mail verstuurd. Het antwoord is altijd hetzelfde, zodat niemand kan uitproberen wie er op de lijst staat.
2. **Toegangslijst:** alleen wie **actief op de toegangslijst** staat, gaat door naar de tweede stap. Een account aanmaken geeft zelf geen toegang.
3. **Tweede stap (`/inloggen/code`):** de code uit de Authenticator-app.
   - **De eerste keer** koppel je de app met een QR-code. Lukt scannen niet, dan kun je de sleutel overtypen.
   - **Na 5 foute codes** moet je 10 minuten wachten.
4. **Sessie:** pas na de code krijgt de browser een ondertekende sessiecookie.
   - De cookie is `HttpOnly` en 8 uur geldig.
   - Hij is `Secure` op https, op Cloud Run en achter een https-proxy.
   - Een sessie zonder code bestaat niet; ook een oude sessie van vóór 6 november telt niet meer.
5. **Tussen de twee stappen** bewaart de browser alleen een versleutelde tussenstap van 10 minuten. Die geeft zelf geen toegang.
6. **Planbord:** het planbord gebruikt dezelfde login.
   - Zonder sessie stuurt het planbord je naar het inlogscherm van de backoffice en daarna terug.
   - Het planbord is voorlopig alleen voor eigenaren.
   - Het oude gedeelde wachtwoord van het planbord (issue #168) is weg.
7. **Zonder Supabase-instellingen** blijven backoffice en planbord **dicht** (503). Er is geen noodrem meer die ze openzet.
8. **Zonder backoffice-login blijven werken:**
   - gasten;
   - leden en deelnemers op hun eigen pagina, met de ledenlogin (Google of e-mail en wachtwoord, zonder Authenticator; [Ledenlogin](LEDENLOGIN.md));
   - werkplektablets die met een QR-code zijn gekoppeld ([Werkplektablets](WERKPLEK-TABLETS.md));
   - telefoons waarop de managerapp ingelogd blijft, alleen voor de managerapp ([Managerapp op de telefoon](MANAGERAPP-TELEFOON.md));
   - offertes voor gasten;
   - de openbare website;
   - de betaalmeldingen van Mollie.

**Toegang beheren:** ga naar Systeem & koppelingen → **Toegang** (`/toegang`). Alleen eigenaren kunnen daar:
- iemand toevoegen met e-mailadres, naam en rol;
- een rol wijzigen;
- iemand uitzetten of verwijderen;
- **„Authenticator resetten”** bij een kwijtgeraakte telefoon. Dat kan alleen voor een ander, niet voor jezelf.

Er blijft altijd minstens één eigenaar. Wie eraf gaat, kan na uiterlijk 8 uur niet meer verder.

## Aanzetten (eenmalig)

1. **Supabase → Authentication → Providers:**
   - **Google aan**, met de client-ID en het geheim van een Google OAuth-client;
   - **Email aan**, met „Confirm email” aan.
2. **Google Cloud:** voeg bij die OAuth-client het terugkeeradres van Supabase toe: `https://<project>.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Multi-Factor:** zet **TOTP (Authenticator app)** aan. Bij Supabase heet dit „App Authenticator (TOTP)”.
4. **Supabase → Authentication → URL Configuration → Redirect URLs:** voeg deze drie adressen toe:
   - `https://backoffice.example.nl/auth/terug`;
   - `https://backoffice.example.nl/inloggen?bevestigd=1`;
   - `https://backoffice.example.nl/inloggen/nieuw-wachtwoord`.
5. **Supabase → Authentication → Emails → SMTP Settings:** stel een eigen afzender in, bijvoorbeeld via Google Workspace. De ingebouwde mail van Supabase verstuurt maar een paar mails per uur en is niet bedoeld voor livegebruik.
6. **Backoffice** (`apps/backoffice/.env.local` of de instellingen van de server):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_ANON_KEY=<publishable/anon-sleutel>
   SUPABASE_SERVICE_ROLE_KEY=<alleen op de server; nodig voor „Authenticator resetten”>
   AUTH_SECRET=<willekeurig, minstens 32 tekens; dezelfde als bij het planbord>
   SESSION_COOKIE_DOMAIN=example.nl
   PLANBORD_ORIGIN=https://planbord.example.nl
   ```
7. **Planbord:**
   ```
   AUTH_SECRET=<dezelfde als de backoffice>
   BACKOFFICE_ORIGIN=https://backoffice.example.nl
   PLANBORD_LEESSLEUTEL=<optioneel, min. 32 tekens: alleen lezen van het bord voor de samenvoegcontrole>
   ```
8. **Eigenaren op de toegangslijst zetten:**
   - log eerst zelf in als administratie@example.nl;
   - zet Sanne en janholtrop@gmail.com op de lijst als eigenaar;
   - laat beiden inloggen en hun Authenticator koppelen.
9. **Advies:** zet bij de Google-accounts van de eigenaren óók de tweestapsverificatie van Google zelf aan. Dat geldt vooral voor gewone Gmail-adressen.

## Checklist vóór livegang

1. Supabase ingesteld (stappen hierboven) en een eigen mailafzender.
2. Drie eigenaren op de lijst, alle drie met een gekoppelde Authenticator.
3. Controle dat backoffice en planbord zonder aanmelding niets tonen.
4. Buiten je eigen computer alleen HTTPS.
5. Er is geen schakelaar of uitzondering meer die de login uitzet (vervallen op 8 november 2026). Een oude `BOER_BART_LOGIN`, `LOCAL_NO_LOGIN` of `TUNNEL_NO_LOGIN` op de server doet niets meer en mag weg.
6. Medewerkers alleen de onderdelen geven die ze nodig hebben (Toegang).

## Rechten per onderdeel (stap 2, gebouwd 6 november 2026)

**Wens eigenaar:** „mensen kunnen toevoegen voor specifieke gedeelten, bijvoorbeeld voor de planning”.

- **Een eigenaar mag alles.**
- **Een medewerker mag alleen de onderdelen die een eigenaar aanvinkt** bij Toegang. Er zijn tien onderdelen, gelijk aan het menu:
  - Overzicht;
  - Planning;
  - Personeel;
  - Gasten;
  - Verkoop;
  - Inkoop & voorraad;
  - Overleg;
  - Financiën & betalingen;
  - Bloei;
  - Marketing & website.
- **Alles daarbuiten is dicht.** De server weigert het, ook als iemand het adres zelf intypt. Pagina's sturen door naar het eerste eigen onderdeel; gegevens (API) geven 403.
- **Het menu toont alleen wat iemand mag openen.**
- **Een medewerker zonder onderdelen** ziet alleen de melding „Nog geen onderdelen”.
- **Beheer is altijd alleen voor eigenaren:** bedrijfsgegevens, Systeem & koppelingen en Toegang.
- **Een wijziging van onderdelen** geldt bij de volgende keer inloggen, uiterlijk na 8 uur. Moet iemand er direct uit, zet die persoon dan uit; ook dat werkt binnen 8 uur.
- **Gedeelde gegevens:** onderdelen die producten, bestellingen of voorraad tonen, mogen die gegevens **lezen**. Wijzigen kan alleen in het onderdeel waar ze horen.

## Opnieuw de code bij gevoelige handelingen (stap 2)

Ben je al ingelogd, maar is je laatste code langer dan **10 minuten** geleden? Dan vraagt de backoffice opnieuw de code uit je Authenticator-app. Daarna gaat de handeling vanzelf verder. Dat geldt bij:

- toegang wijzigen;
- de bankverdeling en uitbetalingen;
- alles in Bloei, dus obligaties, participaties, de Bloeimarkt, de import en inkomensleningen;
- koppelingen en sleutels opslaan;
- proefgegevens toevoegen of wissen;
- **namens een lid:**
  - de ledenkaart met de bankrekening opslaan;
  - een persoonlijke link maken of intrekken;
  - een uitbetaling vastleggen;
  - het percentage wijzigen.

**Elke gevoelige handeling wordt vastgelegd:** wie, wanneer, wat en voor welk lid. De laatste 50 staan onderaan het scherm Toegang. De vastlegging kan vanuit de app niet worden gewijzigd of gewist.

**Nog niet gebouwd:**
- een verplichte reden en een mail aan het lid bij handelen namens een lid;
- het omzetten van obligaties door de leden zelf.

Dit komt in de ledenomgeving (stap 4), waar die handelingen zelf worden gebouwd.

## Volgende stappen (besluiten eigenaar 6 november 2026)

1. **Werkplektablets inloggen met een QR-code** uit de backoffice:
   - de QR-code werkt één keer en 2 minuten;
   - de tablet krijgt een werkplekpas die nooit in de backoffice komt;
   - een overzicht van gekoppelde tablets met „Ontkoppelen”.

   **Gebouwd op 9 november 2026:** zie [Werkplektablets](WERKPLEK-TABLETS.md). Een gekoppelde tablet opent alleen de werkplekschermen.
2. **Ledenomgeving:**
   - A- en B-leden komen binnen via een uitnodigingslink (één keer te gebruiken, 7 dagen geldig);
   - C-leden loggen in via de website;
   - **Gebouwd op 9 november 2026 (wens eigenaar):** leden loggen in met Google of e-mail en wachtwoord, zonder tweede stap. De persoonlijke link alleen opent de ledenpagina niet meer. Zie [Ledenlogin](LEDENLOGIN.md).
   - leden mogen zelf omzetten van rente naar BB-coins, terug alleen naar de oorspronkelijke regeling;
   - een omzetting gaat in op 1 mei; aanvragen kan tot 1 april, intrekken tot 1 mei.

## Techniek

**Code:**
- `tools/auth/sessie.mjs`: sessie, tussenstap en cookieregels, gedeeld met het planbord.
- `lib/login-core.ts`: regels, PKCE, terugadressen en de wachtwoordregel.
- `lib/supabase-auth.ts`: de koppeling met Supabase Auth (wachtwoord, aanmelden, herstel, Authenticator, en reset door een beheerder).
- `lib/login-flow.ts`: tussenstap en cookies.
- `lib/owner.ts`: is iemand eigenaar? Dit gebeurt op basis van de rol, niet meer op een wachtwoordnaam.
- `lib/onderdelen.ts`: welke pagina's en API-adressen bij welk onderdeel horen (standaard dicht).
- `lib/gevoelig.ts`: gevoelige handelingen, de controle op een recente code en de vastlegging (tabel `security_audit`).
- `app/auth/opnieuw` en `app/code-opnieuw.tsx`: opnieuw de code invullen. Na het inloggen bewaart de browser daarvoor een versleuteld vernieuwingsbewijs van Supabase (`bb_herbevestig`, alleen voor `/auth`).
- De routes:
  - `app/auth/{google,terug,wachtwoord,aanmelden,vergeten,nieuw-wachtwoord,code,uit}`;
  - `app/inloggen` en de onderdelen `code` en `nieuw-wachtwoord`;
  - `app/toegang` en `app/api/toegang`.
- De controle in `proxy.ts` (backoffice) en `apps/planbord/proxy.ts`.
- De migraties `drizzle-pg/0004_toegang.sql`, `0033_inloggen_tweestaps.sql` (Supabase-gebruiker per adres) en `0036_onderdelen_en_vastlegging.sql`.

**Tests:**
- `apps/backoffice/tests/login.test.mjs` en `apps/backoffice/tests/onderdelen.test.mjs`.
- `tests/inloggen.integration.mjs`: de hele route tegen een nagebootste Supabase, met Google, wachtwoord, account aanmaken, wachtwoord vergeten, Authenticator koppelen en resetten, en „dicht zonder instellingen”.
- De andere integratietests loggen in met een ondertekende sessie (`tests/sessie.mjs`).
