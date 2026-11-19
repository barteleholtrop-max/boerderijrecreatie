// Voor een medewerker zonder aangevinkte onderdelen (rechten per onderdeel, besluit eigenaar 6 november 2026).
import {PageHead} from '../ui';
export default function GeenOnderdelen(){
 return <div><PageHead eyebrow="TOEGANG" title="Nog geen onderdelen" sub="Je bent ingelogd, maar er staat nog geen onderdeel van de backoffice voor je open."/>
  <div className="notice info"><div>Vraag een eigenaar om je onder <strong>Instellingen → Toegang</strong> de onderdelen te geven die je nodig hebt, bijvoorbeeld Planning. Daarna log je opnieuw in.</div></div></div>;
}
