import Link from 'next/link';
import {PageHead,Pill,NotBuilt} from '../ui';
export default function Marketing(){
 return <div data-bb-view="marketing"><PageHead eyebrow="MARKETING & WEBSITE" title="Marketing & AI" sub="Van lege tafels en weekgerechten naar gerichte, goedgekeurde communicatie."/>
  <NotBuilt what="Bezettingsanalyse en marketingvoorstellen worden nog gebouwd."/>
  <div className="grid two section-gap"><div className="card"><div className="card-head"><h3 className="card-title">Bezetting</h3><Pill color="orange">Wacht op reserveringen</Pill></div><p className="small">Zodra tafels en reserveringen centraal worden vastgelegd, toont dit blok de bezetting ten opzichte van het doel en signaleert het rustige momenten.</p><div className="progress"><span style={{width:'0%'}}></span></div></div>
   <div className="ai-box"><div className="eyebrow" style={{color:'#cce0ce'}}>✧ WERKWIJZE AI</div><h2 style={{fontSize:24}}>Echte beelden, geen onnodige korting</h2><p>AI gebruikt eigen gegevens over reserveringen, bestellingen en verkochte producten om voorstellen te doen. Elk voorstel komt eerst in Goedkeuringen; er wordt niets automatisch geplaatst.</p><Link className="btn secondary sm" href="/goedkeuringen">Naar goedkeuringen</Link></div></div>
  <div className="grid three section-gap">{[['Instagram & Facebook','Persoonlijke verhalen, echte beelden en aanbiedingen'],['Google Maps & reviews','Openingstijden, menukaart, reviews en vindbaarheid'],['E-mail & bestaande gasten','Gerichte berichten, uitsluitend met geldige toestemming']].map(([t,d])=><div className="card" key={t}><h3 className="card-title">{t}</h3><p className="small">{d}</p><Pill color="orange">Nog te koppelen</Pill></div>)}</div>
 </div>
}
