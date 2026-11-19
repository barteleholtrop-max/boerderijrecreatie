// Ite aanvragen (wens eigenaar 5 november 2026: de functies van onze website in deze vormgeving, stap 4).
// De avonden komen live uit de backoffice (/api/public/availability → yte.moments). De aanvraag gaat naar
// /api/public/yte-requests, dezelfde deur als op onze eigen website: hij komt in Planning als „aanvraag” op de
// klantenkaart met hetzelfde e-mailadres. Er wordt nog niets vastgezet; het team bevestigt zelf.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { paths } from "../routes";
import { dayLabel, visitIcs, visitGoogleUrl, type VisitEvent } from "../lib/visit";

type Moment = { date: string; time: string };
type Done = { name: string; date: string; from: string; to: string; people: number };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));

/** De aangevraagde avond als agenda-item (Nederlandse tijd), met dezelfde agendafuncties als het speelboerderijbezoek. */
function yteEvent(d: Done, where: string, url: string): VisitEvent {
  const end = isTime(d.to) && d.to > d.from ? d.to : "23:59";
  return { title: "Ite by Boer Bart", date: d.date, start: d.from, end, where, url, when: `${dayLabel(d.date)} om ${d.from}` };
}
function download(e: VisitEvent, uid: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([visitIcs(e, uid)], { type: "text/calendar;charset=utf-8" }));
  a.download = `ite-boer-bart-${e.date}.ics`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function YteRequest() {
  const [moments, setMoments] = useState<Moment[] | null>(null), [failed, setFailed] = useState(false), [weeks, setWeeks] = useState(8);
  const [where, setWhere] = useState("Boer Bart, Rotstergaast");
  const [picked, setPicked] = useState<Moment | null>(null), [people, setPeople] = useState(2), [sharing, setSharing] = useState<"" | "ja" | "nee">("");
  const [requestId, setRequestId] = useState(uuid), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    fetch("/api/public/availability", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((a: { yte?: { moments?: Moment[]; weeksAhead?: number }; contact?: { street?: string; postalCode?: string; city?: string } }) => {
        setMoments((a.yte?.moments || []).filter((m) => m && isDay(m.date) && isTime(m.time)));
        if (Number.isInteger(a.yte?.weeksAhead)) setWeeks(a.yte!.weeksAhead!);
        const c = a.contact || {}, place = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        if (place) setWhere("Boer Bart, " + place);
      }).catch(() => setFailed(true));
  }, []);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); if (busy) return;
    if (!picked) { setError("Kies eerst een avond."); return; }
    if (!sharing) { setError("Laat ons weten of jullie het leuk vinden om aan te schuiven bij andere gasten."); return; }
    const f = new FormData(ev.currentTarget), val = (k: string) => String(f.get(k) || "");
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/public/yte-requests", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requestId, date: picked.date, time: picked.time, people, name: val("name"), email: val("email"), phone: val("phone"), wishes: val("wishes"), sharing: sharing === "ja", consent: f.get("consent") === "on", website: val("website") }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b.error || "Je aanvraag kon nu niet worden verstuurd. Probeer het opnieuw."); if (r.status === 409) setRequestId(uuid()); return; }
      setDone({ name: b.name || val("name"), date: b.date || picked.date, from: b.from || picked.time, to: b.to || "", people: b.people || people });
    } catch { setError("Geen verbinding. Je aanvraag is niet verstuurd; probeer het opnieuw."); }
    finally { setBusy(false); }
  }

  if (done) {
    const e = yteEvent(done, where, location.origin + paths.yte);
    return (
      <div className="yte-done" role="status">
        <p className="eyebrow">Aanvraag ontvangen</p>
        <h3 className="h3">Tige tank, {done.name}!</h3>
        <p>Ite by Boer Bart · <b>{e.when}</b> · {done.people} {done.people === 1 ? "persoon" : "personen"}</p>
        <p>We bevestigen je reservering zo snel mogelijk per e-mail of telefoon.</p>
        <div className="planner__actions">
          <button type="button" className="btn btn--small" onClick={() => download(e, requestId)}><Icon name="calendar" />Zet in je agenda</button>
          <a className="btn btn--small btn--ghost" href={visitGoogleUrl(e)} target="_blank" rel="noopener">Google Agenda</a>
        </div>
      </div>
    );
  }
  if (failed) return <p className="note"><Icon name="info" />De avonden zijn nu niet te laden. Probeer het later opnieuw, of <Link to={`${paths.contact}?onderwerp=yte#bezoek`}>neem contact met ons op</Link>.</p>;
  if (!moments) return <p className="note">Beschikbare avonden laden…</p>;
  if (!moments.length) return <p className="note"><Icon name="info" />Er staan de komende weken geen avonden open. <Link to={`${paths.contact}?onderwerp=yte#bezoek`}>Laat je gegevens achter</Link>, dan hoor je het als er weer plek is.</p>;

  return (
    <form className="form yte-form" onSubmit={submit}>
      <p className="hp"><label>Niet invullen <input name="website" tabIndex={-1} autoComplete="off" /></label></p>
      <fieldset className="field">
        <legend>Kies een avond</legend>
        <div className="yte-moments" role="group">
          {moments.map((m) => { const on = picked?.date === m.date && picked.time === m.time;
            return <button type="button" key={m.date + m.time} className={"yte-moment" + (on ? " is-on" : "")} aria-pressed={on} onClick={() => { setPicked(m); setError(""); }}><span>{dayLabel(m.date)}</span><b>{m.time} uur</b></button>; })}
        </div>
        <p className="small muted">Je ziet alleen de avonden waarop nog geboekt kan worden, tot {weeks} weken vooruit.</p>
      </fieldset>
      <div className="field-row">
        <div className="field">
          <label htmlFor="yte-people">Met hoeveel personen?</label>
          <select id="yte-people" value={people} onChange={(e) => setPeople(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="field">
        <legend>Vinden jullie het leuk om aan te schuiven bij andere gasten?</legend>
        <p className="small muted">Bij Ite zit je soms samen aan een lange tafel. Gezellig, maar niet verplicht.</p>
        <div className="radios">
          <label><input type="radio" name="sharing" value="ja" checked={sharing === "ja"} onChange={() => setSharing("ja")} />Ja, gezellig</label>
          <label><input type="radio" name="sharing" value="nee" checked={sharing === "nee"} onChange={() => setSharing("nee")} />Liever een eigen tafel</label>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="yte-wishes">Allergieën of dieetwensen</label>
        <textarea id="yte-wishes" name="wishes" rows={3} maxLength={1000} placeholder="Laat ons weten waar we rekening mee mogen houden" />
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="yte-name">Naam</label><input id="yte-name" name="name" required minLength={2} maxLength={120} autoComplete="name" /></div>
        <div className="field"><label htmlFor="yte-phone">Telefoon</label><input id="yte-phone" name="phone" type="tel" required minLength={8} maxLength={30} autoComplete="tel" inputMode="tel" /></div>
      </div>
      <div className="field"><label htmlFor="yte-email">E-mail</label><input id="yte-email" name="email" type="email" required maxLength={200} autoComplete="email" /></div>
      <label className="agenda__consent"><input type="checkbox" name="consent" required /> Boer Bart mag mijn gegevens gebruiken voor deze reservering en om contact met mij op te nemen.</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Versturen…" : "Reservering aanvragen"}<Icon name="arrow" /></button>
      <p className="small muted">Je aanvraag gaat naar ons team. We bevestigen je reservering zo snel mogelijk.</p>
    </form>
  );
}
