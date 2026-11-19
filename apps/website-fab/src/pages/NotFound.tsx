import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { nav } from "../content/site";

export function NotFound() {
  return (
    <>
      <Seo page="404" title="Pagina niet gevonden | Boer Bart" desc="Deze pagina bestaat niet (meer). Kies hieronder waar je naartoe wilt op de website van Boer Bart in Rotstergaast." />
      <section className="section section--top">
        <div className="wrap narrow center">
          <p className="eyebrow">404</p>
          <h1 className="h1">Deze pagina is weggelopen</h1>
          <p className="lead">Misschien zoek je een van deze:</p>
          <ul className="chips">
            {nav.map(([k, label, href]) => <li key={k}><Link to={href}>{label}<Icon name="chevR" /></Link></li>)}
          </ul>
        </div>
      </section>
    </>
  );
}
