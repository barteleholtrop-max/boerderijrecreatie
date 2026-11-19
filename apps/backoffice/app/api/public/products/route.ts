import {getDb} from '@/db';
import {products} from '@/db/schema';
import {isNotNull} from 'drizzle-orm';
import {publicProducts} from '@/lib/public-products';
import {availableForWebsite} from '@/lib/stock-sales';
import {productSuppliers,productCompanies} from '@/lib/product-suppliers';
import {cachedStationStatuses} from '@/lib/station-open';
export const dynamic='force-dynamic';
// Public, read-only endpoint for the website (no login; see proxy.ts). Kept light: one database read per minute at most.
// Voorraad: zoals bij bestellen, min wat wachtende (nog niet betaalde) bestellingen vasthouden (#141).
// Werkplek open of dicht (wens eigenaar 14 november 2026): de stand wordt per verzoek toegepast (zelf 15 seconden bewaard), zodat
// „Nu niet beschikbaar” op een werkplek snel in de bestelapp staat. De werkplek zelf gaat niet naar buiten, alleen de reden.
const TTL=60000;let cache:{at:number;body:string;station:Map<string,string>}|null=null;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=15','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
const stationOf=(rows:{id:string;published:string|null}[])=>new Map(rows.flatMap(r=>{try{const st=(JSON.parse(r.published||'{}') as {station?:unknown}).station;return typeof st==='string'?[[r.id,st] as [string,string]]:[]}catch{return []}}));
export async function GET(){
 try{
  if(!cache||Date.now()-cache.at>TTL){const rows=await getDb().select({id:products.id,version:products.version,published:products.published}).from(products).where(isNotNull(products.published));cache={at:Date.now(),body:JSON.stringify({products:publicProducts(rows,await availableForWebsite(rows),await productSuppliers().catch(()=>new Map<string,string>()),await productCompanies().catch(()=>new Map<string,string>())),updated:new Date().toISOString()}),station:stationOf(rows)};}
  const closed=Object.entries(await cachedStationStatuses()).filter(([,v])=>!v.open);
  if(!closed.length)return new Response(cache.body,{headers});
  const reasons=new Map(closed.map(([k,v])=>[k,v.reason])),data=JSON.parse(cache.body) as {products:{id:string;available:boolean;closed?:string}[]};
  for(const p of data.products){const r=reasons.get(cache.station.get(p.id)||'');if(r){p.available=false;p.closed=r}}
  return new Response(JSON.stringify(data),{headers});
 }catch{
  // No stale or guessed prices: the website shows that the range is temporarily unavailable.
  return Response.json({error:'Het aanbod is tijdelijk niet beschikbaar.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
}
