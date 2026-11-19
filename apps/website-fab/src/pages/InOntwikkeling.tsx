// Pagina „in ontwikkeling” (besluit eigenaar 15 november 2026): „eigenlijk is alleen de startpagina eerst voldoende”.
// Welke onderdelen in ontwikkeling zijn, kiest de eigenaar in de backoffice (content/live.ts, pageInOntwikkeling); zo'n
// pagina toont op haar eigen adres deze korte pagina in plaats van boekingen, prijzen of lid worden.
// Het adres blijft bestaan (geen kamer slopen); oude Wix-adressen die hierheen doorverwijzen, komen dus netjes aan.
// Altijd gewoon (geen onderdeel): privacy, Mijn Bloei, Bloeimarkt en de bevestiging na een formulier.
// Nog geen opening noemen.
import { Seo } from "../components/Seo";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { site } from "../content/site";
import { paths, type PageKey } from "../routes";

export const inOntwikkeling: Partial<Record<PageKey, { title: string; desc: string; naam: string; tekst: string; photo: string; alt: string; image?: string }>> = {
  speelboerderij: {
    title: "Speelboerderij bij Heerenveen | Boer Bart Rotstergaast",
    desc: "De speelboerderij van Boer Bart in Rotstergaast hoort bij het nieuwe Boer Bart waar we aan werken. Volg ons op Instagram.",
    naam: "Speelboerderij",
    tekst: "Kinderen op avontuur tussen de dieren: ook de speelboerderij hoort bij het nieuwe Boer Bart waar we aan werken.",
    photo: "kinderen-kippen", alt: "Kinderen tussen de kippen in de wei", image: "/og/speelboerderij.jpg",
  },
  yte: {
    title: "Ite by Boer Bart | Aan tafel op de boerderij bij Heerenveen",
    desc: "Ite by Boer Bart: aan tafel op de boerderij in Rotstergaast, met wat het land die week geeft. Hoort bij het nieuwe Boer Bart waar we aan werken.",
    naam: "Ite by Boer Bart",
    tekst: "Aan tafel op de boerderij, met gangen die laten proeven wat het land die week geeft: ook Ite hoort bij het nieuwe Boer Bart waar we aan werken.",
    photo: "yte-tafel", alt: "Een gedekte tafel bij Ite by Boer Bart", image: "/og/yte.jpg",
  },
  groepen: {
    title: "Groepen en schoolreisjes op de boerderij | Boer Bart",
    desc: "Kinderfeest, schoolreisje of een dag met collega's op de boerderij van Boer Bart in Rotstergaast. Hoort bij het nieuwe Boer Bart waar we aan werken.",
    naam: "Groepen en schoolreisjes",
    tekst: "Een kinderfeest, schoolreisje of een dag met familie of collega's op de boerderij: ook dat hoort bij het nieuwe Boer Bart waar we aan werken.",
    photo: "hooiwagen", alt: "Een groep op de hooiwagen achter de trekker", image: "/og/groepen.jpg",
  },
  agenda: {
    title: "Agenda | Boer Bart Rotstergaast",
    desc: "De agenda van Boer Bart in Rotstergaast bij Heerenveen. We werken aan het nieuwe Boer Bart; nieuwe activiteiten lees je hier en bij het nieuws.",
    naam: "Agenda",
    tekst: "Activiteiten op het erf komen terug in het nieuwe Boer Bart waar we aan werken.",
    photo: "boerenpaad-brug", alt: "Het boerenpad over de brug bij de boerderij",
  },
  winkel: {
    title: "Boerderijwinkel bij Heerenveen | Boer Bart Rotstergaast",
    desc: "De boerderijwinkel van Boer Bart in Rotstergaast: rauwe melk, groente uit de tuin en vlees van eigen dieren. Hoort bij het nieuwe Boer Bart.",
    naam: "Boerderijwinkel",
    tekst: "Rauwe melk, groente uit de tuin en vlees van eigen dieren: ook de winkel hoort bij het nieuwe Boer Bart waar we aan werken.",
    photo: "winkel-groente", alt: "Verse groente uit eigen tuin in de boerderijwinkel", image: "/og/winkel.jpg",
  },
  over: {
    title: "Ons verhaal | Boer Bart, biologische boerderij in Rotstergaast",
    desc: "Rianne en Bart werken in Rotstergaast aan een boerderij die 1000 jaar kan bestaan. De familie woont al sinds 1753 in deze streek. Volg ons op Instagram.",
    naam: "Ons verhaal",
    tekst: "De familie Holtrop woont al sinds 1753 in deze streek. Wij zijn de nieuwste schakel, en werken aan het nieuwe Boer Bart.",
    photo: "zonsopkomst", alt: "Bart loopt bij zonsopkomst langs de sloot over het land",
  },
  vragen: {
    title: "Veelgestelde vragen | Boer Bart Rotstergaast",
    desc: "Vragen over Boer Bart in Rotstergaast bij Heerenveen. We werken aan het nieuwe Boer Bart; hoe het ervoor staat, lees je op Instagram.",
    naam: "Veelgestelde vragen",
    tekst: "We werken aan het nieuwe Boer Bart. De antwoorden op je vragen volgen zodra het nieuwe Boer Bart er is.",
    photo: "boerderij", alt: "De boerderij aan de Schoterweg in Rotstergaast",
  },
  contact: {
    title: "Contact en route | Boer Bart Rotstergaast",
    desc: "Boer Bart, Schoterweg 26 in Rotstergaast bij Heerenveen. We werken aan het nieuwe Boer Bart; volg ons op Instagram.",
    naam: "Contact",
    tekst: "We werken aan het nieuwe Boer Bart. Adres, telefoon en e-mail vind je onderaan deze pagina.",
    photo: "boerderij", alt: "De boerderij aan de Schoterweg in Rotstergaast",
  },
  nieuws: {
    title: "Nieuws en verhalen | Boer Bart Rotstergaast",
    desc: "Nieuws en verhalen van Boer Bart in Rotstergaast bij Heerenveen. We werken aan het nieuwe Boer Bart; volg ons op Instagram.",
    naam: "Nieuws",
    tekst: "We werken aan het nieuwe Boer Bart. De verhalen van het erf komen hier; tot die tijd volg je ons op Instagram.",
    photo: "erf-gezin", alt: "Rianne en Bart met hun hond op het erf, tussen de kippen",
  },
};


export function InOntwikkeling({ page }: { page: PageKey }) {
  const p = inOntwikkeling[page]!;
  return (
    <>
      <Seo page={page} title={p.title} desc={p.desc} image={p.image} crumbs={[{ name: p.naam, path: paths[page] }]} />
      {/* Zelfde stijl als de voorpagina in opbouwstand (wens eigenaar): grote foto, koel en stil ingekleurd. */}
      <section className="hero hero--winter hero--stil">
        <div className="hero__photo">
          <Picture slug={p.photo} alt={p.alt} sizes="100vw" priority />
        </div>
        <div className="wrap hero__inner">
          <p className="eyebrow eyebrow--light">In ontwikkeling</p>
          <h1 className="hero__title">{p.naam}</h1>
          <p className="hero__lead">{p.tekst}</p>
          <div className="btn-row hero__actions">
            <a className="btn btn--light" href={site.instagram} rel="noopener">Volg ons op Instagram<Icon name="arrow" /></a>
          </div>
        </div>
      </section>
    </>
  );
}
