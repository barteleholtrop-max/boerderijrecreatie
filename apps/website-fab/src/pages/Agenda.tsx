// Agenda (wens eigenaar 5 november 2026: de functies van onze website in deze vormgeving, stap 2).
// Evenementen live uit de backoffice (/api/public/availability), met aanmelden (/api/public/event-signups) en, bij een
// betaald evenement met online betalen, betalen via Mollie (/api/public/payments {aanmelding}). Na het betalen komt de gast
// terug op /agenda/?aanmelding=…; de backoffice controleert de betaling zelf bij Mollie. Geen eigen prijzen of data hier.
import { useEffect, useState, type FormEvent } from "react";
import { Seo } from "../components/Seo";
import { PageHero } from "../components/Blocks";
import { Icon } from "../components/Icon";
import { paths } from "../routes";

type Ev = { id: string; date: string; start: string; end: string; title: string; description: string; example?: boolean;
  signup?: { open: boolean; spotsLeft: number | null }; priceCents?: number; paymentInfo?: string; payOnline?: boolean; photo?: string | null };
type Receipt = { paid?: boolean; holdExpired?: boolean; title?: string; date?: string; from?: string; to?: string; name?: string; people?: number; amountCents?: number; error?: string };

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const day = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const clock = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const when = (e: Ev) => day(e.date) + (clock(e.start) ? `, ${e.start}${clock(e.end) ? "–" + e.end : ""} uur` : "");
const price = (e: Ev) => (Number.isInteger(e.priceCents) && (e.priceCents || 0) > 0 ? (e.priceCents as number) : 0);
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));

/** Agendabestand voor één evenement (Nederlandse tijd), zoals bij het bezoek op onze website. */
function icsFor(e: Ev, where: string) {
  const stamp = (d: string, t: string) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
  const txt = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const start = clock(e.start) ? e.start : "10:00", end = clock(e.end) ? e.end : start;
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boer Bart//Agenda//NL", "BEGIN:VEVENT", `UID:${e.id}@boerbart`, "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
    `DTSTART;TZID=Europe/Amsterdam:${stamp(e.date, start)}`, `DTEND;TZID=Europe/Amsterdam:${stamp(e.date, end)}`, "SUMMARY:" + txt(e.title + " · Boer Bart"), "LOCATION:" + txt(where),
    "DESCRIPTION:" + txt(e.description || "Meer informatie: " + location.origin + paths.agenda), "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
}
function download(e: Ev, where: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([icsFor(e, where)], { type: "text/calendar;charset=utf-8" }));
  a.download = `boer-bart-${e.date}.ics`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function Agenda() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [where, setWhere] = useState("Boer Bart, Rotstergaast");
  const [mail, setMail] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; r: Receipt | null; busy: boolean } | null>(null);
  const load = () => fetch("/api/public/availability", { headers: { Accept: "application/json" }, cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((a: { events?: Ev[]; confirmationMail?: boolean; contact?: { street?: string; postalCode?: string; city?: string } }) => {
      const t = today();
      setEvents((a.events || []).filter((e) => e && e.date >= t && typeof e.title === "string").sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)));
      setMail(!!a.confirmationMail);
      const c = a.contact || {}, place = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      if (place) setWhere("Boer Bart, " + place);
    }).catch(() => setFailed(true));
  const check = async (id: string) => {
    setReceipt({ id, r: null, busy: true });
    try { const r = await fetch("/api/public/payments?aanmelding=" + encodeURIComponent(id), { cache: "no-store", headers: { Accept: "application/json" } }); const b = await r.json().catch(() => ({}));
      setReceipt({ id, r: r.ok ? b : { error: b.error || "De stand van je betaling is nu niet op te halen." }, busy: false }); if (r.ok && b.paid) load(); }
    catch { setReceipt({ id, r: { error: "Geen verbinding. Probeer het zo opnieuw." }, busy: false }); }
  };
  // Betaling niet afgerond, plaats nog vastgehouden: opnieuw naar Mollie.
  const payAgain = async (id: string) => {
    const p = await fetch("/api/public/payments", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ aanmelding: id, page: paths.agenda }) }).catch(() => null);
    const b = p ? await p.json().catch(() => ({})) : {};
    if (p?.ok && b.checkoutUrl) { location.assign(b.checkoutUrl); return; }
    if (p?.ok && b.paid) { void check(id); return; }
    setReceipt({ id, r: { error: b.error || "Betalen lukt nu niet. Probeer het zo opnieuw." }, busy: false });
  };
  useEffect(() => {
    load();
    // Terug van Mollie: de stand bij de backoffice opvragen.
    const id = new URLSearchParams(location.search).get("aanmelding");
    if (id && /^[0-9a-f-]{36}$/.test(id)) { history.replaceState(null, "", location.pathname); void check(id); }
  }, []);

  return (
    <>
      <Seo page="agenda" title="Agenda Boer Bart | Evenementen op de boerderij in Rotstergaast" image="/og/boerbart.jpg"
        desc="Wat er te doen is bij Boer Bart: evenementen, workshops en feesten op de boerderij in Rotstergaast. Meld je direct online aan."
        crumbs={[{ name: "Agenda", path: paths.agenda }]} />
      <PageHero eyebrow="Agenda" title="Wat er te doen is op het erf" photo="hooiwagen" alt="De hooiwagen op het erf van Boer Bart"
        lead={<p>Van lammetjesdag tot boerenmarkt: hier staat alles wat er de komende tijd op de boerderij gebeurt. Meld je meteen aan, dan houden we een plek voor je vrij.</p>} />
      <section className="section section--tight">
        <div className="wrap">
          {receipt && <PaymentNote state={receipt} retry={() => check(receipt.id)} pay={() => payAgain(receipt.id)} />}
          {failed ? <p className="note"><Icon name="info" />De agenda is nu niet te laden. Probeer het later opnieuw.</p>
            : !events ? <p className="note">De agenda wordt geladen…</p>
            : !events.length ? <p className="note"><Icon name="info" />Er staan nu geen evenementen gepland. Kijk binnenkort nog eens, of volg ons op Instagram.</p>
            : <ol className="agenda">{events.map((e) => (
              <li key={e.id} className="agenda__item">
                <div className="agenda__date" aria-hidden="true"><b>{new Date(e.date + "T12:00:00Z").getUTCDate()}</b><span>{new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" }).format(new Date(e.date + "T12:00:00Z"))}</span></div>
                <div className="agenda__body">
                  {e.photo && <img className="agenda__photo" src={e.photo} alt="" loading="lazy" />}
                  <h2 className="h3 agenda__title">{e.title}</h2>
                  <p className="agenda__when"><Icon name="clock" />{when(e).replace(/^./, (c) => c.toUpperCase())}</p>
                  {e.description && <p className="agenda__text">{e.description}</p>}
                  <p className="agenda__meta">
                    {price(e) ? <span>{euro(price(e))} per persoon{e.payOnline ? " · online betalen" : ""}</span> : <span>Gratis</span>}
                    {e.signup?.open && e.signup.spotsLeft != null && <span>Nog {e.signup.spotsLeft} {e.signup.spotsLeft === 1 ? "plaats" : "plaatsen"}</span>}
                    {e.signup && !e.signup.open && e.signup.spotsLeft === 0 && <span className="agenda__full">Vol</span>}
                  </p>
                  <div className="agenda__actions">
                    {e.signup?.open && !e.example && open !== e.id && <button type="button" className="btn btn--small" onClick={() => setOpen(e.id)}>Aanmelden</button>}
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => download(e, where)}><Icon name="calendar" />In je agenda</button>
                  </div>
                  {open === e.id && <Signup e={e} mail={mail} close={() => setOpen(null)} reload={load} />}
                </div>
              </li>))}</ol>}
        </div>
      </section>
    </>
  );
}

function Signup({ e, mail, close, reload }: { e: Ev; mail: boolean; close: () => void; reload: () => void }) {
  const [requestId, setRequestId] = useState(uuid), [people, setPeople] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<{ name: string; people: number } | null>(null);
  const max = Math.min(20, e.signup?.spotsLeft ?? 20);
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); if (busy) return; setBusy(true); setError("");
    const f = new FormData(ev.currentTarget), val = (k: string) => String(f.get(k) || "");
    try {
      const r = await fetch("/api/public/event-signups", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requestId, eventId: e.id, name: val("name"), email: val("email"), phone: val("phone"), people, note: val("note"), consent: f.get("consent") === "on", website: val("website") }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b.error || "Je aanmelding kon nu niet worden verstuurd. Probeer het opnieuw."); if (r.status === 409) setRequestId(uuid()); return; }
      if (b.pay) {
        // Betaald evenement met online betalen: door naar Mollie; terug op /agenda/?aanmelding=…
        const p = await fetch("/api/public/payments", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ aanmelding: requestId, page: paths.agenda }) });
        const pb = await p.json().catch(() => ({}));
        if (p.ok && pb.checkoutUrl) { location.assign(pb.checkoutUrl); return; }
        setError(pb.error || "Je aanmelding is ontvangen, maar betalen lukt nu niet. Je plaats houden we 60 minuten vast; probeer het zo opnieuw."); return;
      }
      setDone({ name: b.name || val("name"), people: b.people || people }); reload();
    } catch { setError("Geen verbinding. Je aanmelding is niet verstuurd; probeer het opnieuw."); }
    finally { setBusy(false); }
  }
  if (done) return (
    <div className="agenda__done" role="status">
      <h3 className="h3">Tige tank, {done.name}!</h3>
      <p>Je aanmelding voor <b>{e.title}</b> op {when(e)} is ontvangen, voor {done.people} {done.people === 1 ? "persoon" : "personen"}.
        {price(e) ? <> Kosten: <b>{euro(price(e) * done.people)}</b>. {e.paymentInfo || "Hoe je betaalt, laten we je nog weten."}</> : null}</p>
      <p>{mail ? "Je ontvangt ook een bevestiging per e-mail. " : ""}We kijken ernaar uit. Kun je toch niet? Laat het ons even weten.</p>
      <button type="button" className="btn btn--small btn--ghost" onClick={close}>Sluiten</button>
    </div>
  );
  return (
    <form className="form agenda__form" onSubmit={submit}>
      <p className="hp"><label>Niet invullen <input name="website" tabIndex={-1} autoComplete="off" /></label></p>
      <div className="field-row">
        <div className="field"><label htmlFor={`naam-${e.id}`}>Naam</label><input id={`naam-${e.id}`} name="name" required minLength={2} maxLength={120} autoComplete="name" /></div>
        <div className="field"><label htmlFor={`mail-${e.id}`}>E-mail</label><input id={`mail-${e.id}`} name="email" type="email" required maxLength={200} autoComplete="email" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor={`tel-${e.id}`}>Telefoon (mag leeg)</label><input id={`tel-${e.id}`} name="phone" type="tel" maxLength={40} autoComplete="tel" /></div>
        <div className="field"><label htmlFor={`aantal-${e.id}`}>Aantal personen</label><input id={`aantal-${e.id}`} name="people" type="number" min={1} max={max} required value={people} onChange={(x) => setPeople(Math.max(1, Math.min(max, Number(x.target.value) || 1)))} /></div>
      </div>
      {price(e) > 0 && <p className="agenda__total">Totaal: <b>{euro(price(e) * people)}</b> ({people} × {euro(price(e))}){e.payOnline ? " · je betaalt direct online, je plaats houden we 60 minuten vast" : e.paymentInfo ? " · " + e.paymentInfo : ""}</p>}
      <div className="field"><label htmlFor={`opm-${e.id}`}>Opmerking (mag leeg)</label><textarea id={`opm-${e.id}`} name="note" maxLength={1000} rows={3} /></div>
      <label className="agenda__consent"><input name="consent" type="checkbox" required /> Boer Bart mag mijn gegevens gebruiken voor deze aanmelding.</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="agenda__actions">
        <button className="btn" disabled={busy}>{busy ? "Even geduld…" : e.payOnline && price(e) ? "Aanmelden en betalen" : "Aanmelden"}</button>
        <button type="button" className="btn btn--ghost" onClick={close} disabled={busy}>Annuleren</button>
      </div>
    </form>
  );
}

function PaymentNote({ state, retry, pay }: { state: { r: Receipt | null; busy: boolean }; retry: () => void; pay: () => void }) {
  const r = state.r;
  if (state.busy || !r) return <p className="note" role="status">De stand van je betaling wordt opgehaald…</p>;
  if (r.error) return <p className="note" role="alert"><Icon name="info" />{r.error} <button type="button" className="btn btn--small btn--ghost" onClick={retry}>Opnieuw</button></p>;
  const what = <><b>{r.title || "het evenement"}</b>{r.date ? " op " + day(r.date) + (r.from ? `, ${r.from}${r.to ? "–" + r.to : ""} uur` : "") : ""}</>;
  if (r.paid) return <div className="agenda__done" role="status"><h3 className="h3">Tige tank, {r.name}!</h3><p>Je hebt betaald{r.amountCents ? ` (${euro(r.amountCents)})` : ""} en je plek voor {what} staat vast, voor {r.people || 1} {r.people === 1 ? "persoon" : "personen"}.</p></div>;
  if (r.holdExpired) return <p className="note" role="alert"><Icon name="info" />Je betaling is niet afgerond en je plek voor {what} is vrijgegeven. Meld je opnieuw aan als er nog plaats is.</p>;
  return <p className="note" role="status"><Icon name="info" />Je betaling voor {what} is nog niet afgerond. <button type="button" className="btn btn--small" onClick={pay}>Betalen</button> <button type="button" className="btn btn--small btn--ghost" onClick={retry}>Opnieuw controleren</button></p>;
}
