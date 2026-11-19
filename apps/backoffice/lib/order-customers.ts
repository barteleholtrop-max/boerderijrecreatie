// Klantenkaart uit bestellingen (wens eigenaar 8 november 2026): „De gasten hoeven één keer hun gegevens in te vullen. Daarmee ontstaat een
// klantenkaart.” Alleen met toestemming: de gast vinkt „Onthoud mij als klant van Boerderijrecreatie” aan op de bestelpagina (orders.request.klant).
// - Gekoppeld op e-mailadres aan de bestaande klantenkaart (Gesprekken & klanten, lib/guest-customers.ts); een naam alleen koppelt nooit.
// - Telt: bestellingen die als omzet tellen (niet wachtend op betaling, niet terugbetaald), geen proefbestellingen.
// - Vergeten (AVG): haalt de klantgegevens uit de bestellingen. De bestelling zelf blijft (boekhouding), zonder naam en e-mail.
import {getDb} from '@/db';
import {orders,orderLines} from '@/db/schema';
import {inArray,sql} from 'drizzle-orm';
import {countsAsRevenue,paidAmounts} from './order-revenue';
import type {CardOrders} from './guest-customers';

type Klant={name?:string;email?:string;phone?:string;consent?:boolean};
const klantOf=(request:string):Klant|null=>{try{const k=(JSON.parse(request) as {klant?:Klant}).klant;return k&&k.consent===true&&typeof k.email==='string'&&k.email?k:null}catch{return null}};
/** Per e-mailadres: de bestellingen van gasten die toestemming gaven. */
export async function orderCustomers():Promise<CardOrders[]>{
 const db=getDb(),rows=(await db.select().from(orders).where(sql`${orders.request} LIKE '%"klant":%'`)).filter(o=>o.test!==1&&countsAsRevenue(o));
 const by=new Map<string,CardOrders&{ids:number[]}>();
 for(const o of rows){const k=klantOf(o.request);if(!k)continue;const email=k.email!.trim().toLowerCase();
  const c=by.get(email)??{email,name:k.name||email,phone:k.phone||'',count:0,totalCents:0,first:o.created,last:o.created,favorites:[],recent:[],ids:[]};
  c.count++;c.totalCents+=paidAmounts(o).cents;if(o.created<c.first)c.first=o.created;if(o.created>=c.last){c.last=o.created;c.name=k.name||c.name;c.phone=k.phone||c.phone}
  c.recent.push({id:o.id,created:o.created,cents:paidAmounts(o).cents,reference:o.reference});c.ids.push(o.id);by.set(email,c)}
 const all=[...by.values()],ids=all.flatMap(c=>c.ids),lines=ids.length?await db.select({orderId:orderLines.orderId,name:orderLines.name,quantity:orderLines.quantity}).from(orderLines).where(inArray(orderLines.orderId,ids)):[];
 return all.map(({ids:own,...c})=>{const count=new Map<string,number>();for(const l of lines)if(own.includes(l.orderId))count.set(l.name,(count.get(l.name)||0)+l.quantity);
  return {...c,recent:c.recent.sort((a,b)=>b.created.localeCompare(a.created)).slice(0,10),favorites:[...count].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'nl')).slice(0,3).map(([name,quantity])=>({name,quantity}))}});
}
/** Vergeten op verzoek: naam, e-mail en telefoon uit de bestellingen van dit e-mailadres. Geeft het aantal bestellingen terug. */
export async function forgetOrderCustomer(email:string){
 const e=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))throw Error('Ongeldig e-mailadres.');
 const db=getDb(),rows=(await db.select({id:orders.id,request:orders.request}).from(orders).where(sql`${orders.request} LIKE '%"klant":%'`)).filter(o=>klantOf(o.request)?.email?.trim().toLowerCase()===e);
 for(const o of rows){const r=JSON.parse(o.request) as Record<string,unknown>;delete r.klant;await db.update(orders).set({request:JSON.stringify(r)}).where(sql`${orders.id}=${o.id}`)}
 return rows.length;
}
