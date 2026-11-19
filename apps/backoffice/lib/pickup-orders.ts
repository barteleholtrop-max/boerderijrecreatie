// Online afhaalbestellingen van de winkel in Planning en de weekagenda (3 november 2026). Alleen lezen: de bestelling
// zelf blijft in `orders` (één bron); hier wordt ze als afhaalmoment getoond zodra ze echt doorgaat (betaald, niets te
// betalen of op groepsrekening). Wacht ze nog op betaling, dan staat ze er niet in.
import {getDb} from '@/db';
import {orders,harvestPeriods,harvestSubscriptions,harvestCollections} from '@/db/schema';
import {and,like,ne,eq} from 'drizzle-orm';
import {GUEST_ORDER_STATUS,orderNumber} from './public-orders';
import type {PickupChoice} from './pickup-core';
export const ONLINE_PICKUP_PREFIX='online:';
export async function onlinePickups(){
 const db=getDb();
 const harvest=await db.select({id:harvestPeriods.id,data:harvestPeriods.data,name:harvestSubscriptions.name}).from(harvestPeriods).innerJoin(harvestSubscriptions,eq(harvestSubscriptions.id,harvestPeriods.subscriptionId)).innerJoin(orders,eq(orders.id,harvestPeriods.orderId)).where(eq(orders.paymentStatus,'betaald'));
 const collections=await db.select().from(harvestCollections);
 const rows=await getDb().select({id:orders.id,data:orders.data,status:orders.status}).from(orders).where(and(ne(orders.status,GUEST_ORDER_STATUS),like(orders.data,'%"pickup":{%')));
 const regular=rows.flatMap(r=>{const d=JSON.parse(r.data) as {pickup?:PickupChoice|null;lines?:{name:string;quantity:number}[];subscriptionId?:string};if(d.subscriptionId||!d.pickup)return [];
  return [{id:ONLINE_PICKUP_PREFIX+r.id,date:d.pickup.date,time:d.pickup.time,name:d.pickup.name,description:`Online ${orderNumber(r.id)} · `+(d.lines||[]).map(l=>`${l.quantity}× ${l.name}`).join(', ').slice(0,300),status:'besteld' as const}]});
 return [...regular,...harvest.flatMap(h=>{const d=JSON.parse(h.data) as {time:string;pickups:{date:string;items:{name:string}[]}[]};return d.pickups.map(p=>({id:'harvest:'+h.id+':'+p.date,date:p.date,time:d.time,name:h.name,description:'Oogstabonnement · '+p.items.map(i=>i.name).join(', '),status:collections.find(c=>c.periodId===h.id&&c.date===p.date)?.collected?'afgehaald' as const:'besteld' as const}))})];
}
