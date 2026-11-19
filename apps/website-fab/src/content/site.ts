// Alle feiten op een plek. Bron: oude Wix-site (oktober 2026) en het planbord van Bartele en Rianne.
// Open punten om met Bart te checken staan in BACKLOG.md. Niets verzinnen: liever weglaten.

export const site = {
  name: "Boer Bart",
  owners: "Rianne & Bart",
  ownersFull: "Bartele en Rianne Holtrop",
  street: "Schoterweg 26",
  postalCode: "8462 TD",
  city: "Rotstergaast",
  region: "Friesland",
  country: "NL",
  phone: "06 54 60 20 41",
  phoneIntl: "+31654602041",
  whatsappEvents: "06 21 36 82 55",
  email: "rianne@boerbart.nl",
  kvk: "87761084",
  instagram: "https://www.instagram.com/boer_bart/",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Boer+Bart+Schoterweg+26+Rotstergaast",
  since: 2014,
};

// Opbouwstand (besluit eigenaar 15 november 2026): Boer Bart is in ontwikkeling en gaat weer open, maar er is nog
// geen datum (de gemeente beslist nog). Aan: de voorpagina vertelt dat verhaal met een winterbeeld en elke pagina krijgt
// een smalle balk. Uit: de gewone voorpagina komt terug. Bewust geen openingsdatum hier: die komt, zodra hij vaststaat,
// uit Planning in de backoffice (de eerste open dag).
// Sinds 15 november 2026 kiest de eigenaar dit per onderdeel in de backoffice (Website & uitstraling, „Onderdelen van de
// hoofdsite”); de site leest dat live (content/live.ts, inOntwikkeling). Deze waarde is alleen de standaard zolang de
// backoffice niets heeft gezegd: bij het vooraf opbouwen van de pagina's en bij een storing.
export const opbouw = true;

// Openingstijden per onderdeel: GEEN vaste tijden hier (besluit eigenaar 8 november 2026). De centrale backoffice is
// altijd leidend; live.ts vult days en note met het ene weekrooster uit Planning (speelboerderij en winkel volgen dat
// rooster, Ite volgt de echte avonden). Dagen: 0 = zondag ... 6 = zaterdag.
export type Unit = "speelboerderij" | "yte" | "winkel";
export const hours: Record<Unit, { label: string; days: Record<number, [string, string]>; seasonal: boolean; note: string }> = {
  speelboerderij: { label: "Speelboerderij", days: {}, seasonal: false, note: "" },
  yte: { label: "Ite by Boer Bart", days: {}, seasonal: false, note: "" },
  winkel: { label: "Boerderijwinkel", days: {}, seasonal: false, note: "" },
};

export const dayNames = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

// Prijzen komen uit de backoffice (Bedrijfsgegevens → Tarieven op de website, 15 november 2026); live.ts vult ze in.
// Leeg = niet ingevuld of niet te laden: dan noemt de site geen prijs (nooit een geraden of oude prijs).
export const prices = {
  entreeKind: "",
  kinderfeest: "",
  schoolreisje: "",
  yte: "",
};

export const faq: [string, string][] = [
  ["Op welke dagen zijn jullie open?", "De actuele openingstijden staan bovenaan de homepage bij Vandaag op het erf en op de contactpagina. Ze komen rechtstreeks uit onze planning, dus wat daar staat klopt."],
  ["Wat kost de speelboerderij?", "Je betaalt entree per kind van 1 tot 10 jaar; het bedrag staat op de pagina Speelboerderij. Volwassenen en baby's zijn gratis. Het boerenpaad zit bij de entree inbegrepen."],
  ["Moet ik reserveren?", "We waarderen het als je reserveert. Je reserveert een tafel; het aantal volwassenen maakt daarbij niet uit. Je reservering geldt voor drie uur, en als het rustig is mag je gewoon langer blijven."],
  ["Kan ik ook alleen komen lunchen?", "Ja. Kom je alleen voor de lunch, bijvoorbeeld omdat je langs fietst, dan betaal je geen entree."],
  ["Mag ik eigen eten en drinken meenemen?", "Nee, eigen consumpties zijn niet toegestaan. Bij een allergie mag je wel je eigen eten meenemen."],
  ["Hoe zit het met pannenkoeken aan het eind van de dag?", "Na 16.30 uur vervalt de entree voor de speelboerderij. Kom je dan pannenkoeken eten, dan spelen de kinderen gratis."],
  ["Is Ite geschikt voor kinderen?", "Nee. Ite is een avond voor volwassenen. Kinderen zijn overdag van harte welkom op de speelboerderij."],
  ["Hoe lang is een jaarkaart geldig?", "Een jaarkaart is geldig tot en met 31 december van het jaar waarin je hem koopt."],
];

export type NavKey = "speelboerderij" | "yte" | "winkel" | "agenda" | "groepen" | "over" | "bestellen";
export const nav: [NavKey, string, string][] = [
  ["speelboerderij", "Speelboerderij", "/speelboerderij/"],
  ["winkel", "Winkel", "/boerderijwinkel/"],
  ["yte", "Ite", "/yte/"],
  ["agenda", "Agenda", "/agenda/"],
  ["groepen", "Groepen", "/groepen/"],
  ["over", "Ons verhaal", "/over-ons/"],
  // Eten, drinken en de winkel online bestellen: de bestelapp in deze vormgeving (wens eigenaar 5 november 2026).
  ["bestellen", "Bestellen", "/bestellen/"],
];
