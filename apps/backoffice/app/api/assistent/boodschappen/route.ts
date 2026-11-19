import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {shoppingList,setChecked,addItem,updateItem,ShoppingError} from '@/lib/boodschappen';
export const dynamic='force-dynamic';
// Boodschappenlijst bij de Weekassistent (wens eigenaar 9 november 2026): lezen, het vinkje „besteld”, en zelf iets toevoegen of weghalen.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof ShoppingError?json({error:e.message},e.status):(console.error('[boodschappen]',e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
export async function GET(req:Request){try{authorizeSheet(req);return json(await shoppingList(new URL(req.url).searchParams.get('week')||''))}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);const b=await req.json().catch(()=>({})) as Record<string,unknown>,by=req.headers.get('x-boer-bart-account')||'eigenaar';
 if(b.action==='toevoegen')return json(await addItem(String(b.week||''),b.name,b.amount,by));
 if(b.action==='item'){await updateItem(b.id,{checked:b.checked===true},by);return json({ok:true})}
 if(b.action==='weghalen'){await updateItem(b.id,{removed:true},by);return json({ok:true})}
 return json(await setChecked(String(b.week||''),String(b.ingredientId||''),b.checked===true,String(b.requestId||''),by));
}catch(e){return fail(e)}}
