# Welkom

Dit is het systeem van Boerderijrecreatie: één backoffice met kassa, zelfscan, bestelpagina, gastcontact en een eenvoudige
website. Je stuurt het met opdrachten aan Claude (Claude Code), net als bij Boer Bart. De werkafspraken staan in
[AGENTS.md](../AGENTS.md).

## Wat er is

| Deel | Waar | Wat |
| --- | --- | --- |
| Backoffice | `apps/backoffice` | Next.js 16 en Postgres (Supabase). Producten en prijzen, kassa en werkplekken, zelfkassa en QR-stickers, inkoop en voorraad, agenda en reserveringen, gesprekken met gasten (Gmail, WhatsApp), offertes, betalingen (Mollie en bunq), printers, toegang en de assistent (Claude). |
| Website | `apps/website` | Voorpagina, bestelpagina (`bestellen.html`), zelfscan op de eigen telefoon (`zelfscan.html`) en zelfkassa op een tablet (`zelfkassa.html`). Alles haalt producten en prijzen uit de backoffice. |
| Hosting | `Dockerfile`, `deploy/website` | Backoffice en website elk als eigen dienst op Google Cloud Run. |
| Controle | `.github/workflows` | Bij elke push en pull request: tests, typecontrole, build en browsertests. |

## Eerste stappen

1. **Eigen accounts.** Maak op naam van het bedrijf een Supabase-project, een Google Cloud-project (Cloud Run), een
   Mollie-account en een Anthropic-sleutel (voor de assistent en het lezen van etiketten). Zie [ONLINE-ZETTEN.md](ONLINE-ZETTEN.md).
2. **Eerste eigenaar.** Zet `EERSTE_EIGENAAR` op je eigen e-mailadres. Bij de eerste start word je eigenaar; daarna voeg je
   anderen toe bij Instellingen → Toegang.
3. **Bedrijfsgegevens.** Vul naam, adres, KvK, btw en IBAN in bij Instellingen → Bedrijfsgegevens, en de contactgegevens en
   openingstijden bij Openingstijden & capaciteit. De website toont ze vanzelf.
4. **Producten.** Zet de producten en prijzen in Gerechten & prijzen. Frisdrank met een streepjescode kun je meteen
   scannen.
5. **Logo.** Zet het eigen logo op `apps/backoffice/public/logo-bron.png` en draai `python3 tools/startscherm-iconen.py`.

## Eerste project: de zelfscankassa bij de koeling

Zie [ZELFSCANKASSA-KOELING.md](ZELFSCANKASSA-KOELING.md).

## Herkomst

Wat er uit Boer Bart is meegenomen en wat niet, staat in [HERKOMST.md](HERKOMST.md). Commentaar in de code met een datum
vóór 19 november 2026 („wens eigenaar …”) gaat over besluiten bij Boer Bart. Dat is geschiedenis, geen afspraak voor dit bedrijf.
