// Tellen met foto's (wens eigenaar 17 november 2026): één verzoek aan Claude met de foto en de voorraadlijst. Regels in
// lib/count-photo-core.ts. Zelfde sleutel en model als Etiket lezen (lib/label-read.ts). De foto wordt niet bewaard.
import Anthropic from '@anthropic-ai/sdk';
import {anthropicKey,anthropicHeaders} from './integrations';
import {LabelReadOff,LABEL_MODEL} from './label-read';
import {countPhotoSchema,countPhotoPrompt,checkCountPhoto} from './count-photo-core';
import type {Ingredient} from './operations-core';
type Image={mediaType:'image/jpeg'|'image/png'|'image/webp';data:string};

export async function readCountPhoto(image:Image,ingredients:Ingredient[]){
 const key=await anthropicKey();if(!key)throw new LabelReadOff();
 const candidates=ingredients.filter(i=>i.kind!=='magazijn').map(i=>({id:i.id,name:i.name,unit:i.unit}));
 const client=new Anthropic({apiKey:key,maxRetries:1,timeout:45000,defaultHeaders:await anthropicHeaders()});
 const response=await client.beta.messages.create({
  model:LABEL_MODEL(),max_tokens:4000,
  // Weigert het model, dan neemt de server een ander model over (server-side fallback, zelfde verzoek).
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
  output_config:{effort:'low',format:{type:'json_schema',schema:countPhotoSchema(candidates)}},
  messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:image.mediaType,data:image.data}},{type:'text',text:countPhotoPrompt(candidates)}]}],
 });
 if(response.stop_reason==='refusal'||response.stop_reason==='max_tokens')return {ok:false as const,reason:'De foto kon nu niet worden gelezen. Zoek het product in de lijst.'};
 const text=response.content.flatMap(b=>b.type==='text'?[b.text]:[]).join('');
 let parsed:unknown=null;try{parsed=JSON.parse(text)}catch{}
 return checkCountPhoto(parsed,ingredients.filter(i=>i.kind!=='magazijn'));
}
