// „Binnenkort op het erf” op de homepage: de eerstvolgende drie evenementen uit de backoffice, met een link naar de agenda.
// Leeg of niet te laden: dan verschijnt dit blok niet (de rest van de pagina blijft gelijk).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { paths } from "../routes";

type Ev = { id: string; date: string; start: string; end: string; title: string; example?: boolean };
const day = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")).replace(/^./, (c) => c.toUpperCase());

export function Upcoming() {
  const [events, setEvents] = useState<Ev[]>([]);
  useEffect(() => {
    const t = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
    fetch("/api/public/availability", { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null))
      .then((a) => setEvents(((a?.events || []) as Ev[]).filter((e) => e.date >= t).sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)).slice(0, 3)))
      .catch(() => {});
  }, []);
  if (!events.length) return null;
  return (
    <section className="section section--tight">
      <div className="wrap">
        <p className="eyebrow">Binnenkort op het erf</p>
        <h2 className="h2">Agenda</h2>
        <ul className="upcoming">
          {events.map((e) => (
            <li key={e.id}><Link to={paths.agenda}><span className="upcoming__day">{day(e.date)}{e.start ? ` · ${e.start}` : ""}</span><span className="upcoming__title">{e.title}</span><Icon name="arrow" /></Link></li>
          ))}
        </ul>
        <Link className="btn btn--ghost" to={paths.agenda}>Hele agenda en aanmelden<Icon name="arrow" /></Link>
      </div>
    </section>
  );
}
