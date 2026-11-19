import { Seo, abs, businessId, openingHours } from "../components/Seo";
import { PageHero, Facts, CtaBand } from "../components/Blocks";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { YteRequest } from "../components/YteRequest";
import { prices, site } from "../content/site";
import { openText } from "../content/live";
import { paths } from "../routes";

export function Yte() {
  return (
    <>
      <Seo
        page="yte"
        title="Ite by Boer Bart | Boerderijdiner in Friesland"
        desc={`Een avond op de boerderij: zes tot zeven gangen van eigen land, gekookt door chef Guust de Nijs. Reserveer een tafel in Rotstergaast.`}
        image="/og/yte.jpg"
        crumbs={[{ name: "Ite", path: paths.yte }]}
        jsonld={[{ "@type": "Restaurant", "@id": abs(`${paths.yte}#yte`), name: "Ite by Boer Bart", description: "Boerderijdiner met zes tot zeven gangen van de eigen biologische boerderij.", parentOrganization: { "@id": businessId }, servesCuisine: ["Seizoensgebonden", "Biologisch", "Fries"], acceptsReservations: true, ...(prices.yte ? { priceRange: `${prices.yte} per persoon` } : {}), openingHoursSpecification: openingHours("yte"), address: { "@type": "PostalAddress", streetAddress: site.street, postalCode: site.postalCode, addressLocality: site.city, addressCountry: "NL" }, telephone: site.phoneIntl }]}
      />
      <PageHero
        eyebrow="Ite by Boer Bart"
        title="De boerderij, gepresenteerd op je bord"
        photo="yte-tafel"
        alt="De lange gedekte tafel van Ite met uitzicht op de boerderij"
        lead={<p>Dit is geen restaurant zoals je ze kent. Op een Ite-avond proef je onze biologische boerderij: puur, eerlijk en verrassend. Alles op tafel vertelt het verhaal van onze dieren, ons land en onze missie om 1000 jaar te bestaan.</p>}
      >
        <a className="btn" href="#reserveren">Reserveer een tafel<Icon name="arrow" /></a>
      </PageHero>

      <section className="section section--tight">
        <div className="wrap">
          <Facts items={[
            ["calendar", "Wanneer", openText("yte")],
            ["fork", "Menu", "Zes tot zeven gangen, wat die dag is geoogst"],
            ...(prices.yte ? [["euro", "Prijs", `${prices.yte} per persoon, exclusief wijn`] as [string, string, string]] : []),
            ["info", "Goed om te weten", "Een avond voor volwassenen, niet geschikt voor kinderen"],
          ]} />
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow">Dit mag je verwachten</p>
            <h2 className="h2">Een avond die begint op het erf</h2>
            <p className="lead">Om 19.00 uur ontvangen we je op de boerderij: een warm welkom en meteen het gevoel dat je thuiskomt. Wat de chef die dag heeft geoogst in de tuin, de kas of de boerderijwinkel, verandert hij dezelfde middag nog in een verrassend menu.</p>
            <p className="lead">Bij de gerechten kun je kiezen voor vier bijzondere wijnen. Heeft iemand in je gezelschap een allergie of dieetwens? Geef het door bij je reservering, dan houden we er rekening mee.</p>
          </div>
          <div className="split__photo arch">
            <Picture slug="yte-keuken" alt="De chef en een kok aan het werk in de open keuken" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section section--sand" id="reserveren">
        <div className="wrap planner__wrap">
          <div>
            <p className="eyebrow">Reserveren</p>
            <h2 className="h2">Schuif aan op een Ite-avond</h2>
            <p className="lead">Kies een avond en laat weten met hoeveel jullie komen. Je aanvraag komt direct bij ons binnen; we bevestigen je plek zo snel mogelijk.</p>
            <p>Bij Ite word je persoonlijk bediend. Je hoeft aan tafel niets met je telefoon te bestellen.</p>
          </div>
          <YteRequest />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Het team</p>
          <h2 className="h2">Boer en chef aan dezelfde tafel</h2>
          <div className="team">
            <article className="team__card">
              <div className="team__photo arch"><Picture slug="yte-chef" alt="Chef-kok Guust de Nijs in zijn schort" sizes="(min-width: 900px) 30vw, 100vw" focus="50% 20%" /></div>
              <h3 className="h3">Guust de Nijs, chef-kok</h3>
              <p>Opgegroeid op een gemengde boerderij in de polder, waar hij van zijn moeder alles leerde over smaak. Met zijn vrouw Colinde runde hij van 1992 tot 2024 Le Mirage in Emmeloord. Nu presenteert hij de boerderij in zes tot zeven gerechten.</p>
            </article>
            <article className="team__card">
              <div className="team__photo arch"><Picture slug="yte-chef-bart" alt="Chef Guust de Nijs en boer Bart in het restaurant" sizes="(min-width: 900px) 30vw, 100vw" /></div>
              <h3 className="h3">De schakel tussen land en keuken</h3>
              <p>Doordat we zelf met de producten werken, weten we als boer welk effect onze keuzes hebben op de smaak. Die schakel tussen boerderij en restaurant maakt Ite uniek.</p>
            </article>
            <article className="team__card team__card--text">
              <p className="team__quote">"We vinden het oprecht heel leuk dat we u mogen ontvangen."</p>
              <h3 className="h3">Lianne Bokma, maître</h3>
              <p>Gastvrijheid is voor Lianne geen rol maar een tweede natuur. Ze ontvangt iedereen alsof het haar vrienden zijn en zorgt dat alles tot in de puntjes klopt. Favoriet: het nagerecht met kletskopjes.</p>
            </article>
          </div>
        </div>
      </section>

      <CtaBand title="Schuif aan bij Ite" text="Reserveer een tafel, dan houden we een plek voor je vrij." cta="Reserveer een tafel" href={`${paths.yte}#reserveren`} />
    </>
  );
}
