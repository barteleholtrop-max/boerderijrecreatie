import { Seo } from "../components/Seo";
import { PageHero, CtaBand, Gallery } from "../components/Blocks";
import { inOntwikkeling } from "../content/live";
import { site } from "../content/site";
import { paths } from "../routes";

const timeline: [string, string, string][] = [
  ["1753", "De Holtrops strijken neer in Friesland", "Jan Bernardus Holtrop, wagenmaker uit het Münsterland, koopt een hele terp in de streek rond Rohel. Het begin van de familie in Nederland."],
  ["1986", "Bartele wordt geboren", "Tweede zoon van Minne en Geeske Holtrop uit Delfstrahuizen. Hij groeit op met de melk van de boerderij van zijn ouders."],
  ["1987", "Rianne wordt geboren", "Rianne Rijpkema wordt geboren in Joure."],
  ["2014", "De start van Boer Bart", "We beginnen aan een boerderij die zo rijk en gezond is dat hij altijd kan blijven bestaan. Sindsdien schrijven we er ook over."],
  ["2024", "Van boerderij naar coöperatie", "Boer Bart wordt een coöperatie, gedragen door de mensen eromheen."],
  ["2026", "Ite by Boer Bart", "Chef Guust de Nijs presenteert de boerderij op donderdagavond in zes tot zeven gangen."],
];

export function Over() {
  return (
    <>
      <Seo
        page="over"
        title="Ons verhaal | Rianne en Bart Holtrop, Boer Bart"
        desc="Bartele en Rianne Holtrop bouwen sinds 2014 in Rotstergaast aan een biologische boerderij die 1000 jaar kan bestaan. Lees het verhaal achter Boer Bart."
        crumbs={[{ name: "Ons verhaal", path: paths.over }]}
        jsonld={[{ "@type": "AboutPage", name: "Ons verhaal" }]}
      />
      <PageHero
        eyebrow="Ons verhaal"
        title="Vader, moeder, boer, boerin, gastheer en gastvrouw"
        photo="rianne-bart"
        alt="Rianne en Bart met een doos eieren"
        lead={<p>Wij zijn {site.ownersFull}. Onze boerderij is een heerlijke plek voor families: kinderen gaan op avontuur, jij ontspant met een goede kop koffie. En er is altijd iets te doen, van de koeien halen voor het melken tot eieren rapen uit de kipcaravan.</p>}
      />

      <section className="section">
        <div className="wrap narrow">
          <p className="eyebrow">Van de geschiedenis tot de toekomst</p>
          <h2 className="h2">"Een boerderij die 1000 jaar kan bestaan."</h2>
          <ol className="timeline">
            {timeline.map(([year, title, text]) => (
              <li key={year} className="timeline__item">
                <span className="timeline__year">{year}</span>
                <div>
                  <h3 className="h3">{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--sand">
        <div className="wrap narrow">
          <p className="eyebrow">Uit ons blog</p>
          <h2 className="h2">De kippen gaan verder</h2>
          <p className="lead">Na 14 jaar nemen we afscheid van onze kippen. Niet omdat we stoppen, maar omdat iemand anders ermee verdergaat. Al vier jaar worden ze verzorgd door een bijzondere dame die stap voor stap haar zelfvertrouwen vond. Nu start ze haar eigen mini-onderneming, met eigen kippen en een miniwinkel bij ons. De opbrengst van haar eieren gaat volledig naar haar.</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Gallery items={[["boerderij", "De boerderij in Rotstergaast"], ["kalfje", "Een kalfje in de wei"], ["wei", "Koeien en kippen samen in de wei"], ["gezin-hond", "Het gezin met de hond in het gras"], ["koeien-kippen", "Jersey koeien en kippen"], ["zonsopkomst", "Zonsopkomst boven het land"]]} />
        </div>
      </section>

      {/* Opbouwstand: nog geen bezoek plannen. */}
      {inOntwikkeling("contact") ? null : <CtaBand title="Kom het zelf zien" text="De mooiste manier om ons verhaal te leren kennen, is op het erf." cta="Plan je bezoek" />}
    </>
  );
}
