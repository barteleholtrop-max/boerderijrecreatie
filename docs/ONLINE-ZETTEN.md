# Online zetten

De backoffice en de website draaien elk als eigen dienst op Google Cloud Run, met Supabase eronder (database en inloggen).
Alles op eigen accounts van het bedrijf; er wordt niets gedeeld met Boer Bart.

## 1. Supabase

Maak een project in de regio Frankfurt. Je hebt nodig: de verbinding van de **Transaction pooler** (poort 6543), het
project-adres, de publishable key en de secret key. Zet bij Authentication → Providers Google en/of e-mail aan. Inloggen gaat
altijd met een tweede stap (Authenticator-app).

## 2. Backoffice op Cloud Run

Cloud Run → **Deploy a web service** → **Connect repository** → GitHub → `janholtrop-max/boerderijrecreatie`.

| Instelling | Waarde |
|---|---|
| Branch | `main` (elke wijziging in `main` wordt vanzelf gebouwd en gepubliceerd) |
| Build type | Dockerfile, `/Dockerfile` |
| Region | europe-west3 (Frankfurt), naast Supabase |
| Authentication | Allow public access (de backoffice heeft een eigen login; website en printers moeten erbij) |
| CPU | Request-based |
| Container port | `8080` |
| Memory / CPU | 1 GiB / 1 |
| Minimum / maximum instances | 0 / 3 |

**Variabelen** (geheimen bij voorkeur via Secret Manager; nooit in Git, chat of mail):

| Naam | Waarde |
|---|---|
| `APP_ORIGIN` | het adres van de dienst (bovenaan de dienstpagina) |
| `EERSTE_EIGENAAR` | jouw e-mailadres; word je bij de eerste start eigenaar |
| `DATABASE_URL` | Supabase, Transaction pooler |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | uit Supabase |
| `AUTH_SECRET`, `WORKER_SECRET` | elk nieuw, minstens 32 tekens: `openssl rand -base64 48` |
| `SHEETS_CONFIG_KEY` | nieuw, 64 tekens hex: `openssl rand -hex 32` (versleutelt de sleutels in de database) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | voor pushmeldingen: `npx web-push generate-vapid-keys`; subject = `mailto:` + je eigen adres |
| `PUBLIC_ORDER_ORIGINS` | het adres van de website (stap 4) |
| `ASSISTANT_WORKER` | `0` (Cloud Scheduler stuurt het werkproces aan) |
| `SNAPSHOT_IMPORT` | `0` |
| `DATABASE_POOL` | `10` |

Sleutels voor Mollie, bunq, Gmail, Meta en Claude vul je in de backoffice in bij Instellingen → Koppelingen; ze worden
versleuteld bewaard. Echte betalingen, mail versturen en berichten versturen staan standaard uit en zet je bewust aan
(`MAIL_SEND_ENABLED=1`, `META_SEND_ENABLED=1`, `BUNQ_LIVE_ENABLED=1`).

## 3. Werkproces

Cloud Scheduler → **Create job**: elke 2 minuten (`*/2 * * * *`, Europe/Amsterdam), HTTP `POST` naar
`<APP_ORIGIN>/api/werkproces/ronde` met de kop `X-Werkproces-Sleutel: <WORKER_SECRET>`.

## 4. Website

Een tweede Cloud Run-dienst uit dezelfde repository met `deploy/website/Dockerfile` (build-argument `SITE=website`) en de
variabelen `BACKOFFICE_ORIGIN` (het adres van de backoffice) en `BACKOFFICE_HOST` (hetzelfde, zonder `https://`). Zet het adres
van de website daarna in `PUBLIC_ORDER_ORIGINS` van de backoffice. Een eigen domein koppel je bij Cloud Run → Domain mappings;
`zelfscan.<domein>` opent dan meteen de zelfscan.

## Controle

Werkt het online terwijl je eigen computer uit staat, dan is het klaar. `GET <APP_ORIGIN>/api/health` geeft 200 als de
database en de opslag in orde zijn.
