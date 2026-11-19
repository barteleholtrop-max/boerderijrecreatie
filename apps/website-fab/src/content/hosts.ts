// Adressen van de site (wens eigenaar 16 november 2026: „alles wat met Bloei te maken heeft op cooperatie.boerbart.nl”).
// Dezelfde site draait op twee adressen achter de voordeur (docs/SITES.md):
// - www.boerbart.nl: de hoofdsite; /mijn-bloei/ en /bloeimarkt/ sturen daar door naar het coöperatie-adres (nginx);
// - cooperatie.boerbart.nl: alleen Bloei (Mijn Bloei, de Bloeimarkt, de officiële documenten), met een eigen klein menu;
//   elke andere pagina stuurt daar door naar www.boerbart.nl (nginx).
export const HOOFDSITE_ORIGIN = "https://www.boerbart.nl";
export const COOP_ORIGIN = "https://cooperatie.boerbart.nl";
/** Pagina's die bij Bloei horen en op het coöperatie-adres staan. */
export const BLOEI_PAGES = ["bloei", "markt"] as const;

/** Staat deze pagina open op het coöperatie-adres? Alleen in de browser; bij het vooraf opbouwen altijd nee. */
export function isCoopHost() {
  return typeof window !== "undefined" && /^cooperatie\./i.test(window.location.hostname);
}
/** Staat deze pagina open op de echte hoofdsite (www.boerbart.nl of boerbart.nl)? */
export function isHoofdsiteHost() {
  return typeof window !== "undefined" && /^(www\.)?boerbart\.nl$/i.test(window.location.hostname);
}
/** Link naar een Bloei-pagina: op de echte hoofdsite meteen naar het coöperatie-adres; elders (test, Cloud Run, het
 *  coöperatie-adres zelf) gewoon het pad. De doorverwijzing in nginx vangt het verder op. */
export function bloeiHref(path: string, opHoofdsite = isHoofdsiteHost()) {
  return opHoofdsite ? COOP_ORIGIN + path : path;
}
/** Link vanaf het coöperatie-adres terug naar de hoofdsite. */
export function hoofdsiteHref(path: string) {
  return isCoopHost() ? HOOFDSITE_ORIGIN + path : path;
}
