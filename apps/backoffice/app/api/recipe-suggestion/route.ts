import Anthropic from '@anthropic-ai/sdk';
import {getDb} from '@/db';
import {products} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {loadOps} from '@/lib/operations-store';
import {anthropicKey,anthropicHeaders} from '@/lib/integrations';
import {suggestionParams,readSuggestion} from '@/lib/recipe-suggest';
import {DEFAULT_CONFIG} from '@/lib/assistant-engine';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
// At most 250 proposals per day per server process: a guard against runaway loops, not a billing limit.
// Raised from 40 on 3 November 2026 (owner): at the start every product needs a recipe.
const LIMIT=250;let day='',used=0;
// Only a proposal: nothing is stored. The owner edits the recipe form and saves it via /api/operations.
export async function POST(req:Request){
 try{
  authorizeSheet(req,true);
  const b=await req.json().catch(()=>null) as {productId?:string;wishes?:string}|null;
  if(!b||typeof b.productId!=='string'||b.productId.length>100||(b.wishes!==undefined&&(typeof b.wishes!=='string'||b.wishes.length>1000)))return json({error:'Kies een verkoopproduct; houd de wensen kort.'},400);
  const row=(await getDb().select().from(products).where(eq(products.id,b.productId)))[0];if(!row)return json({error:'Verkoopproduct niet gevonden.'},404);
  const apiKey=await anthropicKey();if(!apiKey)return json({error:'Voeg eerst een Claude-sleutel toe bij Systeem & koppelingen.'},400);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());if(today!==day){day=today;used=0}
  if(used>=LIMIT)return json({error:'Het maximum aantal receptvoorstellen voor vandaag is bereikt.'},429);used++;
  const draft=JSON.parse(row.draft) as {name?:string;department?:string};
  const ingredients=(await loadOps()).state.ingredients;
  const params=suggestionParams({name:String(draft.name||''),department:String(draft.department||'')},b.wishes||'',ingredients,process.env.ASSISTANT_MODEL||DEFAULT_CONFIG.model);
  const message=await new Anthropic({apiKey,maxRetries:1,timeout:90000,defaultHeaders:await anthropicHeaders()}).messages.create(params);
  return json({suggestion:readSuggestion(message,ingredients)});
 }catch(e){
  if(e instanceof SheetError)return json({error:e.message},e.status);
  if(e instanceof Anthropic.AuthenticationError)return json({error:'Claude weigert de sleutel. Controleer hem bij Systeem & koppelingen.'},400);
  if(e instanceof Anthropic.APIError)return json({error:'Claude is nu niet bereikbaar. Probeer het later opnieuw.'},502);
  return json({error:e instanceof Error?e.message:'Voorstel maken mislukt.'},400);
 }
}
