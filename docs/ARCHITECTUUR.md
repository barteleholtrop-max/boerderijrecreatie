# Architectuur: de backoffice is de enige bron

Alle actuele bedrijfsgegevens staan op één plek: de backoffice (Postgres in Supabase). Producten, prijzen, btw, voorraad,
openingstijden, contactgegevens, bedrijfsgegevens en koppelingen worden daar beheerd. De website, de zelfscan, de zelfkassa
en de kassa lezen ze via de openbare deur `/api/public/…`.

- **Geen kopieën.** Zet geen prijzen, openingstijden of adressen vast in HTML of code. Lees ze uit de backoffice.
- **Openbare deur.** Alleen `/api/public/…` is zonder login bereikbaar en geeft alleen wat gasten mogen zien. De rest zit
  achter de login (`apps/backoffice/proxy.ts`).
- **Database.** `apps/backoffice/db/schema.ts` is de bron; migraties in `drizzle-pg/` worden met drizzle-kit gemaakt.
  Elke tabel heeft beveiliging per rij aan (de backoffice verbindt rechtstreeks; de Data API van Supabase ziet niets).
- **Sleutels.** Sleutels en geheimen staan versleuteld in de database (Koppelingen) of in de omgevingsvariabelen van Cloud
  Run, nooit in Git.
- **Achtergrondwerk.** Het werkproces (`lib/assistant-jobs.ts`) haalt mail op, controleert betalingen en ruimt op. Online
  klopt Cloud Scheduler aan op `/api/werkproces/ronde` met `WORKER_SECRET`.
