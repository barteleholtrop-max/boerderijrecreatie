# Backoffice van Boerderijrecreatie op Google Cloud Run (besluit eigenaar 7 november 2026). Zie docs/ONLINE-ZETTEN.md.
# Bouwt apps/backoffice als zelfstandige Next.js-server (output: standalone) en start die op poort 8080.
# Gegevens staan in Supabase (DATABASE_URL); niets blijvend op de schijf van de container.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
# Eerst alleen de pakketlijst, zodat de pakketten niet bij elke codewijziging opnieuw geïnstalleerd worden.
COPY apps/backoffice/package.json apps/backoffice/package-lock.json apps/backoffice/
RUN cd apps/backoffice && npm ci --no-audit --no-fund
# Daarna de rest: de build gebruikt ook tools/ (tools/stage-standalone.mjs).
COPY . .
RUN cd apps/backoffice && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 APP_DATA_DIR=/tmp/boerbart
COPY --from=build --chown=node:node /repo/apps/backoffice/.next/standalone ./
USER node
EXPOSE 8080
CMD ["node","server.js"]
