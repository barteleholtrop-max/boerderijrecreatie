import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { paths } from "../routes";

export function Verstuurd() {
  return (
    <>
      <Seo page="verstuurd" title="Aanvraag ontvangen | Boer Bart" desc="Je aanvraag is bij ons binnen. We nemen zo snel mogelijk contact met je op om alles te bevestigen." noindex />
      <section className="section section--top">
        <div className="wrap narrow center">
          <p className="eyebrow">Dank je wel</p>
          <h1 className="h1">Je aanvraag is binnen</h1>
          <p className="lead">We nemen zo snel mogelijk contact met je op om alles te bevestigen. Tot snel op de boerderij.</p>
          <Link className="btn" to={paths.home}>Terug naar de homepage<Icon name="arrow" /></Link>
        </div>
      </section>
    </>
  );
}
