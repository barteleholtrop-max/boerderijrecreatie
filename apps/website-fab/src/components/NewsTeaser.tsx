// „Van het erf” op de homepage: de nieuwste drie stukken uit de backoffice (Inhoud), met een link naar /nieuws/.
// Leeg of niet te laden: dan verschijnt dit blok niet (de rest van de pagina blijft gelijk), net als de agenda.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { paths } from "../routes";
import { loadPieces, kindLabel, pieceDate, type Piece } from "../content/inhoud";

export function NewsTeaser() {
  const [items, setItems] = useState<Piece[]>([]);
  useEffect(() => { loadPieces(3).then(setItems).catch(() => {}); }, []);
  if (!items.length) return null;
  return (
    <section className="section section--tight">
      <div className="wrap">
        <p className="eyebrow">Van het erf</p>
        <h2 className="h2">Nieuws en verhalen</h2>
        <ul className="teasers">
          {items.map((p) => (
            <li key={p.slug}>
              <Link to={`${paths.nieuws}#${p.slug}`}>
                {p.photo || p.video?.thumbnail ? <img src={(p.photo || p.video?.thumbnail)!} alt="" loading="lazy" /> : null}
                <span className="teasers__meta">{kindLabel[p.kind]} · {pieceDate(p.publishedAt)}</span>
                <span className="teasers__title">{p.title}</span>
                {p.summary ? <span className="teasers__text">{p.summary}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="btn btn--ghost" to={paths.nieuws}>Al het nieuws<Icon name="arrow" /></Link>
      </div>
    </section>
  );
}
