import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Seo, businessNode } from "../components/Seo";
import { Icon } from "../components/Icon";
import { site, hours } from "../content/site";
import { openText } from "../content/live";
import { paths } from "../routes";

// Proef Boer Bart 2027: de aanvraag gaat naar de backoffice (Gesprekken, aanvragen & klanten), via dezelfde deur als
// „Groepen & feesten” op de eigen website (/api/public/group-requests). Bij kinderfeest, schoolreisje en groep krijgt de gast
// direct een indicatie op de datum; er wordt niets vastgehouden. Opnieuw proberen maakt geen tweede aanvraag (requestId).
const GROUP = new Set(["kinderfeest", "schoolreisje", "groep"]);
type Indication = { state: string; message: string; alternatives: string[] };
const topics: [string, string][] = [
  ["bezoek", "Bezoek aan de speelboerderij"],
  ["yte", "Een tafel bij Ite"],
  ["kinderfeest", "Kinderfeest"],
  ["schoolreisje", "Schoolreisje"],
  ["groep", "Groep, feest of uitje"],
  ["vraag", "Een andere vraag"],
];

export function Contact() {
  const { search } = useLocation();
  const [topic, setTopic] = useState("bezoek");
  const [allergy, setAllergy] = useState("nee");
  const navigate = useNavigate();
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  const [date, setDate] = useState(""), [people, setPeople] = useState("");
  const [indication, setIndication] = useState<Indication | null>(null);
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  // Direct antwoord op de datum (alleen groepen), uit de planning van de backoffice.
  useEffect(() => {
    setIndication(null);
    if (!GROUP.has(topic) || !date) return;
    const t = window.setTimeout(() => {
      fetch(`/api/public/group-requests?datum=${date}&personen=${Number(people) || 1}`).then((r) => r.json()).then((d) => setIndication(d.state ? d : d.error ? { state: "fout", message: d.error, alternatives: [] } : null)).catch(() => {});
    }, 300);
    return () => window.clearTimeout(t);
  }, [topic, date, people]);
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), v = (k: string) => String(f.get(k) || "").trim();
    if (v("website")) return;
    const label = topics.find(([k]) => k === topic)?.[1] || topic, group = GROUP.has(topic);
    const extra = [!group && date ? `Gewenste datum: ${date}` : "", !group && people ? `Aantal: ${people}` : "", v("allergie") === "ja" ? `Allergie of dieetwens: ${v("allergie_toelichting") || "ja"}` : ""].filter(Boolean);
    const wishes = [v("bericht"), ...extra].filter(Boolean).join("\n") || label;
    setSending(true); setError("");
    try {
      const r = await fetch("/api/public/group-requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, activity: label, name: v("naam"), email: v("email"), phone: v("telefoon"), date: group ? date : "", people: group && people ? Number(people) : null, wishes }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Versturen lukte niet. Probeer het opnieuw; je tekst blijft staan.");
      navigate(paths.verstuurd);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Versturen lukte niet. Probeer het opnieuw; je tekst blijft staan.");
    } finally { setSending(false); }
  }
  useEffect(() => {
    const t = new URLSearchParams(search).get("onderwerp");
    if (t && topics.some(([k]) => k === t)) setTopic(t);
  }, [search]);
  const withDate = topic !== "lid" && topic !== "vraag";
  return (
    <>
      <Seo
        page="contact"
        title="Contact en route | Boer Bart, Schoterweg 26 Rotstergaast"
        desc="Plan je bezoek aan Boer Bart in Rotstergaast. Vraag een tafel, kinderfeest of schoolreisje aan, of stel je vraag. Bel 06 54 60 20 41 of mail Rianne."
        crumbs={[{ name: "Contact", path: paths.contact }]}
        jsonld={[businessNode()]}
      />
      <section className="section section--top">
        <div className="wrap contact">
          <div className="contact__info">
            <p className="eyebrow">Contact en route</p>
            <h1 className="h1">Plan je bezoek</h1>
            <p className="lead">Laat ons weten wanneer je komt en met hoeveel. Wij bevestigen je aanvraag zo snel mogelijk per mail of telefoon.</p>
            <ul className="contact__list">
              <li><Icon name="pin" /><span>{site.street}<br />{site.postalCode} {site.city}<br /><a href={site.mapsUrl} rel="noopener">Route plannen</a></span></li>
              <li><Icon name="phone" /><a href={`tel:${site.phoneIntl}`}>{site.phone}</a></li>
              <li><Icon name="mail" /><a href={`mailto:${site.email}`}>{site.email}</a></li>
            </ul>
            <h2 className="h3">Openingstijden</h2>
            <dl className="hours">
              {(["speelboerderij", "winkel", "yte"] as const).map((u) => (
                <div key={u}><dt>{hours[u].label}</dt><dd>{openText(u)}</dd></div>
              ))}
            </dl>
          </div>

          <form className="form" id="bezoek" name="aanvraag" onSubmit={send}>
            <p className="hp"><label>Niet invullen <input name="website" tabIndex={-1} autoComplete="off" /></label></p>
            <div className="field">
              <label htmlFor="onderwerp">Waar gaat het over?</label>
              <select id="onderwerp" name="onderwerp" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {topics.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="naam">Naam</label>
                <input id="naam" name="naam" autoComplete="name" required />
              </div>
              <div className="field">
                <label htmlFor="telefoon">Telefoon</label>
                <input id="telefoon" name="telefoon" type="tel" autoComplete="tel" inputMode="tel" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {withDate ? (
              <div className="field-row">
                <div className="field">
                  <label htmlFor="datum">Gewenste datum</label>
                  <input id="datum" name="datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="aantal">{topic === "yte" ? "Aantal personen" : "Aantal kinderen"}</label>
                  <input id="aantal" name="aantal" type="number" min={1} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} />
                </div>
              </div>
            ) : null}
            {indication ? (
              <div className={`indication indication--${indication.state}`} role="status">
                <p>{indication.message}</p>
                {indication.alternatives?.length ? <p>Wel plek op: {indication.alternatives.map((d, i) => <button key={d} type="button" className="linklike" onClick={() => setDate(d)}>{new Date(d + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}{i < indication.alternatives.length - 1 ? ", " : ""}</button>)}</p> : null}
                <p className="small muted">Dit is een eerste indicatie. Er is pas iets vastgelegd als wij het bevestigen.</p>
              </div>
            ) : null}
            {topic === "yte" || topic === "groep" || topic === "kinderfeest" ? (
              <fieldset className="field">
                <legend>Heeft iemand in het gezelschap een allergie of dieetwens?</legend>
                <div className="radios">
                  <label><input type="radio" name="allergie" value="nee" checked={allergy === "nee"} onChange={() => setAllergy("nee")} />Nee</label>
                  <label><input type="radio" name="allergie" value="ja" checked={allergy === "ja"} onChange={() => setAllergy("ja")} />Ja</label>
                </div>
                {allergy === "ja" ? <input aria-label="Voor wie, en waar moeten we rekening mee houden?" name="allergie_toelichting" placeholder="Voor wie, en waar moeten we rekening mee houden?" /> : null}
              </fieldset>
            ) : null}
            <div className="field">
              <label htmlFor="bericht">Bericht</label>
              <textarea id="bericht" name="bericht" rows={4} />
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="btn" type="submit" disabled={sending}>{sending ? "Versturen…" : "Aanvraag versturen"}<Icon name="arrow" /></button>
            <p className="small muted">We gebruiken je gegevens alleen om je aanvraag te beantwoorden. Lees ons <a href={paths.privacy}>privacybeleid</a>.</p>
          </form>
        </div>
      </section>
    </>
  );
}
