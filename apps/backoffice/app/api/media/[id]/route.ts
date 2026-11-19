import {env} from '@/lib/portable/env';
import {webPhoto} from '@/lib/web-photo';
export const dynamic='force-dynamic';
// Beeldbankfoto binnen de backoffice. Standaard de lichte webversie (hooguit 1920 pixels, lib/web-photo.ts), zodat schermen en
// de beeldbank snel laden; ?origineel=1 geeft het bestand zoals het is opgeslagen (voor drukwerk en downloaden).
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Niet gevonden',{status:404});
 const headers=(type:string)=>({'Content-Type':type||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
 if(new URL(req.url).searchParams.get('origineel')!=='1'){const web=await webPhoto(id);if(!web)return new Response('Niet gevonden',{status:404});return new Response(web.body as BodyInit,{headers:headers(web.type)})}
 const object=await env.BUCKET!.get(id);if(!object)return new Response('Niet gevonden',{status:404});
 return new Response(object.body,{headers:headers(object.httpMetadata?.contentType||'')});
}
