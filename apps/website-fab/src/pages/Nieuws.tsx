// Nieuws en blog (wens eigenaar 13 november 2026). Alles komt uit de backoffice (Inhoud · blogs & filmpjes) via de vaste
// poort /api/public/v1/inhoud; hier staan geen eigen berichten. Elk stuk heeft een eigen adres: /nieuws/#<adres>.
// Filmpjes staan op YouTube (zonder volgcookies) of Vimeo en laden pas als de gast op afspelen klikt.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Seo } from "../components/Seo";
import { PageHero } from "../components/Blocks";
import { Icon } from "../components/Icon";
import { paths } from "../routes";
import { loadPieces, kindLabel, pieceDate, type Piece } from "../content/inhoud";

type Filter = "alles" | Piece["kind"];

function Player({ p }: { p: Piece }) {
  const [on, setOn] = useState(false);
  const v = p.video!;
  if (on) return <div className="piece__video"><iframe src={`${v.embed}?autoplay=1`} title={p.title} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>;
  const poster = p.photo || v.thumbnail;
  return (
    <button type="button" className="piece__video piece__play" onClick={() => setOn(true)} aria-label={`Speel het filmpje af: ${p.title}`}>
      {poster ? <img src={poster} alt="" loading="lazy" /> : null}
      <span className="piece__playbtn">Afspelen</span>
      <span className="piece__note">Via {v.provider === "youtube" ? "YouTube" : "Vimeo"}</span>
    </button>
  );
}

function Article({ p, open, toggle }: { p: Piece; open: boolean; toggle: () => void }) {
  const long = p.blocks.length > 2;
  const shown = open || !long ? p.blocks : p.blocks.slice(0, 1);
  return (
    <article className="piece" id={p.slug}>
      <p className="piece__meta"><span>{kindLabel[p.kind]}</span><time dateTime={p.publishedAt}>{pieceDate(p.publishedAt)}</time></p>
      <h2 className="h3 piece__title"><a href={`#${p.slug}`}>{p.title}</a></h2>
      {p.video ? <Player p={p} /> : p.photo ? <img className="piece__photo" src={p.photo} alt="" loading="lazy" /> : null}
      {p.summary ? <p className="piece__lead">{p.summary}</p> : null}
      {shown.map((b, i) => (b.type === "kop" ? <h3 key={i} className="piece__h">{b.text}</h3> : <p key={i} className="piece__p">{b.text}</p>))}
      {long ? <button type="button" className="btn btn--ghost btn--small" aria-expanded={open} onClick={toggle}>{open ? "Minder tonen" : "Lees verder"}</button> : null}
    </article>
  );
}

export function Nieuws() {
  const [items, setItems] = useState<Piece[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("alles");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { hash } = useLocation();
  useEffect(() => { loadPieces().then(setItems).catch(() => setFailed(true)); }, []);
  // Een gedeelde link (/nieuws/#adres): dat stuk openklappen en ernaartoe gaan zodra het geladen is.
  useEffect(() => {
    const slug = decodeURIComponent(hash.slice(1));
    if (!items || !slug || !items.some((p) => p.slug === slug)) return;
    setOpen((s) => new Set(s).add(slug));
    requestAnimationFrame(() => document.getElementById(slug)?.scrollIntoView({ block: "start" }));
  }, [items, hash]);
  const kinds = new Set((items || []).map((p) => p.kind));
  const list = (items || []).filter((p) => filter === "alles" || p.kind === filter);
  return (
    <>
      <Seo page="nieuws" title="Nieuws en blog | Boer Bart in Rotstergaast" image="/og/boerbart.jpg"
        desc="Verhalen, nieuws en filmpjes van Boer Bart: wat er gebeurt op de biologische boerderij, in de winkel en bij Ite in Rotstergaast."
        crumbs={[{ name: "Nieuws", path: paths.nieuws }]} />
      <PageHero eyebrow="Nieuws" title="Nieuws van het erf" photo="jersey-koeien" alt="Jersey-koeien op de boerderij van Boer Bart"
        lead={<p>Wat er speelt op de boerderij: verhalen van Rianne en Bart, nieuws uit de winkel en de keuken, en filmpjes van het erf.</p>}>
        <Link className="btn btn--ghost" to={paths.agenda}>Naar de agenda<Icon name="arrow" /></Link>
      </PageHero>
      <section className="section section--tight">
        <div className="wrap wrap--narrow">
          {failed ? <p className="notice">Het nieuws is nu niet te laden. Probeer het straks nog eens.</p>
            : items === null ? <p aria-live="polite">Nieuws laden…</p>
            : !items.length ? <p>Er staat nog geen nieuws klaar. Kijk ondertussen in de <Link to={paths.agenda}>agenda</Link> wat er te doen is.</p>
            : <>
              {kinds.size > 1 ? (
                <div className="piece__filters" role="group" aria-label="Soort">
                  {(["alles", "blog", "nieuws", "video"] as const).filter((k) => k === "alles" || kinds.has(k)).map((k) => (
                    <button key={k} type="button" className={filter === k ? "is-active" : undefined} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "alles" ? "Alles" : k === "video" ? "Filmpjes" : kindLabel[k]}</button>
                  ))}
                </div>
              ) : null}
              <div className="pieces">{list.map((p) => <Article key={p.slug} p={p} open={open.has(p.slug)} toggle={() => setOpen((s) => { const n = new Set(s); if (n.has(p.slug)) n.delete(p.slug); else n.add(p.slug); return n; })} />)}</div>
            </>}
        </div>
      </section>
    </>
  );
}
