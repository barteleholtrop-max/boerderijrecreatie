import Anthropic from '@anthropic-ai/sdk';
import {isSameOrigin} from '@/lib/portable/origin';
import {createRateLimit} from '@/lib/public-orders';
import {parseImage} from '@/lib/label-read-core';
import {LabelReadOff} from '@/lib/label-read';
import {readCountPhoto} from '@/lib/count-photo';
import {loadOps} from '@/lib/operations-store';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Tellen met foto's (wens eigenaar 17 november 2026), werkplek Voorraad → Voorraad tellen. Alleen voor medewerkers (achter de login).
// POST {image:data-URL} → welke producten op de foto staan (uit de voorraadlijst, of nieuw) en hoeveel Claude er ziet.
// Opslaan gaat daarna als gewone telling via /api/operations (actie 'werkplek-telling'); een nieuw product via actie 'ingredient'.
const minute=createRateLimit({perClient:30,total:90});
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {image?:unknown}|null;
 const image=parseImage(b?.image);if(!image)return fail('Geen geldige foto.');
 if(!minute(req.headers.get('x-boer-bart-account')||'werkplek'))return fail('Even te veel foto’s. Zoek het product in de lijst, of probeer het zo opnieuw.',429);
 try{
  const ingredients=(await loadOps('none')).state.ingredients;
  return await withConnectionSettings(async()=>{
   const r=await readCountPhoto(image,ingredients);
   return r.ok?Response.json(r,{headers:{'Cache-Control':'no-store'}}):fail(r.reason,422);
  });
 }catch(e){
  if(e instanceof LabelReadOff)return fail('Foto’s lezen staat nog niet aan. Zoek het product in de lijst.',503);
  if(e instanceof Anthropic.RateLimitError)return fail('Het lezen is even druk. Zoek het product in de lijst.',429);
  return fail('De foto kon nu niet worden gelezen. Zoek het product in de lijst.',503);
 }
}
