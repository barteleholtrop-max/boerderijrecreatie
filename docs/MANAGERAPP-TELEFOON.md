> **Naslag uit Boer Bart** (overgenomen op 19 november 2026). Dit beschrijft hoe het onderdeel bij Boer Bart werkt en waarom. Delen over leden, Bloei, BB-tegoed, potten, Ite of de coöperatie gelden hier niet; die onderdelen zijn niet meegenomen (zie [HERKOMST.md](HERKOMST.md)).

# Managerapp altijd ingelogd op de eigen telefoon

**Wens eigenaar, 10 november 2026:** „Bij de telefoonberichten-app moet nieuw inloggen niet nodig zijn. Die app moet altijd bij die telefoon passen. Ja, dat is erg belangrijk.”

Gebouwd op dezelfde basis als de [werkplektablets](WERKPLEK-TABLETS.md).

## Zo zet je het aan (één keer per telefoon)

1. Open de app **Gesprekken** vanaf het beginscherm van je telefoon.
2. Log in zoals altijd: Google of e-mail en wachtwoord, en de code uit de Authenticator-app.
3. Bovenaan staat **„Deze telefoon ingelogd houden?”**. Kies **Ingelogd houden**.
   - Direct na het inloggen gaat dat met één tik.
   - Is het inloggen langer dan 10 minuten geleden, dan vraagt de app eerst nog één keer de code.

Daarna blijft de app op die telefoon ingelogd, ook morgen en volgende maand. Het eerste scherm verschijnt meteen, zonder inloggen.

**iPhone:** de app op het beginscherm bewaart zijn eigen inlog, los van Safari. Kies **Ingelogd houden** daarom in de app op het beginscherm zelf, niet in Safari.

**Kwijt de app, of de telefoon gewist:** gewoon opnieuw inloggen en weer **Ingelogd houden** kiezen.

## Wat een onthouden telefoon wel en niet kan

**Wel:** de managerapp, en alleen die:
- Gesprekken;
- Assistent;
- Boodschappen;
- Agenda.

**Niet:**
- **De rest van de backoffice.** Dat geldt ook voor een eigenaar. Tik je op **Backoffice**, dan vraagt de telefoon om gewoon in te loggen. Daarna werkt de hele backoffice 8 uur, zoals altijd.
- **Gevoelige handelingen,** zoals toegang wijzigen, de bank, Bloei en koppelingen. Daarvoor log je gewoon in, met de code.

## Ontkoppelen

- **Telefoon kwijt of iemand weg:** ga naar **Backoffice → Systeem → Toegang → Telefoons met de managerapp** en kies **Ontkoppelen**. Binnen een uur werkt de app op die telefoon niet meer zonder opnieuw in te loggen.
- **Vinkje of account:** zet je bij **Toegang** het vinkje **Managerapp (telefoon)** uit, of staat de persoon uit, dan werkt de telefoon ook binnen een uur niet meer.

## Hoe het werkt

| Onderdeel | Waar |
| --- | --- |
| Regels en de telefoonpas zelf (zonder database, ook in de proxy) | `apps/backoffice/lib/telefoon-pas-core.ts` |
| Onthouden, vernieuwen, ontkoppelen | `apps/backoffice/lib/telefoon-pas.ts` |
| Tabel | `phone_devices` (migratie `0061_telefoon_ingelogd`, met RLS) |
| In de app | `app/telefoon-ingelogd.tsx` (de vraag en het vernieuwen), `app/api/telefoon` |
| Beheer | `app/toegang/telefoons.tsx`, `app/api/toegang/telefoons` (alleen eigenaar; gevoelige handeling, vastgelegd) |
| Pas vernieuwen | `app/auth/telefoon/vernieuw` |
| Controle per verzoek | `proxy.ts`, na de gewone backoffice-sessie |

**Twee cookies op de telefoon:**
- `bb_telefoon_pas`: het geheime apparaatbewijs, 400 dagen geldig. In de database staat alleen de sha-256 ervan.
- `bb_telefoon`: een ondertekende telefoonpas van 60 minuten, met wie het is. De app vernieuwt die elke 10 minuten, en als de app weer zichtbaar wordt.

Bij elk vernieuwen controleert de backoffice drie dingen:
- de telefoon is niet ontkoppeld;
- de persoon staat nog aan;
- de persoon is eigenaar of heeft het vinkje Managerapp.

**De volgende ochtend:** is de pas verlopen, dan haalt de telefoon bij het openen eerst een nieuwe pas en gaat dan door naar het scherm.

**Rechten:** met de telefoonpas zet de proxy:
- het onderdeel `managerapp`;
- `x-boer-bart-mfa: 0`, dus er is geen code;
- `x-boer-bart-telefoon`.

Alles buiten de managerapp en elke gevoelige handeling blijft dicht.

**Een echte backoffice-login gaat voor.** Logt iemand op de telefoon gewoon in, dan geldt diens sessie.

**Tests:** `apps/backoffice/tests/managerapp-telefoon.test.mjs`.
