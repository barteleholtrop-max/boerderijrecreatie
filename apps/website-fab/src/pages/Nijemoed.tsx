// Landingspagina Nijemoed Bloemen (wens eigenaar, 17 november 2026). Coöperatielid Bindert de Jong teelt op een halve hectare
// biologische snijbloemen; hij verkoopt ze via de boerderijwinkel en met een bloemenabonnement.
// Geen prijzen of data in de code: die komen live uit het profiel van Bindert in de backoffice (components/BindertAanbod.tsx).
import "../styles/nijemoed.css";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Seo, abs, businessId } from "../components/Seo";
import { Picture, srcFor } from "../components/Picture";
import { Icon } from "../components/Icon";
import { paths } from "../routes";
import { BindertAanbod } from "../components/BindertAanbod";

const seizoenen: { naam: string; tijd: string; slug: string; alt: string; bloemen: string }[] = [
  { naam: "Voorjaar", tijd: "Het eerste licht", slug: "bloemen-korenbloemen", alt: "Blauwe en witte korenbloemen in de tuin van Nijemoed", bloemen: "Korenbloemen, ridderspoor en lathyrus die langs het gaas omhoog klimt." },
  { naam: "Zomer", tijd: "Volle bloei", slug: "bloemen-zonnehoed", alt: "Roze zonnehoed met een oranje hart, met lathyrus op de achtergrond", bloemen: "Zonnehoed, duizendblad, zinnia's, siertabak en rudbeckia." },
  { naam: "Nazomer", tijd: "Tot de eerste nachtvorst", slug: "bloemen-dahlia", alt: "Donkerrode pompondahlia's in de tuin", bloemen: "Dahlia's, kogeldistels, zonnebloemen en rozenbottels voor in het boeket." },
];

const mozaiek: [string, string][] = [
  ["bloemen-emmers", "Emmers vol vers gesneden bloemen in het gras, naast een fiets"],
  ["bloemen-ridderspoor", "Een tak lila ridderspoor met knoppen"],
  ["bloemen-duizendblad", "Roze en wit duizendblad"],
  ["bloemen-zinnia", "Een rood-gele zinnia tussen de rijen, met op de achtergrond iemand met een fiets vol bloemen"],
  ["bloemen-kogeldistel", "Kogeldistels voor een veld van oranje afrikaantjes"],
  ["bloemen-siertabak", "Limoengroene siertabak boven een bed van wit duizendblad"],
  ["bloemen-zonnehoed-wit", "Witte zonnehoed met lila asters erachter"],
  ["bloemen-ridderspoor-rijen", "Rijen ridderspoor in knop, met hier en daar een roze bloem"],
];

/** Laat blokken zacht opkomen bij het scrollen. Zonder JavaScript of met „minder beweging” blijft alles gewoon zichtbaar. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...root.querySelectorAll<HTMLElement>(".nm-head, .nm-pillar, .nm-season, .nm-mosaic__item, .nm-way, .nm-story__photo, .nm-duo figure, .nm-aanbod__item")];
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el, i) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("nm-reveal"); el.style.transitionDelay = `${(i % 4) * 90}ms`; io.observe(el); } });
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Nijemoed() {
  const ref = useReveal();
  return (
    <div className="nm" ref={ref}>
      <Seo
        page="nijemoed"
        title="Nijemoed Bloemen | Biologische bloemen met aandacht"
        desc="Biologische snijbloemen van een halve hectare, zoals de natuur het bedoeld heeft. In de boerderijwinkel van Boer Bart en als bloemenabonnement."
        image="/og/bloemen.jpg"
        imageAlt="Roze en witte ridderspoor in de avondzon bij Nijemoed Bloemen"
        crumbs={[{ name: "Nijemoed Bloemen", path: paths.nijemoed }]}
        jsonld={[{
          "@type": "Organization", "@id": abs(`${paths.nijemoed}#nijemoed`), name: "Nijemoed Bloemen",
          description: "Biologische snijbloemenkwekerij op een halve hectare, lid van de coöperatie van Boer Bart.",
          founder: { "@type": "Person", name: "Bindert de Jong" },
          image: [abs(srcFor("bloemen-ridderspoor-zon", 1200)), abs(srcFor("bloemen-boeket", 960))],
          memberOf: { "@id": businessId },
        }]}
      />

      <section className="nm-burst">
        <div className="nm-burst__bg" aria-hidden="true">
          <Picture slug="bloemen-ridderspoor-zon" alt="" sizes="100vw" priority focus="50% 38%" />
        </div>
        <div className="wrap nm-burst__inner">
          <p className="nm-burst__eyebrow nm-rise" style={{ animationDelay: ".1s" }}>Bindert de Jong</p>
          <h1 className="nm-burst__title">
            <span className="nm-rise" style={{ animationDelay: ".25s" }}>Nijemoed</span>
            <em className="nm-rise" style={{ animationDelay: ".45s" }}>Bloemen</em>
          </h1>
          <p className="nm-burst__lead nm-rise" style={{ animationDelay: ".7s" }}>Bloemen met aandacht. Biologisch geteeld op een halve hectare, zoals de natuur het bedoeld heeft: dicht bij de schepping, en met veel plezier.</p>
          <div className="nm-burst__cta nm-rise" style={{ animationDelay: ".9s" }}>
            <a className="btn nm-btn-glow" href="#bloemen-halen">Bloemen halen<Icon name="arrow" /></a>
            <a className="btn btn--light" href="#verhaal">Het verhaal</a>
          </div>
        </div>
        <a className="nm-burst__down" href="#verhaal" aria-label="Naar het verhaal"><Icon name="arrow" /></a>
      </section>

      <section className="section" id="verhaal">
        <div className="wrap nm-story">
          <div className="nm-story__text">
            <p className="eyebrow">Het verhaal</p>
            <h2 className="h2">Een dominee met aarde aan zijn handen</h2>
            <p className="lead">Naast zijn werk als dominee is Bindert de Jong veel buiten te vinden, tussen de rijen. Daar laat hij bloemen groeien zoals hij denkt dat ze bedoeld zijn: in hun eigen tempo, op hun eigen seizoen, met zorg voor de grond waarin ze staan.</p>
            <p>Een halve hectare vol ridderspoor, dahlia's, zonnehoed en korenbloemen, gegroeid onder de Friese lucht. Bloemen die je ruikt zodra je de winkel binnenkomt, met hier en daar een eigenwijze steel. Elke bos is anders, omdat elke week in de tuin weer iets nieuws brengt.</p>
            <blockquote className="nm-quote">
              <p>„Bloemen met aandacht. Dicht bij de schepping, en met veel plezier.”</p>
              <footer>Bindert de Jong</footer>
            </blockquote>
          </div>
          <figure className="nm-story__photo arch">
            <Picture slug="bloemen-bindert" alt="Bindert de Jong in zijn groene overall, lachend met zijn arm om zijn dochter, in de wei" sizes="(min-width: 900px) 40vw, 100vw" />
            <figcaption>Bindert de Jong met zijn dochter</figcaption>
          </figure>
        </div>
      </section>

      <section className="section nm-natuur">
        <div className="wrap">
          <div className="nm-head">
            <p className="eyebrow">Zoals de natuur het bedoeld heeft</p>
            <h2 className="h2">Biologisch, van zaadje tot boeket</h2>
          </div>
          <div className="nm-pillars">
            <article className="nm-pillar">
              <Icon name="leaf" />
              <h3>Gezonde grond, sterke bloemen</h3>
              <p>De grond wordt gevoed met compost en geduld. Zo ontstaat levende aarde vol bodemleven, en daarin groeien bloemen die stevig en lang mooi blijven.</p>
            </article>
            <article className="nm-pillar">
              <Icon name="sun" />
              <h3>Op het ritme van het seizoen</h3>
              <p>Wat er bloeit, komt in de bos. Zo krijg je bloemen die passen bij de week waarin je ze koopt, en die lang mooi blijven.</p>
            </article>
            <article className="nm-pillar">
              <Icon name="heart" />
              <h3>Ruimte voor al wat leeft</h3>
              <p>Hommels in de kardoen, gaasvliegen op de rudbeckia. In een natuurlijke tuin wonen de helpers vanzelf, en zij doen hun werk.</p>
            </article>
          </div>
          <div className="nm-duo">
            <figure className="arch"><Picture slug="bloemen-kardoen-hommel" alt="Een hommel op de paarse bloem van een kardoen" sizes="(min-width: 900px) 30vw, 50vw" /></figure>
            <figure className="arch"><Picture slug="bloemen-zonnebloem-koeien" alt="Zonnebloemen bij een houten hek, met koeien in de wei erachter" sizes="(min-width: 900px) 30vw, 50vw" /></figure>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="nm-head">
            <p className="eyebrow">Een jaar in de tuin</p>
            <h2 className="h2">Van het voorjaar tot de eerste nachtvorst</h2>
            <p className="lead">In de winter rust de grond en wordt er gezaaid en vooruitgedacht. Daarna bloeit de tuin seizoen na seizoen.</p>
          </div>
          <div className="nm-seasons">
            {seizoenen.map((s) => (
              <article key={s.naam} className="nm-season">
                <figure className="nm-season__photo"><Picture slug={s.slug} alt={s.alt} sizes="(min-width: 900px) 30vw, 100vw" /></figure>
                <div className="nm-season__body">
                  <p className="nm-season__tijd">{s.tijd}</p>
                  <h3>{s.naam}</h3>
                  <p>{s.bloemen}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight" aria-label="Foto's uit de tuin">
        <div className="wrap">
          <div className="nm-mosaic">
            {mozaiek.map(([slug, alt]) => (
              <figure key={slug} className="nm-mosaic__item"><Picture slug={slug} alt={alt} sizes="(min-width: 900px) 25vw, 50vw" /></figure>
            ))}
          </div>
        </div>
      </section>

      <BindertAanbod />

      <section className="section nm-halen" id="bloemen-halen">
        <div className="wrap">
          <div className="nm-head">
            <p className="eyebrow eyebrow--light">Bloemen halen</p>
            <h2 className="h2">Zo komen de bloemen bij jou</h2>
            <p className="lead lead--light">Vers gesneden, rechtstreeks van de tuin. Bij de coöperatieve boerderij Boer Bart in Rotstergaast, bij EcoPlaza Heerenveen en op prachtige streekmarkten.</p>
            <p className="nm-halen__kleur">Zolang wij jou mogen voorzien van kleur.</p>
          </div>
          <div className="nm-ways">
            <article className="nm-way">
              <p className="nm-way__label">In de winkel</p>
              <h3>Een bos uit de boerderijwinkel</h3>
              <p>In het seizoen staan de bloemen van Nijemoed in de boerderijwinkel van Boer Bart. Pak een bos, scan hem en reken zelf af. Wat er staat, wisselt met de tuin.</p>
              <Link className="btn btn--light" to={paths.winkel}>Naar de boerderijwinkel<Icon name="arrow" /></Link>
            </article>
            <article className="nm-way nm-way--main">
              <p className="nm-way__label">Abonnement</p>
              <h3>Elke week of om de week een verse bos</h3>
              <p>Met een bloemenabonnement staat er een seizoensbos voor je klaar, die je ophaalt op het erf. Ook mooi naast je oogstabonnement, of als cadeau voor iemand die je een kleurrijke week gunt.</p>
              <a className="btn" href="/abonnementen.html">Stel je abonnement samen<Icon name="arrow" /></a>
            </article>
          </div>
          <p className="nm-halen__note"><Icon name="info" />Prijzen en wat er deze week te halen is, zie je in de winkel en bij het samenstellen van je abonnement.</p>
        </div>
      </section>

      <section className="section nm-coop">
        <div className="wrap nm-story nm-story--rev">
          <figure className="nm-story__photo arch">
            <Picture slug="bloemen-tuin" alt="De bloementuin van Nijemoed onder een wolkenlucht: lavatera, verbena en windschermen" sizes="(min-width: 900px) 40vw, 100vw" />
          </figure>
          <div className="nm-story__text">
            <p className="eyebrow">Samen met Boer Bart</p>
            <h2 className="h2">Een eigen bedrijf, in een gedeelde coöperatie</h2>
            <p className="lead">Nijemoed Bloemen is lid van de coöperatie Boer Bart. De bloemen staan op naam van Bindert in de winkel, en elke week wordt er met hem afgerekend.</p>
            <p>Zo kan een kleine teler doen waar hij goed in is, en vind jij op één plek de melk, de groente én de bloemen voor op tafel.</p>
            <Link className="textlink" to={paths.over}>Meer over de coöperatie<Icon name="arrow" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
