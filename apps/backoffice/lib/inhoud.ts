// Inhoud voor het dorp (wens eigenaar 13 november 2026): blogs, nieuws en filmpjes, één keer geschreven in de backoffice
// en getoond op één of meer sites. De sites lezen alleen via de vaste poort GET /api/public/v1/inhoud (zie
// docs/INHOUD-EN-DORP.md). Dat antwoord is een contract: velden komen erbij, maar verdwijnen of veranderen niet. Moet dat
// toch, dan komt er een v2 naast v1. Zo kan de backoffice veranderen zonder dat een site iets merkt.
//
// Openbaar is alleen: status `gepubliceerd`, een publicatiedatum die al geweest is en de site staat aangevinkt. Concepten,
// archief, wie iets schreef en interne kenmerken gaan nooit naar buiten. Filmpjes staan niet bij ons: alleen een link naar
// YouTube of Vimeo, die de site als ingesloten speler toont (YouTube zonder volgcookies).
import {getDb} from '@/db';
import {contentItems} from '@/db/schema';
import {and,eq,desc} from 'drizzle-orm';
import {mediaId,publicPhoto} from './public-products';
import {blocks,type Block} from './text-blocks';

export class InhoudError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

/** De sites van het dorp. De sleutel staat in de database en in het adres van de poort: nooit hernoemen, alleen toevoegen. */
export const SITES={boerbart:'Boerderijrecreatie (hoofdsite)',ite:'Ite by Boerderijrecreatie',winkel:'Boerderijwinkel',speelboerderij:'Speelboerderij',cooperatie:'Coöperatie & Bloei'} as const;
export type SiteKey=keyof typeof SITES;
export const KINDS={blog:'Blog',nieuws:'Nieuws',video:'Filmpje'} as const;
export type Kind=keyof typeof KINDS;
export const STATUSES={concept:'Concept',gepubliceerd:'Gepubliceerd',archief:'Archief'} as const;
export type Status=keyof typeof STATUSES;
const isSite=(s:unknown):s is SiteKey=>typeof s==='string'&&Object.hasOwn(SITES,s);
const isKind=(s:unknown):s is Kind=>typeof s==='string'&&Object.hasOwn(KINDS,s);
const isStatus=(s:unknown):s is Status=>typeof s==='string'&&Object.hasOwn(STATUSES,s);

export type Video={provider:'youtube'|'vimeo';id:string;url:string;embed:string;thumbnail:string|null};
/** Alleen YouTube en Vimeo; elk ander adres is geen filmpje. Geeft een vaste ingesloten speler terug, nooit het ingevoerde adres zelf. */
export function parseVideo(input:unknown):Video|null{
 const raw=String(input??'').trim();if(!raw)return null;
 let u:URL;try{u=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw)}catch{return null}
 const host=u.hostname.toLowerCase().replace(/^(www\.|m\.)/,'');
 let yt:string|undefined;
 if(host==='youtu.be')yt=u.pathname.split('/')[1];
 else if(host==='youtube.com'||host==='youtube-nocookie.com'){
  if(u.pathname==='/watch')yt=u.searchParams.get('v')||undefined;
  else{const m=/^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);yt=m?.[2]}
 }
 if(yt!==undefined){if(!/^[A-Za-z0-9_-]{11}$/.test(yt))return null;
  return {provider:'youtube',id:yt,url:'https://www.youtube.com/watch?v='+yt,embed:'https://www.youtube-nocookie.com/embed/'+yt,thumbnail:'https://i.ytimg.com/vi/'+yt+'/hqdefault.jpg'}}
 if(host==='vimeo.com'||host==='player.vimeo.com'){
  const m=/^\/(?:video\/)?(\d{5,12})(?:\/|$)/.exec(u.pathname);if(!m)return null;
  return {provider:'vimeo',id:m[1],url:'https://vimeo.com/'+m[1],embed:'https://player.vimeo.com/video/'+m[1],thumbnail:null};
 }
 return null;
}

/** Adres-naam uit een titel: kleine letters, zonder accenten, woorden met een streepje. */
export function slugify(v:unknown){
 return String(v??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' en ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80).replace(/-+$/,'');
}

// Tekstblokken staan sinds 15 november 2026 in lib/text-blocks.ts, zodat ook het privacybeleid (en het scherm) ze gebruikt.
export {blocks,type Block} from './text-blocks';

const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const clean=(v:unknown,max:number)=>String(v??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const one=(v:unknown,max:number)=>clean(v,max).replace(/\s+/g,' ');
function sitesOf(json:string):SiteKey[]{try{const a=JSON.parse(json);return Array.isArray(a)?[...new Set(a.filter(isSite))]:[]}catch{return []}}

export type Row=typeof contentItems.$inferSelect;
export type Item={id:string;kind:Kind;slug:string;title:string;summary:string;body:string;photo:string;video:string;sites:SiteKey[];status:Status;
 publishedAt:string;version:number;createdBy:string;created:string;updatedBy:string;updated:string;source:string};
const toItem=(r:Row):Item=>({...r,kind:isKind(r.kind)?r.kind:'blog',status:isStatus(r.status)?r.status:'concept',sites:sitesOf(r.sites)});

/** Controleert en ordent wat de eigenaar invoert. Gooit een InhoudError met een uitleg in gewone taal. */
export function normalize(input:Record<string,unknown>){
 const kind=input.kind;if(!isKind(kind))throw new InhoudError('Kies een soort: blog, nieuws of filmpje.');
 const status=input.status===undefined?'concept':input.status;if(!isStatus(status))throw new InhoudError('Onbekende status.');
 const title=one(input.title,140);if(!title)throw new InhoudError('Geef het stuk een titel.');
 const slug=slugify(input.slug||title);if(!slug)throw new InhoudError('Er is geen geldig adres te maken van deze titel.');
 const summary=one(input.summary,400),body=clean(input.body,20000);
 const videoRaw=one(input.video,300),video=parseVideo(videoRaw);
 if(videoRaw&&!video)throw new InhoudError('Dit filmpje wordt niet herkend. Plak een link van YouTube of Vimeo.');
 if(kind==='video'&&!video)throw new InhoudError('Een filmpje heeft een link van YouTube of Vimeo nodig.');
 const photo=String(input.photo??'').trim();
 if(photo&&!mediaId(photo)&&!/^https:\/\/\S{1,500}$/i.test(photo))throw new InhoudError('Kies de foto uit de beeldbank.');
 const sites=Array.isArray(input.sites)?[...new Set(input.sites.filter(isSite))]:[];
 let publishedAt=String(input.publishedAt??'').trim();
 if(publishedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt))throw new InhoudError('Ongeldige publicatiedatum.');
 if(status==='gepubliceerd'){
  if(!sites.length)throw new InhoudError('Vink minstens één site aan waar dit stuk op komt.');
  if(!body&&!summary&&!video)throw new InhoudError('Schrijf eerst een tekst of voeg een filmpje toe.');
  if(!publishedAt)publishedAt=today();
 }
 return {kind,status,title,slug,summary,body,photo,video:video?video.url:'',sites,publishedAt};
}

export async function listInhoud():Promise<Item[]>{
 const rows=await getDb().select().from(contentItems).orderBy(desc(contentItems.updated));
 return rows.map(toItem);
}

/** Nieuw stuk (zonder id) of wijzigen (met id en de versie die je zag). Een tweede scherm dat intussen opsloeg, wint niet stilzwijgend. */
export async function saveInhoud(input:Record<string,unknown>,by:string):Promise<Item>{
 const v=normalize(input),db=getDb(),now=new Date().toISOString(),who=one(by,120)||'eigenaar';
 const taken=async(slug:string,except?:string)=>{const r=(await db.select({id:contentItems.id}).from(contentItems).where(eq(contentItems.slug,slug)))[0];return !!r&&r.id!==except};
 const id=typeof input.id==='string'&&input.id?input.id:'';
 if(!id){
  let slug=v.slug;
  if(input.slug){if(await taken(slug))throw new InhoudError('Dit adres is al in gebruik. Kies een ander.',409)}
  else for(let n=2;await taken(slug);n++)slug=v.slug.slice(0,75)+'-'+n;
  const row={id:crypto.randomUUID(),...v,slug,sites:JSON.stringify(v.sites),version:1,createdBy:who,created:now,updatedBy:who,updated:now,source:''};
  await db.insert(contentItems).values(row);return toItem(row);
 }
 const current=(await db.select().from(contentItems).where(eq(contentItems.id,id)))[0];
 if(!current)throw new InhoudError('Dit stuk bestaat niet meer.',404);
 if(Number(input.version)!==current.version)throw new InhoudError('Iemand anders heeft dit stuk intussen aangepast. Ververs en probeer opnieuw.',409);
 if(v.slug!==current.slug&&await taken(v.slug,id))throw new InhoudError('Dit adres is al in gebruik. Kies een ander.',409);
 // Eenmaal gepubliceerd blijft de oorspronkelijke datum staan, tenzij de eigenaar zelf een andere kiest.
 const publishedAt=String(input.publishedAt??'').trim()?v.publishedAt:current.publishedAt||v.publishedAt;
 const next={...v,publishedAt,sites:JSON.stringify(v.sites),version:current.version+1,updatedBy:who,updated:now};
 const done=await db.update(contentItems).set(next).where(and(eq(contentItems.id,id),eq(contentItems.version,current.version))).returning();
 if(done[0]?.version!==current.version+1)throw new InhoudError('Iemand anders heeft dit stuk intussen aangepast. Ververs en probeer opnieuw.',409);
 return toItem(done[0]);
}

/** Weghalen kan alleen bij een concept. Wat al openbaar was, zet je in het archief: dan blijft terug te vinden wat er stond. */
export async function removeInhoud(id:unknown,version:unknown){
 const db=getDb(),current=(await db.select().from(contentItems).where(eq(contentItems.id,String(id??''))))[0];
 if(!current)throw new InhoudError('Dit stuk bestaat niet meer.',404);
 if(current.status!=='concept')throw new InhoudError('Alleen een concept kun je weghalen. Zet een gepubliceerd stuk in het archief.',409);
 if(Number(version)!==current.version)throw new InhoudError('Iemand anders heeft dit stuk intussen aangepast. Ververs en probeer opnieuw.',409);
 await db.delete(contentItems).where(and(eq(contentItems.id,current.id),eq(contentItems.version,current.version)));
}

/** Meerdere concepten tegelijk publiceren (bijvoorbeeld de overgehaalde oude blogs). Elk stuk gaat door dezelfde controle als
 *  bij één keer opslaan; zonder aangevinkte site komt het op de hoofdsite. De eigen publicatiedatum (ook een oude) blijft staan.
 *  Wat niet lukt, wordt per stuk gemeld; de rest gaat gewoon door. */
export async function publishMany(ids:unknown,by:string){
 if(!Array.isArray(ids)||!ids.length||ids.length>200)throw new InhoudError('Kies tussen 1 en 200 stukken.');
 const db=getDb(),done:string[]=[],failed:{id:string;title:string;error:string}[]=[];
 for(const raw of new Set(ids.map(String))){
  const r=(await db.select().from(contentItems).where(eq(contentItems.id,raw)))[0];
  if(!r){failed.push({id:raw,title:'',error:'Bestaat niet meer.'});continue}
  if(r.status==='gepubliceerd'){done.push(r.id);continue}
  const sites=sitesOf(r.sites);
  try{await saveInhoud({...toItem(r),sites:sites.length?sites:['boerbart'],status:'gepubliceerd'},by);done.push(r.id)}
  catch(e){failed.push({id:r.id,title:r.title,error:e instanceof Error?e.message:'Mislukt.'})}
 }
 return {published:done.length,failed};
}
/** Een overgehaald stuk vastleggen als concept, met herkomst. Bestaat de herkomst al, dan gebeurt er niets (nooit dubbel). */
export async function insertImported(v:{kind:Kind;title:string;slug:string;summary:string;body:string;photo:string;video:string;publishedAt:string;source:string},by:string){
 const db=getDb();
 const found=(await db.select({id:contentItems.id}).from(contentItems).where(eq(contentItems.source,v.source)))[0];
 if(found)return {id:found.id,already:true};
 const n=normalize({...v,status:'concept',sites:['boerbart']});
 let slug=n.slug;for(let i=2;(await db.select({id:contentItems.id}).from(contentItems).where(eq(contentItems.slug,slug)))[0];i++)slug=n.slug.slice(0,75)+'-'+i;
 const now=new Date().toISOString(),id=crypto.randomUUID();
 const inserted=await db.insert(contentItems).values({id,...n,slug,publishedAt:v.publishedAt,sites:JSON.stringify(n.sites),version:1,createdBy:by,created:now,updatedBy:by,updated:now,source:v.source})
  .onConflictDoNothing().returning({id:contentItems.id});
 if(!inserted[0]){const again=(await db.select({id:contentItems.id}).from(contentItems).where(eq(contentItems.source,v.source)))[0];if(again)return {id:again.id,already:true};throw new InhoudError('Opslaan mislukt. Probeer opnieuw.',409)}
 return {id,already:false};
}

// ——— De openbare kant (versie 1) ———
export type PublicItem={slug:string;kind:Kind;title:string;summary:string;blocks:Block[];photo:string|null;video:Video|null;sites:SiteKey[];publishedAt:string};
const isPublic=(r:Row,on:string)=>r.status==='gepubliceerd'&&/^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt)&&r.publishedAt<=on;

/** Wat een site mag zien. Alleen gepubliceerd, al verschenen en op deze site; nieuwste eerst. */
export function publicInhoud(rows:Row[],q:{site:SiteKey;kind?:Kind;slug?:string;limit?:number},on=today()):PublicItem[]{
 return rows.filter(r=>isPublic(r,on)&&sitesOf(r.sites).includes(q.site)&&(!q.kind||r.kind===q.kind)&&(!q.slug||r.slug===q.slug))
  .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||b.created.localeCompare(a.created))
  .slice(0,Math.max(1,Math.min(100,q.limit||50)))
  .map(r=>({slug:r.slug,kind:isKind(r.kind)?r.kind:'blog',title:r.title,summary:r.summary,blocks:blocks(r.body),photo:publicPhoto(r.photo),
   video:parseVideo(r.video),sites:sitesOf(r.sites),publishedAt:r.publishedAt}));
}
/** Beeldbankfoto's van openbare stukken: alleen die mag /api/public/media/<id> laten zien. */
export function contentMediaIds(rows:Row[],on=today()){const ids=new Set<string>();for(const r of rows){const id=isPublic(r,on)?mediaId(r.photo):null;if(id)ids.add(id)}return ids}
export async function publishedRows(){return getDb().select().from(contentItems).where(eq(contentItems.status,'gepubliceerd'))}
export const isSiteKey=isSite,isKindKey=isKind;
