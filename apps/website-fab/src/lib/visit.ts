// Bezoek aan de speelboerderij als agenda-item (stap 3 van „het beste van twee werelden”). Pure functies zonder browser,
// zodat de tests ze los kunnen controleren (tests/website-combinatie.test.mjs). Alle tijden zijn Nederlandse tijd.
export type Block = { id: string; name: string; start: string; end: string };

export const clock = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const dayLabel = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")).replace(/^./, (c) => c.toUpperCase());
const stamp = (d: string, t: string) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
const icsText = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/**
 * Het bezoek als agenda-item. Zonder eindtijd: twee uur na de start, maar nooit over middernacht heen (dan 23:59).
 * Zonder tijden: 10:00–12:00. Een eindtijd die niet na de start ligt, wordt ook 23:59.
 */
export function visitEvent(date: string, b: Block, where: string, url: string) {
  const start = clock(b.start) ? b.start : "10:00";
  const twoHours = Number(start.slice(0, 2)) + 2;
  let end = clock(b.end) ? b.end : !clock(b.start) ? "12:00" : twoHours <= 23 ? String(twoHours).padStart(2, "0") + start.slice(2) : "23:59";
  if (end <= start) end = "23:59";
  return { title: "Bezoek aan Boer Bart · " + b.name, date, start, end, where, url, when: `${dayLabel(date)} · ${b.name} · ${start}–${end}` };
}
export type VisitEvent = ReturnType<typeof visitEvent>;

/** Agendabestand (ics) met de tijdzone Europe/Amsterdam erin, zodat de tijd overal goed staat. */
export function visitIcs(e: VisitEvent, uid: string, now = new Date()) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boer Bart//Bezoek//NL", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${uid}@boerbart`, "DTSTAMP:" + now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
    `DTSTART;TZID=Europe/Amsterdam:${stamp(e.date, e.start)}`, `DTEND;TZID=Europe/Amsterdam:${stamp(e.date, e.end)}`,
    "SUMMARY:" + icsText(e.title), "LOCATION:" + icsText(e.where), "DESCRIPTION:" + icsText("Meer informatie: " + e.url), "URL:" + e.url, "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
}

/**
 * Link naar Google Agenda. Bewust lokale tijden zonder „Z” plus ctz=Europe/Amsterdam: Google rekent dan zelf met
 * zomer- en wintertijd. Maak hier geen UTC-tijden van.
 */
export const visitGoogleUrl = (e: VisitEvent) => "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: stamp(e.date, e.start) + "/" + stamp(e.date, e.end), ctz: "Europe/Amsterdam", location: e.where, details: "Meer informatie: " + e.url }).toString();
