import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hours, dayNames, type Unit } from "../content/site";
import { paths } from "../routes";
import { live, longDate } from "../content/live";
import { useLiveVersion } from "../content/live-context";

// "Vandaag op het erf": per onderdeel de stand van vandaag, uitsluitend uit de centrale backoffice
// (/api/public/availability): weekrooster, gesloten dagen, afwijkende tijden, onderdelen aan/uit,
// pauzes „uit van … tot en met …” en de echte Ite-avonden. Zonder backofficegegevens tonen we geen
// verzonnen tijden of open/dicht (8 november 2026). De status wordt in de browser berekend (Amsterdamse tijd).
const units: { key: Unit; href: string; tone: string }[] = [
  { key: "speelboerderij", href: paths.speelboerderij, tone: "speel" },
  { key: "winkel", href: paths.winkel, tone: "winkel" },
  { key: "yte", href: paths.yte, tone: "yte" },
];

const hhmm = (s: string) => s.replace(":", ".");
function amsterdamNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

type Status = { open: boolean; text: string };
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();

/** Openingstijden van een onderdeel op een datum, volgens de backoffice. null = dicht. */
export function hoursOn(unit: Unit, date: string): [string, string] | null {
  if (live.off.has(unit) || live.closedDays.has(date)) return null;
  const p = live.pauses.get(unit);
  if (p && p.from <= date && date <= p.to) return null;
  // Ite: alleen de echte, boekbare avonden uit de planning.
  if (unit === "yte") return live.yteDates.get(date) ?? null;
  return live.special.get(date) ?? hours[unit].days[weekday(date)] ?? null;
}

/** Stand van vandaag. null zolang er geen backofficegegevens zijn: dan geen verzonnen open/dicht. */
export function statusFor(unit: Unit, now = amsterdamNow()): Status | null {
  if (!live.loaded) return null;
  if (live.off.has(unit)) return { open: false, text: "Op dit moment gesloten" };
  const today = hoursOn(unit, now.date);
  if (today && now.time < today[1]) {
    if (now.time >= today[0]) return { open: true, text: `Nu open, tot ${hhmm(today[1])} uur` };
    return { open: false, text: `Vandaag open vanaf ${hhmm(today[0])} uur` };
  }
  const closedNote = live.closedDays.get(now.date);
  const pause = live.pauses.get(unit);
  const prefix = closedNote ? `Vandaag gesloten: ${closedNote}. ` : pause && pause.from <= now.date && now.date <= pause.to ? `Gesloten tot en met ${longDate(pause.to)}. ` : "Nu dicht, ";
  const lower = prefix.endsWith(", ");
  for (let i = 1; i <= 120; i++) {
    const d = addDays(now.date, i), h = hoursOn(unit, d);
    if (!h) continue;
    const when = i === 1 ? "morgen" : i < 7 ? dayNames[weekday(d)] : `${dayNames[weekday(d)]} ${longDate(d)}`;
    return { open: false, text: `${prefix}${lower ? "weer" : "Weer"} open ${when} om ${hhmm(h[0])} uur` };
  }
  return { open: false, text: closedNote ? `Vandaag gesloten: ${closedNote}` : pause ? `Gesloten tot en met ${longDate(pause.to)}` : "Op dit moment gesloten" };
}

function schedule(unit: Unit) {
  if (live.off.has(unit)) return "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const open = order.filter((d) => hours[unit].days[d]);
  if (!open.length) return "";
  const first = open[0], last = open[open.length - 1];
  const [o, c] = hours[unit].days[first];
  const same = open.every((d) => hours[unit].days[d][0] === o && hours[unit].days[d][1] === c);
  if (open.length === 1) return `${dayNames[first]} ${hhmm(o)} tot ${hhmm(c)}`;
  if (same) return `${dayNames[first].slice(0, 2)} t/m ${dayNames[last].slice(0, 2)}, ${hhmm(o)} tot ${hhmm(c)}`;
  return hours[unit].note;
}

export function TodayBoard() {
  const [status, setStatus] = useState<Record<Unit, Status | null> | null>(null);
  const [day, setDay] = useState("");
  const version = useLiveVersion();
  useEffect(() => {
    const tick = () => {
      const now = amsterdamNow();
      setDay(dayNames[now.day]);
      setStatus({ speelboerderij: statusFor("speelboerderij", now), winkel: statusFor("winkel", now), yte: statusFor("yte", now) });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [version]);
  return (
    <section className="board" aria-labelledby="board-title">
      <div className="board__head">
        <h2 id="board-title" className="board__title">Vandaag op het erf</h2>
        <span className="board__day" aria-live="polite">{day}</span>
      </div>
      <ul className="board__list">
        {units.map(({ key, href, tone }) => {
          const s = status?.[key];
          return (
            <li key={key} className={`board__row board__row--${tone}`}>
              <Link to={href} className="board__link">
                <span className="board__name">{hours[key].label}</span>
                {live.loaded && schedule(key) ? <span className="board__sched">{schedule(key)}</span> : null}
                <span className={`board__state${s ? (s.open ? " is-open" : " is-closed") : ""}`}>
                  {s ? <span className="board__dot" aria-hidden="true" /> : null}
                  {s ? s.text : live.failed ? "Openingstijden nu niet op te halen. Bel ons gerust." : "Openingstijden laden…"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
