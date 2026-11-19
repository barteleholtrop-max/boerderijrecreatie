// Speelboerderij plannen (wens eigenaar 5 november 2026: de functies van onze website in deze vormgeving, stap 3).
// Dagen en tijdblokken komen live uit de planning van de backoffice (/api/public/availability → visit). De gast kiest een
// dag, een tijdblok en met hoeveel ze komen, en zet het bezoek in de eigen agenda of deelt het met vrienden.
// Er wordt niets naar een server gestuurd en niets gereserveerd, net als op onze eigen website.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { paths } from "../routes";
import { clock, dayLabel, visitEvent, visitIcs, visitGoogleUrl, type Block, type VisitEvent } from "../lib/visit";

type Visit = { blocks: Block[]; days: string[] };

const isoDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const blockLabel = (b: Block) => b.name + (clock(b.start) && clock(b.end) ? ` · ${b.start}–${b.end}` : "");
function downloadIcs(e: VisitEvent) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([visitIcs(e, `bezoek-${e.date}-${e.start.replace(":", "")}-${Math.random().toString(36).slice(2)}`)], { type: "text/calendar;charset=utf-8" }));
  a.download = `bezoek-boer-bart-${e.date}.ics`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function VisitPlanner() {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [failed, setFailed] = useState(false);
  const [where, setWhere] = useState("Boer Bart, Rotstergaast");
  const [date, setDate] = useState(""), [blockId, setBlockId] = useState("");
  const [children, setChildren] = useState(""), [others, setOthers] = useState("");
  const [shown, setShown] = useState(false), [error, setError] = useState(""), [shareNote, setShareNote] = useState<{ text: string; wa?: string } | null>(null);

  useEffect(() => {
    fetch("/api/public/availability", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((a: { visit?: Visit; contact?: { street?: string; postalCode?: string; city?: string } }) => {
        const v = a.visit;
        setVisit(v && Array.isArray(v.blocks) && Array.isArray(v.days)
          ? { blocks: v.blocks.filter((b) => b && /^[a-z0-9-]+$/i.test(b.id) && typeof b.name === "string"), days: v.days.filter(isoDay) }
          : { blocks: [], days: [] });
        const c = a.contact || {}, place = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        if (place) setWhere("Boer Bart, " + place);
      }).catch(() => setFailed(true));
  }, []);

  const block = visit?.blocks.find((b) => b.id === blockId);
  const ev = block && isoDay(date) && visit?.days.includes(date) ? visitEvent(date, block, where, location.origin + paths.speelboerderij) : null;
  const count = (v: string) => (v === "" ? 0 : Number(v));
  const validCount = (v: string) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 50);

  function show(e: React.FormEvent) {
    e.preventDefault(); setShareNote(null);
    if (!ev) { setError("Kies een dag en een tijdblok."); return; }
    if (!validCount(children) || !validCount(others) || count(children) + count(others) < 1) { setError("Vul in met hoeveel kinderen en andere gasten jullie komen (samen minstens 1)."); return; }
    setError(""); setShown(true);
  }
  async function share() {
    if (!ev) return;
    const text = `Wij gaan naar Boer Bart! ${ev.when}. Ga je mee?`;
    try { if (navigator.share) { await navigator.share({ title: ev.title, text, url: ev.url }); return; } }
    catch (err) { if (err instanceof Error && err.name === "AbortError") return; }
    // Geen deelknop op dit apparaat: tekst kopiëren, of via WhatsApp.
    const wa = "https://wa.me/?text=" + encodeURIComponent(text + " " + ev.url);
    try { await navigator.clipboard.writeText(text + " " + ev.url); setShareNote({ text: "Tekst gekopieerd. Plak hem in een bericht, of ", wa }); }
    catch { window.open(wa, "_blank", "noopener"); }
  }

  if (failed) return <p className="note"><Icon name="info" />De dagen en tijdblokken zijn nu niet te laden. Probeer het later opnieuw, of <Link to={`${paths.contact}?onderwerp=bezoek#bezoek`}>neem contact met ons op</Link>.</p>;
  if (!visit) return <p className="note">Beschikbare dagen laden…</p>;
  if (!visit.blocks.length || !visit.days.length) return <p className="note"><Icon name="info" />Er zijn nu geen dagen of tijdblokken te kiezen. <Link to={`${paths.contact}?onderwerp=bezoek#bezoek`}>Neem gerust contact met ons op</Link>.</p>;

  return (
    <div className="planner">
      <form className="form planner__form" onSubmit={show} onChange={() => setShown(false)}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="plan-dag">Welke dag?</label>
            <select id="plan-dag" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">Kies een dag</option>
              {visit.days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="plan-blok">Welk tijdblok?</label>
            <select id="plan-blok" value={blockId} onChange={(e) => setBlockId(e.target.value)}>
              <option value="">Kies een tijdblok</option>
              {visit.blocks.map((b) => <option key={b.id} value={b.id}>{blockLabel(b)}</option>)}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="plan-kinderen">Hoeveel kinderen komen er spelen?</label>
            <input id="plan-kinderen" type="number" min={0} max={50} step={1} inputMode="numeric" value={children} onChange={(e) => setChildren(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="plan-anderen">Hoeveel andere gasten komen mee?</label>
            <input id="plan-anderen" type="number" min={0} max={50} step={1} inputMode="numeric" value={others} onChange={(e) => setOthers(e.target.value)} />
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn">Bekijk jullie bezoek<Icon name="arrow" /></button>
      </form>

      {shown && ev && (
        <div className="planner__result" role="status">
          <p className="eyebrow">Jullie bezoek</p>
          <h3 className="h3">{ev.when}</h3>
          <p>{count(children)} {count(children) === 1 ? "kind" : "kinderen"} · {count(others)} {count(others) === 1 ? "andere gast" : "andere gasten"}</p>
          <div className="planner__actions">
            <button type="button" className="btn btn--small" onClick={() => downloadIcs(ev)}><Icon name="calendar" />Zet in je agenda</button>
            <a className="btn btn--small btn--ghost" href={visitGoogleUrl(ev)} target="_blank" rel="noopener">Google Agenda</a>
            <button type="button" className="btn btn--small btn--ghost" onClick={share}>Delen met vrienden</button>
          </div>
          {shareNote && <p className="small">{shareNote.text}<a href={shareNote.wa} target="_blank" rel="noopener">deel via WhatsApp</a>.</p>}
          <p className="small muted">Dagen en tijdblokken komen uit onze planning. Er wordt nog niets gereserveerd. Kom je met een grote groep of wil je zeker zijn van een plek? <Link to={`${paths.contact}?onderwerp=bezoek#bezoek`}>Laat het ons weten</Link>.</p>
        </div>
      )}
    </div>
  );
}
