// Pakbon en kassabon fotograferen (wens eigenaar 17 november 2026): één verzoek aan Claude met de foto('s) van de pakbon en de lijst ingrediënten.
// Regels en controle in lib/packing-slip-core.ts. Zelfde sleutel en model als Etiket lezen (lib/label-read.ts). De foto's worden niet bewaard.
import Anthropic from '@anthropic-ai/sdk';
import {anthropicKey,anthropicHeaders} from './integrations';
import {LabelReadOff,LABEL_MODEL} from './label-read';
import {slipSchema,slipPrompt,checkSlip,type SlipCandidate,type SlipKind} from './packing-slip-core';
import type {Ingredient} from './operations-core';
type Image={mediaType:'image/jpeg'|'image/png'|'image/webp';data:string};
export type SlipFile=Image|{mediaType:'application/pdf';data:string};

/** Leest een pakbon, kassabon of factuur: foto's of een PDF (geüpload). */
export async function readSlip(files:SlipFile[],ingredients:Ingredient[],kind:SlipKind='pakbon'){
 const key=await anthropicKey();if(!key)throw new LabelReadOff();
 // Eigen boerderij (onze melk) komt nooit van een leverancier; die staan niet in de keuzelijst.
 const candidates:SlipCandidate[]=ingredients.filter(i=>i.origin!=='eigen').map(i=>({id:i.id,name:i.name,unit:i.unit,supplier:i.supplier,article:i.article}));
 const client=new Anthropic({apiKey:key,maxRetries:1,timeout:90000,defaultHeaders:await anthropicHeaders()});
 const response=await client.beta.messages.create({
  model:LABEL_MODEL(),max_tokens:16000,
  // Weigert het model, dan neemt de server een ander model over (server-side fallback, zelfde verzoek).
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
  output_config:{effort:'medium',format:{type:'json_schema',schema:slipSchema(candidates,kind)}},
  messages:[{role:'user',content:[...files.map(f=>f.mediaType==='application/pdf'?{type:'document' as const,source:{type:'base64' as const,media_type:'application/pdf' as const,data:f.data}}:{type:'image' as const,source:{type:'base64' as const,media_type:f.mediaType,data:f.data}}),{type:'text',text:slipPrompt(candidates,kind)}]}],
 });
 if(response.stop_reason==='refusal'||response.stop_reason==='max_tokens')return {ok:false as const,reason:(kind==='kassabon'?'De kassabon':kind==='factuur'?'De factuur':'De pakbon')+' kon nu niet worden gelezen. Probeer het opnieuw of tel de levering bij Voorraad tellen.'};
 const text=response.content.flatMap(b=>b.type==='text'?[b.text]:[]).join('');
 let parsed:unknown=null;try{parsed=JSON.parse(text)}catch{}
 return checkSlip(parsed,ingredients,kind);
}
