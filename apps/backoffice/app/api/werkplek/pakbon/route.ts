import Anthropic from '@anthropic-ai/sdk';
import {isSameOrigin} from '@/lib/portable/origin';
import {createRateLimit} from '@/lib/public-orders';
import {parseImage} from '@/lib/label-read-core';
import {LabelReadOff} from '@/lib/label-read';
import {readSlip,type SlipFile} from '@/lib/packing-slip';
import {MAX_SLIP_PAGES,kindOf} from '@/lib/packing-slip-core';
import {loadOps} from '@/lib/operations-store';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Pakbon fotograferen (wens eigenaar 17 november 2026), werkplek Voorraad → Levering. Alleen voor medewerkers (achter de login).
// POST {images:[data-URL, …], kind?:'pakbon'|'kassabon'|'factuur'} (1 tot 4 foto's, of één PDF: uploaden) → het voorstel per regel
// en de ingrediëntenlijst om uit te kiezen. Kassabon en factuur: ook de prijs per regel.
// Boeken gaat daarna via /api/operations, actie 'pakbon' (lib/packing-slip-core.ts applySlip).
const minute=createRateLimit({perClient:6,total:20});
const MAX_PDF_BYTES=8_000_000;
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
/** Een foto (jpeg, png, webp) of een PDF als data-URL. */
function parseFile(v:unknown):SlipFile|null{
 if(typeof v==='string'){const m=/^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);if(m)return m[1].length*3/4<=MAX_PDF_BYTES?{mediaType:'application/pdf',data:m[1]}:null}
 return parseImage(v);
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {images?:unknown;kind?:unknown}|null;
 const kind=kindOf(b?.kind);
 const list=Array.isArray(b?.images)?b!.images:[];
 if(!list.length||list.length>MAX_SLIP_PAGES)return fail(`Kies 1 tot ${MAX_SLIP_PAGES} foto’s, of één PDF.`);
 const files=list.map(parseFile);if(files.some(f=>!f))return fail('Een bestand kunnen we niet gebruiken. Kies een foto of een PDF tot 8 MB.');
 if(files.filter(f=>f!.mediaType==='application/pdf').length>1)return fail('Kies één PDF tegelijk.');
 if(!minute(req.headers.get('x-boer-bart-account')||'werkplek'))return fail('Even te veel bonnen tegelijk. Probeer het over een minuut opnieuw.',429);
 try{
  const loaded=await loadOps('none'),ingredients=loaded.state.ingredients;
  return await withConnectionSettings(async()=>{
   const r=await readSlip(files as SlipFile[],ingredients,kind);
   if(!r.ok)return fail(r.reason,422);
   return Response.json({ok:true,slip:r.slip,version:loaded.version,ingredients:ingredients.map(i=>({id:i.id,name:i.name,unit:i.unit,supplier:i.supplier,stock:i.stock,known:i.known}))},{headers:{'Cache-Control':'no-store'}});
  });
 }catch(e){
  if(e instanceof LabelReadOff)return fail('Bonnen lezen staat nog niet aan.',503);
  if(e instanceof Anthropic.RateLimitError)return fail('Het lezen is even druk. Probeer het zo opnieuw.',429);
  return fail('Het bestand kon nu niet worden gelezen. Probeer het opnieuw.',503);
 }
}
