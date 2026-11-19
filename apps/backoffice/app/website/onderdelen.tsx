// Website & uitstraling → „Onderdelen van de hoofdsite” (wens eigenaar 15 november 2026). Zie lib/website-onderdelen.ts.
import {allowedOrigins} from '@/lib/public-orders';
import {sites} from '@/lib/website-links';
import {getOnderdelen,ONDERDELEN} from '@/lib/website-onderdelen';
import {OnderdelenKiezen} from './onderdelen-kiezen';
export async function Onderdelen(){
 const current=await getOnderdelen().catch(()=>null);
 const site=sites(allowedOrigins()).find(s=>s.id==='website-fab')?.url||null;
 return <section className="card section-gap" data-bb-view="website-onderdelen" aria-labelledby="onderdelen-title">
  <div className="card-head"><h3 className="card-title" id="onderdelen-title">Onderdelen van de hoofdsite</h3><span className="small">Per onderdeel open of in ontwikkeling</span></div>
  {current?<OnderdelenKiezen options={ONDERDELEN.map(o=>({...o}))} current={current.onderdelen} version={current.version} site={site}/>
   :<p className="small">De onderdelen kunnen nu niet worden gelezen. Ververs de pagina en probeer het opnieuw.</p>}
 </section>;
}
