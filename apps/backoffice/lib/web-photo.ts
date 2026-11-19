// Webversie van beeldbankfoto's (besluit eigenaar 13 november 2026: „dit is een goed plan”). De beeldbank bewaart het
// origineel (vaak 2000–6000 pixels, tot 7 MB) voor drukwerk en social media. Websites en schermen krijgen een lichte versie:
// hooguit 1920 pixels breed of hoog, rechtop gezet volgens de camera, zonder verborgen gegevens (zoals de GPS-plek uit de
// camera) en flink kleiner. Die versie wordt bij de eerste keer gemaakt en bewaard naast het origineel, onder een vaste
// sleutel die uit het foto-ID volgt; daarna wordt hij alleen nog doorgegeven. Lukt verkleinen niet, dan het origineel.
import {createHash} from 'node:crypto';
import {env} from '@/lib/portable/env';

export const WEB_MAX=1920;
/** Vaste opslagsleutel van de webversie, in dezelfde vorm als een foto-ID (de opslag accepteert alleen die vorm). */
export function webKey(id:string){
 const h=createHash('sha256').update('webversie:'+id).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
async function bytesOf(body:ReadableStream<Uint8Array>){return new Uint8Array(await new Response(body).arrayBuffer())}

/** Verkleint een foto. Geeft null als het geen foto is die we kunnen verkleinen. Alleen de pixels gaan mee, geen metagegevens. */
export async function makeWeb(input:Uint8Array):Promise<{bytes:Uint8Array;type:string}|null>{
 try{
  const sharp=(await import('sharp')).default;
  const img=sharp(input,{failOn:'none',limitInputPixels:80_000_000}).rotate();
  const meta=await img.metadata();
  if(!meta.width||!meta.height||!['jpeg','png','webp'].includes(meta.format||''))return null;
  const resized=img.resize({width:WEB_MAX,height:WEB_MAX,fit:'inside',withoutEnlargement:true});
  // Doorzichtige achtergrond (logo's in PNG) blijft doorzichtig via WebP; foto's worden JPEG.
  const out=meta.hasAlpha?await resized.webp({quality:85}).toBuffer():await resized.jpeg({quality:82,progressive:true,mozjpeg:true}).toBuffer();
  return {bytes:new Uint8Array(out),type:meta.hasAlpha?'image/webp':'image/jpeg'};
 }catch{return null}
}

/** De webversie van foto `id` (maken en bewaren als die er nog niet is). Null als de foto niet bestaat. */
export async function webPhoto(id:string):Promise<{body:ReadableStream<Uint8Array>|Uint8Array;type:string}|null>{
 const bucket=env.BUCKET;if(!bucket)return null;
 const key=webKey(id);
 const ready=await bucket.get(key).catch(()=>null);
 if(ready)return {body:ready.body,type:ready.httpMetadata?.contentType||'image/jpeg'};
 const original=await bucket.get(id);if(!original)return null;
 const type=original.httpMetadata?.contentType||'';
 const bytes=await bytesOf(original.body);
 if(!/^image\/(jpeg|png|webp)$/.test(type))return {body:bytes,type};
 const web=await makeWeb(bytes);
 if(!web||web.bytes.length>=bytes.length&&!type.includes('jpeg'))return {body:bytes,type};
 // Bewaren mag mislukken: dan wordt hij de volgende keer opnieuw gemaakt.
 await bucket.put(key,web.bytes.slice().buffer as ArrayBuffer,{httpMetadata:{contentType:web.type}}).catch(()=>{});
 return {body:web.bytes,type:web.type};
}
