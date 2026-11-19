import { Link } from "react-router-dom";
import { Seo, businessNode } from "../components/Seo";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { TodayBoard } from "../components/TodayBoard";
import { Upcoming } from "../components/Upcoming";
import { NewsTeaser } from "../components/NewsTeaser";
import { site, faq, prices } from "../content/site";
import { inOntwikkeling, type Onderdeel } from "../content/live";
import { paths } from "../routes";

const doors = () => [
  { tone: "speel", href: paths.speelboerderij, photo: "speelterrein", title: "Speelboerderij", text: "Kinderen op avontuur binnen de hekken. Jij aan de koffie met een lunch van eigen land.", meta: prices.entreeKind ? `Entree ${prices.entreeKind} per kind` : "Volwassenen gratis" },
  { tone: "yte", href: paths.yte, photo: "yte-tafel", title: "Ite by Boer Bart", text: "Donderdagavond: de boerderij in zes tot zeven gangen, gekookt met wat die dag is geoogst.", meta: prices.yte ? `${prices.yte} per persoon` : "Donderdagavond" },
  { tone: "winkel", href: paths.winkel, photo: "winkel-groente", title: "Boerderijwinkel", text: "Rauwe melk, groente uit de tuin, vlees van eigen dieren en het beste van Friese boeren.", meta: "Do middag t/m zondag" },
  { tone: "groepen", href: paths.groepen, photo: "hooiwagen", title: "Groepen en feesten", text: "Kinderfeest, schoolreisje of een dag met familie of collega's op de boerderij.", meta: "Vanaf 8 kinderen" },
];

export function Home() {
  return inOntwikkeling("start") ? <OpbouwHome /> : <GewoneHome />;
}

function GewoneHome() {
  return (
    <>
      <Seo
        page="home"
        title="Boer Bart | Biologische boerderij in Rotstergaast"
        desc="Speelboerderij, boerderijwinkel en restaurant Ite op de biologische boerderij van Rianne en Bart in Rotstergaast, vlak bij Heerenveen."
        jsonld={[businessNode()]}
      />
      <section className="hero">
        <div className="hero__photo">
          <Picture slug="erf-gezin" alt="Rianne en Bart met hun hond op het erf, met kippen en een oude trekker" sizes="100vw" priority focus="50% 40%" />
        </div>
        <div className="wrap hero__inner">
          <p className="eyebrow eyebrow--light">Biologische boerderij in Rotstergaast</p>
          <h1 className="hero__title">Kom op het erf.</h1>
          <p className="hero__lead">Spelen tussen de kippen, boodschappen doen bij de bron en 's avonds aan tafel bij Ite. Bij Rianne en Bart, vlak bij Heerenveen.</p>
        </div>
      </section>

      <div className="wrap board-wrap">
        <TodayBoard />
      </div>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Wat kom je doen?</p>
          <h2 className="h2">Vier manieren om de boerderij te beleven</h2>
          <div className="doors">
            {doors().map((d) => (
              <Link key={d.href} to={d.href} className={`door door--${d.tone}`}>
                <span className="door__photo arch"><Picture slug={d.photo} alt="" sizes="(min-width: 1000px) 24vw, (min-width: 600px) 46vw, 100vw" /></span>
                <span className="door__body">
                  <span className="door__title">{d.title}</span>
                  <span className="door__text">{d.text}</span>
                  <span className="door__meta">{d.meta}<Icon name="arrow" /></span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Upcoming />
      <NewsTeaser />

      <section className="section section--deep">
        <div className="wrap split">
          <div className="split__photo arch">
            <Picture slug="zonsopkomst" alt="Bart loopt bij zonsopkomst langs de sloot over het land" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
          <div className="split__text">
            <p className="eyebrow eyebrow--light">Ons verhaal</p>
            <h2 className="h2">Een boerderij die 1000 jaar kan bestaan</h2>
            <p className="lead lead--light">Sinds {site.since} bouwen we aan een boerderij die zo rijk en gezond is dat hij altijd kan blijven bestaan. Met Jersey koeien in de wei, groenten uit eigen tuin en een keuken die laat proeven wat het land die week geeft.</p>
            <p className="lead lead--light">De familie Holtrop woont al sinds 1753 in deze streek. Wij zijn de nieuwste schakel.</p>
            <Link className="textlink textlink--light" to={paths.over}>Lees ons verhaal<Icon name="arrow" /></Link>
          </div>
        </div>
      </section>


      <section className="section section--sand">
        <div className="wrap narrow">
          <p className="eyebrow">Goed om te weten</p>
          <h2 className="h2">Vragen die we vaak krijgen</h2>
          <div className="faq">
            {faq.slice(0, 4).map(([q, a]) => (
              <details key={q} className="faq__item">
                <summary>{q}<Icon name="chevD" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <Link className="textlink" to={paths.vragen}>Alle vragen<Icon name="arrow" /></Link>
        </div>
      </section>

      <section className="section">
        <div className="wrap visit">
          <div>
            <p className="eyebrow">Langskomen</p>
            <h2 className="h2">{site.street}, {site.city}</h2>
            <p className="lead">Vlak bij Heerenveen. Vragen over de route of je bezoek? Bel of mail ons gerust.</p>
          </div>
          <div className="visit__actions">
            <a className="btn" href={site.mapsUrl} rel="noopener"><Icon name="pin" />Route plannen</a>
            <a className="btn btn--ghost" href={`tel:${site.phoneIntl}`}><Icon name="phone" />{site.phone}</a>
          </div>
        </div>
      </section>
    </>
  );
}

// Opbouwstand (15 november 2026): stil winterbeeld, het verhaal "we bouwen", en negen foto's van wat straks terugkomt.
// Nog geen opening noemen (besluit eigenaar), geen prijzen, geen open/dicht, geen contactblok en nog geen aanvragen.
const straks = [
  { slug: "erf-gezin", alt: "Rianne en Bart met hun hond op het erf, tussen de kippen" },
  { slug: "kinderen-kippen", alt: "Kinderen tussen de kippen in de wei" },
  { slug: "yte-tafel", alt: "Een gedekte tafel bij Ite by Boer Bart" },
  { slug: "jersey-koeien", alt: "Jersey koeien grazen tussen de gele lissen" },
  { slug: "winkel-groente", alt: "Verse groente uit eigen tuin in de boerderijwinkel" },
  { slug: "hooiwagen", alt: "Een groep op de hooiwagen achter de trekker" },
  { slug: "sloot-avontuur", alt: "Kinderen op avontuur langs de sloot, met koeien op de achtergrond" },
  { slug: "kaas", alt: "Kaas van de boerderij" },
  { slug: "kalfje", alt: "Een kalfje in de wei" },
];

const komt = [
  // Een link alleen als dat onderdeel open staat in de backoffice.
  { tone: "speel", onderdeel: "speelboerderij" as Onderdeel, href: paths.speelboerderij, title: "Speelboerderij", text: "Kinderen op avontuur tussen de dieren, en jij aan de koffie met iets lekkers van eigen land." },
  { tone: "yte", onderdeel: "yte" as Onderdeel, href: paths.yte, title: "Ite by Boer Bart", text: "Aan tafel op de boerderij, met gangen die laten proeven wat het land die week geeft." },
  { tone: "winkel", onderdeel: "winkel" as Onderdeel, href: paths.winkel, title: "Boerderijwinkel", text: "Rauwe melk, groente uit de tuin, vlees van eigen dieren en het beste van Friese boeren." },
  { tone: "groepen", onderdeel: "groepen" as Onderdeel, href: paths.groepen, title: "Groepen en schoolreisjes", text: "Kinderfeest, schoolreisje of een dag met familie of collega's op de boerderij." },
];

function OpbouwHome() {
  return (
    <>
      <Seo
        page="home"
        title="Boer Bart | Biologische boerderij in Rotstergaast"
        desc="We werken aan het nieuwe Boer Bart in Rotstergaast: een nieuw hoofdstuk voor de speelboerderij, de boerderijwinkel en Ite. Volg ons op Instagram."
        jsonld={[businessNode()]}
      />
      <section className="hero hero--winter">
        <div className="hero__photo">
          <Picture slug="zonsopkomst" alt="Bart loopt bij zonsopkomst langs de sloot over het land" sizes="100vw" priority focus="60% 45%" />
        </div>
        <div className="wrap hero__inner">
          <p className="eyebrow eyebrow--light">In ontwikkeling</p>
          <h1 className="hero__title">We werken aan het nieuwe Boer{"\u00a0"}Bart.</h1>
          <p className="hero__lead">Het is stil op de boerderij, maar achter de schermen gebeurt veel. We werken aan een nieuw hoofdstuk. Hoe het ervoor staat, lees je hier als eerste.</p>
          <div className="btn-row hero__actions">
            <a className="btn btn--light" href={site.instagram} rel="noopener">Volg ons op Instagram<Icon name="arrow" /></a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Straks weer op het erf</p>
          <h2 className="h2">Dit maakt de boerderij</h2>
          <p className="lead mosaic__lead">Zo kennen jullie ons, en zo zien we jullie graag terug.</p>
          <ul className="mosaic">
            {straks.map((f) => (
              <li key={f.slug} className="mosaic__item">
                <Picture slug={f.slug} alt={f.alt} sizes="(min-width: 1200px) 400px, 33vw" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--sand">
        <div className="wrap">
          <p className="eyebrow">Wat er komt</p>
          <h2 className="h2">Een nieuw hoofdstuk, vier deuren</h2>
          <ul className="komt">
            {komt.map((k) => (
              <li key={k.title} className={`komt__item door--${k.tone}`}>
                <h3 className="komt__title">{k.title}</h3>
                <p>{k.text}</p>
                {!inOntwikkeling(k.onderdeel) ? <Link className="textlink" to={k.href}>Bekijk<Icon name="arrow" /></Link> : <span className="komt__status">In ontwikkeling</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Het coöperatieve verhaal (wens eigenaar 15 november 2026): wel beschrijven, maar je hoeft geen lid te worden. */}
      <section className="section section--deep">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow eyebrow--light">Boer Bart Coöperatie</p>
            <h2 className="h2">De boerderij die ons samen draagt</h2>
            <p className="lead lead--light">Boer Bart is een coöperatie. Samen werken we aan een boerderij die zo rijk en gezond is dat hij 1000 jaar kan bestaan: met Jersey koeien in de wei, groente uit eigen tuin en een keuken die laat proeven wat het land geeft.</p>
            <p className="lead lead--light">De familie Holtrop woont al sinds 1753 in deze streek. Wij zijn de nieuwste schakel, en we doen het niet alleen.</p>
            <p className="lead lead--light">Iedereen is welkom: je hoeft geen lid te worden.</p>
          </div>
          <div className="split__photo arch">
            <Picture slug="koeien-kippen" alt="Koeien en kippen samen in de wei" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <NewsTeaser />


    </>
  );
}
