# Proefwebsites op Cloud Run (besluit eigenaar 7 november 2026). Eén image per website:
#   docker build -f deploy/website/Dockerfile --build-arg SITE=website     .   (huidige website, gewone bestanden)
#   docker build -f deploy/website/Dockerfile --build-arg SITE=website-fab .   (proefwebsite StudioFab-vormgeving, Vite-build)
# Instellingen bij Cloud Run: BACKOFFICE_ORIGIN (https://…run.app van de backoffice) en BACKOFFICE_HOST (zelfde, zonder https://).
ARG SITE=website

FROM node:22-bookworm-slim AS fab
WORKDIR /src/apps/website-fab
COPY apps/website-fab/package.json apps/website-fab/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/website-fab/ ./
# De bestelapp (apps/website/bestellen.*) en de oogstpagina (backoffice/public/abonnementen.html) komen mee in de build.
COPY apps/website/ /src/apps/website/
COPY apps/backoffice/public/abonnementen.html /src/apps/backoffice/public/abonnementen.html
RUN npm run build

FROM scratch AS site-website
COPY apps/website/ /html/
FROM scratch AS site-website-fab
COPY --from=fab /src/apps/website-fab/dist/ /html/
FROM site-${SITE} AS site

FROM nginx:1.27-alpine
ENV PORT=8080 NGINX_ENVSUBST_FILTER="^(PORT|BACKOFFICE_ORIGIN|BACKOFFICE_HOST)$"
COPY deploy/website/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=site /html/ /usr/share/nginx/html/
RUN rm -f /usr/share/nginx/html/Dockerfile
EXPOSE 8080
