import {getDb} from '@/db';
import {products} from '@/db/schema';
import {isNotNull} from 'drizzle-orm';
import {env} from '@/lib/portable/env';
import {publicProducts} from '@/lib/public-products';
import {publicWeekMenus,type ConfirmedMenu} from '@/lib/public-weekmenu';
import {amsterdamDate,mondayOf} from '@/lib/assistant-core';
export const dynamic='force-dynamic';
// Public, read-only endpoint for the website (no login; see proxy.ts): the confirmed weekmenu of this week and next.
// Read at most once per minute. On a failure: 503, never an old or guessed menu.
const TTL=60000;let cache:{at:number;body:string}|null=null;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  if(!cache||Date.now()-cache.at>TTL){
   const thisWeek=mondayOf(amsterdamDate(new Date()));
   const menus=(await env.DB.prepare(`SELECT id, week FROM week_menus WHERE status='bevestigd' AND week>=? ORDER BY week LIMIT 2`).bind(thisWeek).all()).results as {id:string;week:string}[];
   const confirmed:ConfirmedMenu[]=[];
   for(const m of menus){const items=(await env.DB.prepare(`SELECT product_id AS "productId", day, note FROM week_menu_items WHERE menu_id=? ORDER BY position`).bind(m.id).all()).results as ConfirmedMenu['items'];confirmed.push({week:m.week,items})}
   const rows=await getDb().select({id:products.id,version:products.version,published:products.published}).from(products).where(isNotNull(products.published));
   cache={at:Date.now(),body:JSON.stringify({weeks:publicWeekMenus(confirmed,publicProducts(rows),thisWeek),updated:new Date().toISOString()})};
  }
  return new Response(cache.body,{headers});
 }catch{
  return Response.json({error:'Het weekmenu is tijdelijk niet beschikbaar.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
}
