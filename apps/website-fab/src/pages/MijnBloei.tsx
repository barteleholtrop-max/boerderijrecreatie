// Mijn Bloei (wens eigenaar 5 november 2026: de functies van onze website in deze vormgeving, stap 5).
// Het ledenonderdeel is één gedeelde versie uit de backoffice (<bloei-proef>, bloei-proef.js en bloei-proef.css), dezelfde
// als op onze eigen website. Bloei is de volledige kapitaaladministratie (besluit eigenaar 5 november 2026): hier staat geen
// eigen ledenregister, alleen het venster erop. Gegevens via /api/public/bloei; alle saldi blijven op de server.
// Niet in zoekmachines (noindex). Zolang de livegangvoorwaarden niet rond zijn, zijn de leden fictief.
import { createElement, useEffect, useState } from "react";
import { Seo } from "../components/Seo";
import { PageHero } from "../components/Blocks";
import { Icon } from "../components/Icon";
import { paths } from "../routes";
import { Link } from "react-router-dom";
import {BloeiOfficialDocuments} from '../components/OfficialDocuments';

/** Laadt een stylesheet of script van de backoffice één keer. */
function useAsset(kind: "css" | "js", href: string) {
  const [state, setState] = useState<"laden" | "klaar" | "mislukt">("laden");
  useEffect(() => {
    const found = document.querySelector<HTMLElement>(`[data-bloei="${href}"]`);
    if (found) { setState(found.dataset.ready === "1" ? "klaar" : "laden"); found.addEventListener("load", () => setState("klaar")); found.addEventListener("error", () => setState("mislukt")); return; }
    const el = kind === "css" ? Object.assign(document.createElement("link"), { rel: "stylesheet", href }) : Object.assign(document.createElement("script"), { src: href, defer: true });
    el.dataset.bloei = href;
    el.addEventListener("load", () => { el.dataset.ready = "1"; setState("klaar"); });
    el.addEventListener("error", () => setState("mislukt"));
    document.head.appendChild(el);
  }, [kind, href]);
  return state;
}

export function MijnBloei() {
  useAsset("css", "/brand.css");
  useAsset("css", "/bloei-proef.css");
  const script = useAsset("js", "/bloei-proef.js");
  return (
    <>
      <Seo page="bloei" title="Mijn Bloei | Boer Bart" desc="Mijn Bloei: je ledenomgeving bij de coöperatie van Boer Bart." noindex crumbs={[{ name: "Mijn Bloei", path: paths.bloei }]} />
      <PageHero eyebrow="Ledenomgeving" title="Mijn Bloei" photo="hooiwagen" alt="De hooiwagen op het erf van Boer Bart"
        lead={<p>Je deelname in de coöperatie in één overzicht: je tegoed, je participaties en wat er met je bijdrage gebeurt.</p>} />
      <section className="section section--tight">
        <div className="wrap bloei-wrap">
          <div className="btn-row"><Link className="btn btn--ghost" to={paths.markt}>Naar de openbare Bloeimarkt</Link><a className="text-link" href="#documenten">Officiële documenten</a></div>
          {script === "mislukt"
            ? <p className="note"><Icon name="info" />Mijn Bloei is nu niet te laden. Probeer het later opnieuw.</p>
            : script === "laden" ? <p className="note">Mijn Bloei wordt geladen…</p> : null}
          {createElement("bloei-proef", { endpoint: "/api/public/bloei" })}
        </div>
      </section>
      <BloeiOfficialDocuments/>
    </>
  );
}
