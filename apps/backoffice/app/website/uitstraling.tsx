// Website & uitstraling → „Uitstraling bestelapp” (wens eigenaar 9 november 2026): één bestelapp, meerdere uitstralingen.
// De keuze geldt voor alle gasten; „Bekijk” opent de bestelapp in die uitstraling zonder iets te wijzigen (?uitstraling=…).
import {allowedOrigins} from '@/lib/public-orders';
import {sites} from '@/lib/website-links';
import {getUitstraling,UITSTRALINGEN} from '@/lib/uitstraling';
import {UitstralingKiezen} from './uitstraling-kiezen';
export async function Uitstraling(){
 const current=await getUitstraling().catch(()=>null);
 const site=sites(allowedOrigins()).find(s=>s.id==='website')?.url||null;
 return <section className="card section-gap" data-bb-view="website-uitstraling" aria-labelledby="uitstraling-title">
  <div className="card-head"><h3 className="card-title" id="uitstraling-title">Uitstraling bestelapp</h3><span className="small">Geldt voor alle gasten, op de huidige website</span></div>
  {current?<UitstralingKiezen options={UITSTRALINGEN.map(u=>({...u}))} current={current.uitstraling} version={current.version} site={site}/>
   :<p className="small">De uitstraling kan nu niet worden gelezen. Ververs de pagina en probeer het opnieuw.</p>}
 </section>;
}
