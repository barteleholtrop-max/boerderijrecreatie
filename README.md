# Boerderijrecreatie

Backoffice, kassa, zelfscan, bestelpagina en website van Boerderijrecreatie. Begin bij [docs/WELKOM.md](docs/WELKOM.md); de
werkafspraken staan in [AGENTS.md](AGENTS.md).

| Map | Inhoud |
| --- | --- |
| `apps/backoffice` | De backoffice (Next.js, Postgres via Supabase): producten, kassa, werkplekken, zelfkassa, inkoop, agenda, gesprekken, betalingen, toegang en de assistent |
| `apps/website` | Voorpagina, bestelpagina, zelfscan en zelfkassa voor gasten |
| `deploy/website` | Docker en nginx voor de website op Cloud Run |
| `integrations/google` | Apps Script voor Google Sheets en een beeldbank in Drive (optioneel) |
| `tools` | Bouwen, starten, iconen maken en hulpmiddelen voor de ontwikkelomgeving |
| `tests` | Integratie- en browsertests |
| `docs` | Uitleg en afspraken |

## Snel starten op je eigen computer

Node.js 24 en npm.

```sh
npm run setup
npm run install:apps
npm run build
npm start
```

`setup` maakt alleen een ontbrekend `apps/backoffice/.env.local` met nieuwe sleutels. De backoffice draait dan op
http://localhost:3001, de website met `npm run dev:website` op http://localhost:3002. Inloggen gaat via Supabase; zie
[docs/ONLINE-ZETTEN.md](docs/ONLINE-ZETTEN.md).

## Controleren

```sh
npm test
npm run typecheck
```

De GitHub-controle (`.github/workflows/verify.yml`) draait daarnaast de integratietests, de build en de browsertests.
