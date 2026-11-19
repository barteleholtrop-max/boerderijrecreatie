import {getDb} from '@/db';
import {products} from '@/db/schema';
import {isNotNull} from 'drizzle-orm';
import {webPhoto} from '@/lib/web-photo';
import {publicMediaIds} from '@/lib/public-products';
import {loadGuest} from '@/lib/guest-store';
import {eventMediaIds} from '@/lib/guest-public';
import {publishedRows,contentMediaIds} from '@/lib/inhoud';
export const dynamic='force-dynamic';
// Public, read-only photo address for the website (no login; see proxy.ts). Only a beeldbank photo that is set on a
// PUBLISHED product, on an event in Planning (shown on the website agenda), on a published Inhoud piece or on a published
// harvest package/part (oogstdelen, 18 november 2026) is served, and only as an image.
// Publishing a product or adding a photo to an event is the owner's choice to show it.
const TTL=60000;let cache:{at:number;ids:Set<string>}|null=null;
const notFound=()=>new Response('Niet gevonden',{status:404,headers:{'Cache-Control':'no-store'}});
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/.test(id))return notFound();
 try{
  if(!cache||Date.now()-cache.at>TTL){const rows=await getDb().select({published:products.published}).from(products).where(isNotNull(products.published));const ids=publicMediaIds(rows);for(const e of eventMediaIds((await loadGuest()).state))ids.add(e);for(const c of contentMediaIds(await publishedRows()))ids.add(c);cache={at:Date.now(),ids}}
  if(!cache.ids.has(id))return notFound();
  // Altijd de lichte webversie (lib/web-photo.ts): hooguit 1920 pixels, zonder cameragegevens. Het origineel blijft in de beeldbank.
  const photo=await webPhoto(id);if(!photo)return notFound();
  const type=photo.type;
  if(!/^image\/(jpeg|png|webp|gif|avif)$/.test(type))return notFound();
  return new Response(photo.body as BodyInit,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Access-Control-Allow-Origin':'*'}});
 }catch{return new Response('Tijdelijk niet beschikbaar',{status:503,headers:{'Cache-Control':'no-store'}})}
}
