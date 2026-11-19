import {isSameOrigin} from '@/lib/portable/origin';
import {getDb} from '@/db';
import {orders,orderLines,workStatus} from '@/db/schema';
import {eq,and,asc,or,ne,gte,isNull,inArray,sql} from 'drizzle-orm';
import {stations,canMove} from '@/lib/work-status';
import {notifyReady,resetReady} from '@/lib/push';
import type {SaleLine} from '@/lib/orders';
import {GUEST_ORDER_STATUS} from '@/lib/public-orders';
import {orderPeriod} from '@/lib/orders';
import {fillForGroups} from '@/lib/group-bill';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>Response.json({error},{status});
export async function GET(req:Request){
 const station=new URL(req.url).searchParams.get('station');if(!stations.some(s=>s===station))return fail('Kies Kok, Barista of Winkel.');
 // Onderling inkopen (6 november 2026) gaat nooit naar een werkplek: de kok heeft het zelf al uit de winkel gehaald.
 // Online guest orders that still wait for payment are not shown (they go to the station once paid).
 // Only orders with lines for this station that are still open, or were finished in the last 24 hours (shown under Afgerond).
 // Elke dag schoon (besluit eigenaar 4 november 2026): alleen bestellingen van vandaag (Nederlandse tijd), plus
 // afhaalbestellingen met een afhaaldag vanaf vandaag. Oude, nooit afgemelde bestellingen (ook proefbestellingen) verdwijnen
 // de volgende dag van de werkplek; ze blijven gewoon bewaard bij de bestellingen.
 const db=getDb(),since=new Date(Date.now()-86400000).toISOString();
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),dayStart=orderPeriod(today,today)!.from;
 const rows=await db.select({order:orders,status:workStatus.status,version:workStatus.version,updated:workStatus.updated}).from(orders)
  .leftJoin(workStatus,eq(workStatus.id,sql`${orders.id}||':'||${station}`))
  .where(and(ne(orders.status,GUEST_ORDER_STATUS),ne(orders.mode,'onderling'),inArray(orders.id,db.select({id:orderLines.orderId}).from(orderLines).where(eq(orderLines.station,station!))),or(isNull(workStatus.status),ne(workStatus.status,'gereed'),gte(workStatus.updated,since)),or(gte(orders.created,dayStart),sql`(${orders.data}::jsonb->'pickup'->>'date') >= ${today}`)))
  .orderBy(asc(orders.id));
 // Gezamenlijke rekening (wens eigenaar 5 november 2026): naam van de rekening, wie bestelde en hoe vol de rekening is (balk).
 const bills=await fillForGroups([...new Set(rows.map(x=>x.order.groupCodeId).filter((x):x is string=>!!x))]);
 // Zelfscan en zelfkassa (wens eigenaar 13 november 2026: „de zelfscankassa hoeft niet in de winkel te verschijnen”): een
 // winkelbestelling zonder afhaalmoment heeft de klant al zelf meegenomen; alleen afhalen komt op de werkplek.
 const result=rows.filter(({order:r})=>{const d=JSON.parse(r.data);return !(d.mode==='winkel'&&!d.pickup)}).map(({order:r,status,version,updated})=>{const data=JSON.parse(r.data);const lines=(data.lines as SaleLine[]).filter(l=>l.station===station);const bill=r.groupCodeId?bills.get(r.groupCodeId):undefined;
  return {id:r.id,number:'P'+String(r.id).padStart(5,'0'),reference:data.reference,mode:data.mode,created:r.created,lines,status:status||'nieuw',version:version||0,updated:updated||r.created,test:data.test===true,
   ...(bill?{bill:{...bill,orderedBy:data.guest?.name||''}}:{})}});
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
}
export async function PUT(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 try{const b=await req.json() as {orderId:number,station:string,status:string,version:number};if(!Number.isInteger(b.orderId)||!stations.some(s=>s===b.station)||!Number.isInteger(b.version)||b.version<0)return fail('Ongeldige werkplek of bestelling.');
 const db=getDb();const order=await db.select().from(orders).where(eq(orders.id,b.orderId));if(!order[0])return fail('Bestelling niet gevonden.',404);
 if(order[0].status===GUEST_ORDER_STATUS)return fail('Deze bestelling wacht nog op betaling.',409);const data=JSON.parse(order[0].data);if(!(data.lines as SaleLine[]).some(l=>l.station===b.station))return fail('Deze bestelling heeft geen regels voor deze werkplek.',404);
 const id=b.orderId+':'+b.station;const rows=await db.select().from(workStatus).where(eq(workStatus.id,id));const old=rows[0];if((old?.version||0)!==b.version)return fail('De status is intussen gewijzigd. Ververs de lijst.',409);if(!canMove(old?.status||'nieuw',b.status))return fail('Deze statuswijziging is niet mogelijk.');
 const updated=new Date().toISOString();let changes;
 if(old){changes=await db.update(workStatus).set({status:b.status,version:old.version+1,updated}).where(and(eq(workStatus.id,id),eq(workStatus.version,b.version))).returning({id:workStatus.id})}else{changes=await db.insert(workStatus).values({id,status:b.status,version:1,updated}).onConflictDoNothing().returning({id:workStatus.id})}
 if(!changes.length)return fail('Een andere medewerker heeft de status gewijzigd. Ververs de lijst.',409);
 // Gereed: pushmelding naar de gast als die zich heeft aangemeld. Wachten tot hij verstuurd is (melding eigenaar 14 november 2026: de
 // gast kreeg niets). Op Cloud Run krijgt de server na het antwoord geen rekentijd meer, dus een melding „op de achtergrond” bleef
 // hangen terwijl hij al als verstuurd stond. Hooguit 5 seconden per telefoon; een fout houdt de werkplek niet tegen.
 if(b.status==='gereed')await notifyReady(b.orderId,b.station,b.version+1);
 // Teruggehaald na Gereed (een foutje): bij het volgende Gereed weer een melding (melding eigenaar 14 november 2026).
 else if(old?.status==='gereed')await resetReady(b.orderId,b.station);
 return Response.json({ok:true,status:b.status,version:b.version+1,updated});
 }catch{return fail('De status kon niet worden opgeslagen. Probeer opnieuw.',500)}
}
