import { Link } from "react-router-dom";
import { Seo, abs, businessId } from "../components/Seo";
import { PageHero, Checklist, CtaBand } from "../components/Blocks";
import { Picture } from "../components/Picture";
import { Icon } from "../components/Icon";
import { prices } from "../content/site";
import { paths } from "../routes";

// Prijs alleen als die in de backoffice staat (Bedrijfsgegevens → Tarieven op de website).
const offer = (id: string, name: string, price: string, desc: string) => ({ "@type": "Offer", "@id": abs(`${paths.groepen}#${id}`), name, description: desc, ...(price ? { price: price.replace(/[^\d,]/g, "").replace(",", "."), priceCurrency: "EUR" } : {}), offeredBy: { "@id": businessId } });

export function Groepen() {
  return (
    <>
      <Seo
        page="groepen"
        title="Kinderfeest en schoolreisje op de boerderij | Boer Bart"
        desc="Kinderfeest op de boerderij, een educatief schoolreisje en groepsuitjes met familie of collega's op de biologische boerderij in Rotstergaast."
        image="/og/groepen.jpg"
        crumbs={[{ name: "Groepen en feesten", path: paths.groepen }]}
        jsonld={[offer("kinderfeest", "Kinderfeest op de boerderij", prices.kinderfeest, "Drie uur kinderfeest vanaf 8 kinderen, prijs per kind."), offer("schoolreisje", "Educatief schoolreisje", prices.schoolreisje, "Schoolreisje voor de onderbouw, prijs per kind.")]}
      />
      <PageHero
        eyebrow="Groepen en feesten"
        title="Samen op avontuur op de boerderij"
        photo="hooiwagen"
        alt="Een grote groep op de hooiwagen achter de trekker"
        lead={<p>Een kinderfeest waar je echt een ei onder een kip vandaan haalt. Een schoolreisje met een Beste Boer-diploma. Of een dag met familie of collega's tussen de koeien.</p>}
      >
        <Link className="btn" to={`${paths.contact}?onderwerp=groep#bezoek`}>Vraag een datum aan<Icon name="arrow" /></Link>
      </PageHero>

      <section className="section" id="kinderfeest">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow">Kinderfeest</p>
            <h2 className="h2">Veilig op avontuur en super leerzaam</h2>
            <p className="price-line">{prices.kinderfeest ? <><strong>{prices.kinderfeest} per kind</strong> <span aria-hidden="true">&middot;</span> </> : null}volwassenen gratis <span aria-hidden="true">&middot;</span> vanaf 8 kinderen <span aria-hidden="true">&middot;</span> 3 uur</p>
            <Checklist items={[
              "Entree en onbeperkt spelen op het speelterrein",
              "Het boerenpaad, onder begeleiding van een volwassene",
              "Muffins versieren",
              "Onbeperkt limonade",
              "Patat of pannenkoek en een ijsje",
              "Eieren rapen uit de kipcaravan en kalfjes melk geven, als er kalfjes zijn",
            ]} />
            <p className="note"><Icon name="calendar" />Op vrijdag en zaterdag, start om 10, 11, 12, 13 of 14 uur.</p>
            <Link className="btn" to={`${paths.contact}?onderwerp=kinderfeest#bezoek`}>Kinderfeest aanvragen<Icon name="arrow" /></Link>
          </div>
          <div className="split__photo arch">
            <Picture slug="eieren" alt="Twee kinderen laten trots hun eieren zien" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section section--sand" id="schoolreisje">
        <div className="wrap split split--rev">
          <div className="split__text">
            <p className="eyebrow">Schoolreisje</p>
            <h2 className="h2">Educatief en alles over de boerderij</h2>
            <p className="price-line">{prices.schoolreisje ? <><strong>{prices.schoolreisje} per kind</strong> <span aria-hidden="true">&middot;</span> </> : null}begeleiders gratis <span aria-hidden="true">&middot;</span> heel geschikt voor de onderbouw</p>
            <p className="lead">Veel spelen binnen de hekken, en met de begeleiding op QR-speurtocht over het boerenpaad. Bij elke code vertellen Bart of Rianne in een kort filmpje wat je ziet. Wie de vragen goed beantwoordt, krijgt een echt Beste Boer-diploma.</p>
            <Checklist items={[
              "Eieren onder de kip vandaan halen, en mee naar huis nemen",
              "Kalfjes melk geven en een spoedcursus tuinieren",
              "Limonade, patat en een waterijsje",
              "Koffie en huisgemaakte taart voor de begeleiders",
            ]} />
            <p className="note"><Icon name="calendar" />Maandag tot en met donderdag, van ongeveer 9.30 tot 14.00 uur. Neem laarzen en een handdoek mee.</p>
            <Link className="btn" to={`${paths.contact}?onderwerp=schoolreisje#bezoek`}>Schoolreisje aanvragen<Icon name="arrow" /></Link>
          </div>
          <div className="split__photo arch">
            <Picture slug="sloot-avontuur" alt="Kinderen op ontdekkingstocht langs de sloot" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="section" id="groepen">
        <div className="wrap split">
          <div className="split__text">
            <p className="eyebrow">Familie, vrienden en collega's</p>
            <h2 className="h2">Een dag op de boerderij met je groep</h2>
            <p className="lead">Een familiedag met een tafelbarbecue, een uitje met collega's of een bijzondere bijeenkomst. Vertel ons wat je wilt, met hoeveel je bent en wanneer. Dan maken we een voorstel op maat.</p>
            <Link className="btn" to={`${paths.contact}?onderwerp=groep#bezoek`}>Vertel ons je wensen<Icon name="arrow" /></Link>
          </div>
          <div className="split__photo arch">
            <Picture slug="groep-land" alt="Een groep mensen zit in het gras op de boerderij" sizes="(min-width: 900px) 45vw, 100vw" />
          </div>
        </div>
      </section>

      <CtaBand title="Een datum vastleggen?" text="Stuur je aanvraag, dan nemen we contact met je op om alles door te spreken." cta="Vraag een datum aan" href={`${paths.contact}?onderwerp=groep#bezoek`} />
    </>
  );
}
