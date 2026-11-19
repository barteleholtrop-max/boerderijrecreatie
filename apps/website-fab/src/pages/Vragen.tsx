import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { faq, site } from "../content/site";
import { paths } from "../routes";

export function Vragen() {
  return (
    <>
      <Seo
        page="vragen"
        title="Veelgestelde vragen | Boer Bart Rotstergaast"
        desc="Openingstijden, entree, reserveren, lunchen en de jaarkaart: antwoorden op de vragen die we het vaakst krijgen over een bezoek aan Boer Bart."
        crumbs={[{ name: "Veelgestelde vragen", path: paths.vragen }]}
        jsonld={[{ "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }]}
      />
      <section className="section section--top">
        <div className="wrap narrow">
          <p className="eyebrow">Goed om te weten</p>
          <h1 className="h1">Veelgestelde vragen</h1>
          <div className="faq">
            {faq.map(([q, a]) => (
              <details key={q} className="faq__item">
                <summary>{q}<Icon name="chevD" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="lead">Staat je vraag er niet bij? Bel, app of mail ons gerust via <a href={`tel:${site.phoneIntl}`}>{site.phone}</a> of <a href={`mailto:${site.email}`}>{site.email}</a>.</p>
          <Link className="btn" to={paths.contact}>Naar contact<Icon name="arrow" /></Link>
        </div>
      </section>
    </>
  );
}
