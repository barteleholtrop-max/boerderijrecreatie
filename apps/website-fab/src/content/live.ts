// Proef Boer Bart 2027 (wens eigenaar 4 november 2026): het ontwerp van StudioFab, maar met de gegevens uit de
// centrale backoffice (de enige bron). Openingstijden, gesloten dagen, Ite-momenten en contactgegevens komen live uit
// /api/public/availability. Lukt dat niet, dan blijven de vaste teksten uit site.ts staan.
import { site, hours, dayNames, prices, opbouw } from "./site";
import type { PageKey } from "../routes";

type Hours = { open: string; close: string } | null;
type Availability = {
  open?: { state: string; today: Hours; note: string; nextOpen: { date: string; weekday: string; open: string } | null };
  openingHours?: { weekday: string; hours: Hours }[];
  closedDays?: { date: string; note: string }[];
  yte?: { moments: { date: string; weekday: string; time: string }[]; end?: string };
  services?: Partial<Record<"speelboerderij" | "winkel" | "yte", boolean>>;
  servicePauses?: Partial<Record<"speelboerderij" | "winkel" | "yte", { from: string; to: string }>>;
  specialHours?: { date: string; open: string; close: string }[];
  contact?: { phone?: string; email?: string; whatsapp?: string; street?: string; postalCode?: string; city?: string };
  prices?: Partial<Record<"entreeKind" | "kinderfeest" | "schoolreisje" | "ite", number | null>>;
  /** Welke onderdelen nog in ontwikkeling zijn (backoffice → Website & uitstraling, 15 november 2026). */
  website?: { inOntwikkeling?: string[] };
};

/** Wat er live uit de backoffice komt; leeg zolang er niets geladen is. */
export const live = {
  loaded: false,
  /** true als de backoffice niet bereikbaar was: dan tonen we geen open/dicht (geen verzonnen tijden). */
  failed: false,
  closedDays: new Map<string, string>(),
  yteNext: [] as { date: string; time: string }[],
  /** Alle boekbare Ite-avonden (datum → [begin, eind]) uit de planning. */
  yteDates: new Map<string, [string, string]>(),
  /** Onderdeel uitgezet in de backoffice (vinkje Onderdelen aan of uit). */
  off: new Set<string>(),
  /** Onderdeel uit van … tot en met … */
  pauses: new Map<string, { from: string; to: string }>(),
  /** Datum met afwijkende openingstijden (speelboerderij en winkel). */
  special: new Map<string, [string, string]>(),
  /** Onderdelen in ontwikkeling volgens de backoffice; null = (nog) niet bekend, dan geldt de standaard uit site.ts. */
  inOntwikkeling: null as Set<string> | null,
};

// Onderdelen van de hoofdsite (wens eigenaar 15 november 2026): de eigenaar zet ze per stuk open of in ontwikkeling in de
// backoffice (Website & uitstraling). De sleutels zijn vast (apps/backoffice/lib/website-onderdelen.ts).
export type Onderdeel = "start" | "speelboerderij" | "yte" | "winkel" | "agenda" | "groepen" | "over" | "nieuws" | "vragen" | "contact" | "bestellen";
/** Pagina → onderdeel. Pagina's zonder onderdeel (privacy, Mijn Bloei, Bloeimarkt, verstuurd) zijn altijd open. */
export const onderdeelVan: Partial<Record<PageKey, Onderdeel>> = { home: "start", speelboerderij: "speelboerderij", yte: "yte", winkel: "winkel", agenda: "agenda", groepen: "groepen", over: "over", nieuws: "nieuws", vragen: "vragen", contact: "contact" };
/** Zonder gegevens uit de backoffice (vooraf opbouwen, storing): de standaard, nu alles in ontwikkeling. Niets beloven. */
export const inOntwikkeling = (o: Onderdeel) => (live.inOntwikkeling ? live.inOntwikkeling.has(o) : opbouw);
export const pageInOntwikkeling = (p: PageKey) => { const o = onderdeelVan[p]; return o ? inOntwikkeling(o) : false; };

const hhmm = (s: string) => s.replace(":", ".");
const plus3 = (t: string) => `${String((Number(t.slice(0, 2)) + 3) % 24).padStart(2, "0")}:${t.slice(3)}`;
export const longDate = (d: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

/** "Woensdag t/m zondag, 10.00 tot 18.00 uur." uit een weekrooster (0 = zondag). */
export function describe(days: Record<number, [string, string]>) {
  const order = [1, 2, 3, 4, 5, 6, 0], parts: string[] = [];
  let i = 0;
  while (i < order.length) {
    const d = order[i], h = days[d];
    if (!h) { i++; continue; }
    let j = i;
    while (j + 1 < order.length && days[order[j + 1]]?.[0] === h[0] && days[order[j + 1]]?.[1] === h[1]) j++;
    const name = j > i ? `${dayNames[d]} t/m ${dayNames[order[j]]}` : dayNames[d];
    parts.push(`${name} ${hhmm(h[0])} tot ${hhmm(h[1])} uur`);
    i = j + 1;
  }
  const text = parts.join(", ");
  return text ? text[0].toUpperCase() + text.slice(1) + "." : "Op dit moment gesloten.";
}

/** Neemt de backofficegegevens over in site en hours. Geeft true als er iets is overgenomen. */
/** Bedrag in centen als „€ 9” of „€ 62,50”; geen geldig bedrag = leeg (dan noemt de site geen prijs). */
export const euroText = (c: unknown) => typeof c === "number" && Number.isInteger(c) && c > 0 && c < 1_000_000
  ? "€ " + (c % 100 ? new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100) : String(c / 100)) : "";
export function applyAvailability(a: Availability) {
  // Tarieven uit Bedrijfsgegevens; wat daar leeg is, blijft hier leeg.
  const p = a.prices || {};
  prices.entreeKind = euroText(p.entreeKind); prices.kinderfeest = euroText(p.kinderfeest); prices.schoolreisje = euroText(p.schoolreisje);
  prices.yte = euroText(p.ite);
  const c = a.contact || {};
  if (c.phone) { site.phone = c.phone; site.phoneIntl = "+31" + c.phone.replace(/\D/g, "").replace(/^0/, ""); }
  if (c.email) site.email = c.email;
  if (c.whatsapp) site.whatsappEvents = c.whatsapp;
  if (c.street) site.street = c.street;
  if (c.postalCode) site.postalCode = c.postalCode;
  if (c.city) site.city = c.city;
  const week = a.openingHours || [];
  if (week.length) {
    // De backoffice kent één weekrooster voor de boerderij; speelboerderij en winkel volgen dat.
    const days: Record<number, [string, string]> = {};
    week.forEach((w, i) => { if (w.hours) days[(i + 1) % 7] = [w.hours.open, w.hours.close]; });
    for (const u of ["speelboerderij", "winkel"] as const) { hours[u].days = { ...days }; hours[u].seasonal = false; hours[u].note = describe(days); }
  }
  if (Array.isArray(a.website?.inOntwikkeling)) live.inOntwikkeling = new Set(a.website!.inOntwikkeling.filter((x) => typeof x === "string"));
  live.closedDays = new Map((a.closedDays || []).map((d) => [d.date, d.note]));
  live.off = new Set(Object.entries(a.services || {}).filter(([, on]) => on === false).map(([k]) => k));
  live.pauses = new Map(Object.entries(a.servicePauses || {}).filter(([, p]) => p).map(([k, p]) => [k, p!]));
  live.special = new Map((a.specialHours || []).map((h) => [h.date, [h.open, h.close] as [string, string]]));
  const moments = a.yte?.moments || [];
  const end = (t: string) => (a.yte?.end && a.yte.end > t ? a.yte.end : plus3(t));
  live.yteNext = moments.slice(0, 3).map((m) => ({ date: m.date, time: m.time }));
  live.yteDates = new Map(moments.map((m) => [m.date, [m.time, end(m.time)] as [string, string]]));
  // Het weekrooster van Ite volgt alleen uit de echte avonden; geen avonden = geen vaste dag meer tonen.
  const yteDays: Record<number, [string, string]> = {};
  for (const m of moments) yteDays[new Date(m.date + "T12:00:00Z").getUTCDay()] = [m.time, end(m.time)];
  hours.yte.days = yteDays; hours.yte.seasonal = false;
  if (moments.length) {
    hours.yte.note = `Op reservering. Eerstvolgende avond: ${longDate(moments[0].date)} om ${hhmm(moments[0].time)} uur.`;
  } else {
    hours.yte.note = "Er staan nu geen avonden open. Laat je gegevens achter, dan hoor je het als er weer plek is.";
  }
  // Pauze of uitgezet: dat zegt de tekst bij het onderdeel ook, zodat geen pagina „open” belooft.
  for (const u of ["speelboerderij", "winkel", "yte"] as const) {
    const p = live.pauses.get(u);
    if (live.off.has(u)) hours[u].note = "Op dit moment gesloten.";
    else if (p && p.to >= today()) hours[u].note = `Gesloten van ${longDate(p.from)} tot en met ${longDate(p.to)}. ` + hours[u].note;
  }
  live.loaded = true; live.failed = false;
  return true;
}

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

/** De openingstijden van een onderdeel zoals de backoffice ze geeft; zonder backoffice geen verzonnen tijden. */
export function openText(unit: "speelboerderij" | "winkel" | "yte") {
  if (live.loaded) return hours[unit].note;
  return live.failed ? "Openingstijden nu niet op te halen. Bel ons gerust." : "Actuele openingstijden worden geladen…";
}

export async function loadLive() {
  try {
    const r = await fetch("/api/public/availability", { cache: "no-store" });
    if (!r.ok) throw new Error("Backoffice niet bereikbaar");
    return applyAvailability(await r.json());
  } catch (e) {
    if (!live.loaded) live.failed = true;
    throw e;
  }
}
