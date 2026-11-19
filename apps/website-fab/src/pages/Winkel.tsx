import { Seo, abs, businessId, openingHours } from "../components/Seo";
import { PageHero, Facts, Checklist, CtaBand } from "../components/Blocks";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { site } from "../content/site";
import { openText } from "../content/live";
import { paths } from "../routes";
import { Webshop } from "../components/Webshop";
// Vooraf bestellen en afhalen uit de winkel (besluit eigenaar 11 november 2026: „dat mag eerst wel weg … wellicht doen we dat later weer”).
const SHOP_ONLINE = false;

export function Winkel() {
  return (
    <>
      <Seo
        page="winkel"
        title="Boerderijwinkel Boer Bart | Rauwe melk en biologisch"
        desc="Rauwe melk, groente uit eigen tuin, vlees van eigen dieren en producten van Friese boeren. Boerderijwinkel Boer Bart in Rotstergaast."
        image="/og/winkel.jpg"
        crumbs={[{ name: "Boerderijwinkel", path: paths.winkel }]}
        jsonld={[{ "@type": "GroceryStore", "@id": abs(`${paths.winkel}#winkel`), name: "Boerderijwinkel Boer Bart", description: "Boerderijwinkel met eigen biologische producten en lokale producten van Friese boeren.", parentOrganization: { "@id": businessId }, openingHoursSpecification: openingHours("winkel"), address: { "@type": "PostalAddress", streetAddress: site.street, postalCode: site.postalCode, addressLocality: site.city, addressCountry: "NL" } }]}
      />
      <PageHero
        eyebrow="Boerderijwinkel"
        title="Boodschappen doen bij de bron"
        photo="winkel-groente"
        alt="Verse groenten van de Griente in de boerderijwinkel"
        lead={<p>Producten rechtstreeks van het land. Van rauwe melk en groenten uit onze eigen tuin tot vlees van dieren die bij ons opgroeien. Aangevuld met het beste van boeren uit Friesland en de Noordoostpolder.</p>}
      >
        <a className="btn" href={site.mapsUrl} rel="noopener"><Icon name="pin" />Route plannen</a>
      </PageHero>

      <section className="section section--tight">
        <div className="wrap">
          <Facts items={[
            ["calendar", "Open", openText("winkel")],
            ["pin", "Adres", `${site.street}, ${site.city}`],
            ["leaf", "Herkomst", "Eigen land of boeren die we persoonlijk kennen"],
          ]} />
        </div>
      </section>

      <section className="section section--tight" id="online">
        <div className="wrap">
          {/* Vooraf bestellen en afhalen staat uit (besluit eigenaar 11 november 2026): de winkel gaat via zelfscannen.
              Later weer aanzetten: SHOP_ONLINE op true, hier en in apps/website/bestellen.js. */}
          {SHOP_ONLINE ? <>
            <p className="eyebrow">Online bestellen</p>
            <h2 className="h2">Bestel vooraf, haal op in de winkel</h2>
            <p className="lead">Kies je producten, kies een moment om op te halen en betaal online. Wat je hier ziet komt rechtstreeks uit de winkel: met de actuele prijs en voorraad.</p>
            <p><a className="btn" href="/abonnementen.html">Stel jouw oogstabonnement samen</a></p>
            <Webshop />
          </> : <>
            <p className="eyebrow">Zelf afrekenen</p>
            <h2 className="h2">Pak, scan en reken zelf af</h2>
            <p className="lead">In de winkel scan je je boodschappen zelf met de zelfkassa, of met je eigen telefoon via de QR-code bij de producten. Je betaalt met een betaalverzoek in je eigen bank-app.</p>
            <p><a className="btn" href="/abonnementen.html">Stel jouw oogstabonnement samen</a></p>
          </>}
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow">In de winkel</p>
            <h2 className="h2">Alles voor de hele week, met een verhaal</h2>
            <Checklist items={[
              "Rauwe melk van onze Jersey koeien",
              "Groenten uit eigen tuin",
              "Vlees van dieren die bij ons opgroeien",
              "Thee van het Thee Atelier en koffie van Op Kop Koffie",
              "Droge worst van de Palingfabriek, honing van lokale imkers",
              "Ambachtelijk bier, vers meel en havermout",
            ]} />
            <p className="lead">Door ons restaurant hebben we toegang tot bijzondere producten die je niet zomaar ergens anders vindt. Ons doel: dat je bij ons alles haalt wat je voor de hele week nodig hebt.</p>
          </div>
          <div className="split__photo arch">
            <Picture slug="kaas" alt="Een Bastiaansen kaas van Boer Bart" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section section--sand">
        <div className="wrap split split--rev">
          <div className="split__text">
            <p className="eyebrow">Experiment</p>
            <h2 className="h2">Deel jouw oogst</h2>
            <p className="lead">Heb jij een moestuin die meer oplevert dan je zelf opeet? Onze winkel staat open voor iedereen die met aandacht geteelde groenten of andere producten wil delen of verkopen, rechtstreeks van jezelf.</p>
            <p className="note"><Icon name="info" />Interesse? Vraag ernaar in de winkel of neem contact met ons op.</p>
          </div>
          <div className="split__photo arch">
            <Picture slug="kippen" alt="Scharrelkippen op het erf" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <CtaBand title="Vragen over het assortiment?" text="Bel of mail Rianne. Ze vertelt je graag wat er deze week in de winkel ligt." cta="Neem contact op" href={paths.contact} />
    </>
  );
}
