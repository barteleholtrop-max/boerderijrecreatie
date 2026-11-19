import Anthropic from '@anthropic-ai/sdk';
import {isSameOrigin} from '@/lib/portable/origin';
import {createRateLimit} from '@/lib/public-orders';
import {parseImage,productName,MAX_LABEL_CENTS} from '@/lib/label-read-core';
import {readLabelProduct,createPackagedByHand,LabelReadOff} from '@/lib/label-read';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Etiket lezen op de werkplek (wens eigenaar 9 november 2026: „ook als de kok namens de keuken vlees uit de vriezer haalt”).
// Alleen voor medewerkers (achter de login); Werkplek Voorraad → Uit de winkel halen. Zelfde regels als de zelfkassa
// (lib/label-read.ts); het bedrag wordt daarna in de bestelroute omgerekend naar de inkoopprijs (lib/stock-count-core.ts).
const minute=createRateLimit({perClient:20,total:60});
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {image?:unknown;barcode?:unknown;name?:unknown;priceCents?:unknown}|null;
 // Levering fotograferen (wens eigenaar 10 november 2026): geen inkoopprijs gevonden → de medewerker vult de verkoopprijs zelf in.
 if(b&&b.image===undefined&&b.priceCents!==undefined){
  const name=productName(b.name),price=b.priceCents;
  if(!name||typeof price!=='number'||!Number.isSafeInteger(price)||price<=0||price>MAX_LABEL_CENTS)return fail('Vul een naam en een prijs tussen € 0,01 en € 1.000 in.');
  try{const r=await createPackagedByHand(name,b.barcode,price);return r.ok?Response.json(r,{headers:{'Cache-Control':'no-store'}}):fail(r.reason,422)}
  catch{return fail('Het product kon niet worden aangemaakt. Probeer het opnieuw.',503)}
 }
 const image=parseImage(b?.image);if(!image)return fail('Geen geldige foto.');
 if(!minute(req.headers.get('x-boer-bart-account')||'werkplek'))return fail('Even te veel foto’s. Typ het bedrag zelf in, of probeer het zo opnieuw.',429);
 try{return await withConnectionSettings(async()=>{
  const r=await readLabelProduct(image,b?.barcode);
  return r.ok?Response.json(r,{headers:{'Cache-Control':'no-store'}}):Response.json({error:r.reason,...('code' in r&&r.code?{code:r.code,newName:r.newName,barcode:r.barcode}:{})},{status:422,headers:{'Cache-Control':'no-store'}});
 })}catch(e){
  if(e instanceof LabelReadOff)return fail(e.message,503);
  if(e instanceof Anthropic.RateLimitError)return fail('Het lezen is even druk. Typ het bedrag zelf in.',429);
  return fail('Het etiket kon nu niet worden gelezen. Typ het bedrag zelf in.',503);
 }
}
