import { Seo, abs, businessId, openingHours } from "../components/Seo";
import { PageHero, Facts, Checklist, CtaBand, Gallery } from "../components/Blocks";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { VisitPlanner } from "../components/VisitPlanner";
import { prices, site } from "../content/site";
import { openText } from "../content/live";
import { paths } from "../routes";

export function Speelboerderij() {
  return (
    <>
      <Seo
        page="speelboerderij"
        title="Speelboerderij bij Heerenveen | Boer Bart Rotstergaast"
        desc="Veilig spelen binnen de hekken, eieren rapen en kalfjes melk geven. Volwassenen gratis, entree per kind. Speelboerderij Boer Bart in Rotstergaast."
        image="/og/speelboerderij.jpg"
        crumbs={[{ name: "Speelboerderij", path: paths.speelboerderij }]}
        jsonld={[{ "@type": ["TouristAttraction", "Playground"], "@id": abs(`${paths.speelboerderij}#speelboerderij`), name: "Speelboerderij Boer Bart", description: "Speelboerderij op een biologische boerderij voor kinderen van 1 tot en met 8 jaar.", parentOrganization: { "@id": businessId }, openingHoursSpecification: openingHours("speelboerderij"), isAccessibleForFree: false, publicAccess: true, touristType: "Gezinnen met jonge kinderen" }]}
      />
      <PageHero
        eyebrow="Speelboerderij"
        title="Zij op avontuur, jij aan de koffie"
        photo="kinderen-kippen"
        alt="Kinderen tussen de kippen bij de oude trekker"
        lead={<p>Een veilige plek waar kinderen binnen de hekken op avontuur gaan, op traptrekkers, skelters, trampolines en bij de waterpompen. En een keuken die het bezoek ook voor jou de moeite waard maakt.</p>}
      >
        <a className="btn" href="#plannen">Plan je bezoek<Icon name="arrow" /></a>
      </PageHero>

      <section className="section section--tight">
        <div className="wrap">
          <Facts items={[
            ["euro", "Entree", prices.entreeKind ? <>{prices.entreeKind} per kind van 1 tot 10 jaar. Volwassenen en baby's gratis.</> : <>Per kind van 1 tot 10 jaar. Volwassenen en baby's gratis.</>],
            ["calendar", "Open", openText("speelboerderij")],
            ["users", "Voor wie", "Heel geschikt voor kinderen van 1 tot en met 8 jaar."],
            ["clock", "Na 16.30 uur", "Kom je pannenkoeken eten? Dan spelen de kinderen gratis."],
          ]} />
        </div>
      </section>

      <section className="section section--sand" id="plannen">
        <div className="wrap planner__wrap">
          <div>
            <p className="eyebrow">Plan je bezoek</p>
            <h2 className="h2">Wanneer komen jullie spelen?</h2>
            <p className="lead">Kies een dag en een tijdblok. Zet je bezoek daarna in je agenda, of stuur het naar opa, oma of vrienden die mee willen.</p>
          </div>
          <VisitPlanner />
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow">Wat is er te doen</p>
            <h2 className="h2">Een echte boerderij, geen pretpark</h2>
            <p className="lead">Wij zijn van oorsprong een biologische boerderij met Jersey koeien en kippen, een winkel, een tuin en een speeltuin. Kinderen ontdekken hier hoe het boerenleven echt is.</p>
            <Checklist items={[
              "Traptrekkers, skelters, trampolines en waterpompen",
              "Eieren zoeken in de kipcaravan",
              "Kalfjes melk geven, als er kalfjes zijn",
              "Het boerenpaad: slingeren over de sloot en handen wassen in de waterval",
              "Alles binnen de hekken, dus jij kunt ontspannen",
            ]} />
          </div>
          <div className="split__photo arch">
            <Picture slug="boerenpaad-brug" alt="Een jongen loopt over het bruggetje van het boerenpaad" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section section--sand" id="eten">
        <div className="wrap split split--rev">
          <div className="split__text">
            <p className="eyebrow">Eten en drinken</p>
            <h2 className="h2">Aan tafel bij Rianne en Bart</h2>
            <p className="lead">Iedere week koken we met wat het seizoen en ons land ons geven. Daarom staat er een vers bereid weekgerecht op de kaart: jij kiest de portie en of je het met of zonder vlees wilt.</p>
            <ul className="menu">
              <li><strong>Pannenkoeken</strong> van eigen Jersey melk, eieren uit de kipcaravan en meel uit de molen van Woudsend</li>
              <li><strong>Verse frietjes</strong>, zelf gesneden en gebakken in ossenwit</li>
              <li><strong>Tosti</strong> op huisgemaakt zuurdesembrood</li>
              <li><strong>Koffie</strong> van Op Kop Koffie, met onze eigen melk</li>
            </ul>
          </div>
          <div className="split__photo arch">
            <Picture slug="bart-groente" alt="Bart en de kok met verse groenten uit eigen tuin in de keuken" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Gallery items={[["speelterrein", "Het speelterrein met trekkers en de schuur"], ["traptrekkers", "Een rij groene traptrekkers"], ["waterpomp", "Een peuter bij de waterpomp"], ["sloot-avontuur", "Kinderen bij de sloot"], ["kind-en-boer", "Een kind met de boer bij de kippen"], ["eieren", "Twee kinderen met hun eieren"]]} />
          <p className="note"><Icon name="chat" />Wil je een appje als we een evenement organiseren? Stuur je naam en nummer naar {site.whatsappEvents}.</p>
        </div>
      </section>

      <CtaBand title="Kom spelen op de boerderij" text="Kies een dag en zet hem in je agenda. Kom je met een grote groep? Laat het ons even weten." cta="Plan je bezoek" href={`${paths.speelboerderij}#plannen`} />
    </>
  );
}
