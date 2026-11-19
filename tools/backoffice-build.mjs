// Snelle backoffice in de proefomgeving (besluit eigenaar 4 november 2026: „backoffice proefomgeving ook snel”).
// ./boerbart-test start de backoffice als gebouwde versie (next build + standalone server) in plaats van `next dev`.
// Bouwen gebeurt alleen als de code is veranderd sinds de vorige bouw: na een update bij het starten, of bij lokaal
// gewijzigde bestanden. Daarna start hij direct. Lukt bouwen niet (bijvoorbeeld te weinig geheugen), dan start de
// backoffice zoals vroeger in de ontwikkelstand, zodat je altijd verder kunt.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

/** Wat de gebouwde versie beschrijft: de commit plus eventuele lokale wijzigingen in de bestanden die meebouwen. */
export function buildKey(head, dirtyListing) {
  return head + (dirtyListing.trim() ? ':' + createHash('sha256').update(dirtyListing).digest('hex').slice(0, 16) : '');
}
const stampFile = app => path.join(app, '.next', 'boerbart-build.json');
/** Moet er (opnieuw) gebouwd worden? Ja als er geen bouw is, de bouw onvolledig is, of de code is veranderd. */
export function needsBuild(app, key) {
  if (!fs.existsSync(path.join(app, '.next', 'BUILD_ID')) || !fs.existsSync(path.join(app, '.next', 'standalone', 'server.js'))) return true;
  try { return JSON.parse(fs.readFileSync(stampFile(app), 'utf8')).key !== key; } catch { return true; }
}
export function markBuilt(app, key, now = new Date()) {
  fs.writeFileSync(stampFile(app), JSON.stringify({key, built: now.toISOString()}) + '\n');
}
// De bestanden waarvan de backoffice-bouw afhangt (de app zelf en wat stage-standalone meekopieert).
export const BUILD_PATHS = ['apps/backoffice', 'tools/stage-standalone.mjs', 'tools/website-dev', 'data/backoffice', 'apps/planbord/snapshot/board.json'];
