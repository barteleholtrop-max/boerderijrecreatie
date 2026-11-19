// Alle foto's van de oude site (boerbart.nl, Wix) in de beeldbank, in de oorspronkelijke kwaliteit (besluit eigenaar
// 13 november 2026: „Ja, dit is een goed plan”). Per pagina van de oude site: welke foto's erop staan, en die ophalen
// in porties (hooguit 8 per verzoek), zodat geen verzoek te lang duurt. Elke foto krijgt de naam van de pagina waar hij
// vandaan komt en die pagina als herkomst. Dezelfde foto op meerdere pagina's komt er één keer in (herkomst wix:<foto-ID>).
// De oude rondleiding wordt overgeslagen (besluit eigenaar: komt opnieuw als eigen app), net als de losse agenda-items.
import {getDb} from '@/db';
import {media} from '@/db/schema';
import {like} from 'drizzle-orm';
import {WIX_ORIGIN} from './wix-blog';
import {get,storeWixPhoto,wixMediaId} from './wix-import';
import {InhoudError} from './inhoud';

const SITEMAPS=['pages','blog-posts','restaurants-menu','booking-services'];
/** Alleen pagina's van de eigen oude site; nooit een adres dat iemand zelf invult. */
export const WIX_PAGE=/^https:\/\/www\.boerbart\.nl(?:\/[a-z0-9-]{1,80}(?:\/[^/?#\s"<>]{1,200})?)?(?:\?menu=[a-z0-9-]{1,80})?$/;
const SKIP=/^https:\/\/www\.boerbart\.nl\/(rondleiding|event-details|tracker-page|payment-request-page|blog\/categories)(\/|$|\?)/;
const PER_REQUEST=8;

const decode=(s:string)=>s.replace(/&amp;/g,'&');
/** De pagina-adressen uit de sitemaps, de homepage voorop. */
export function pageUrls(sitemaps:string[]):string[]{
 const all=sitemaps.flatMap(x=>[...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m=>decode(m[1])));
 return [...new Set([WIX_ORIGIN,...all])].filter(u=>WIX_PAGE.test(u)&&!SKIP.test(u));
}
/** De foto's op een pagina, in volgorde van voorkomen, elk één keer. */
export function photoIds(html:string):string[]{
 let s=html;try{s=decodeURIComponent(html.replace(/%(?![0-9a-f]{2})/gi,'%25'))}catch{}
 return [...new Set([...s.matchAll(/static\.wixstatic\.com\/media\/[0-9a-f]{6}_[0-9a-f]{32}~mv2(?:_d_\d+_\d+_s_\w+)?\.(?:jpe?g|png|webp|gif)/gi)].map(m=>wixMediaId('https://'+m[0])).filter((x):x is string=>!!x))];
}
export function pageTitle(html:string,url:string){
 const t=(/<title>([^<]*)<\/title>/.exec(html)?.[1]||'').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').split(' | ')[0].trim();
 return t||new URL(url).pathname.replace(/^\//,'')||'Homepage';
}

/** Alle pagina's van de oude site waar foto's op kunnen staan, en hoeveel foto's er al in de beeldbank staan. */
export async function wixPhotoPages(){
 const maps:string[]=[];
 try{for(const m of SITEMAPS)maps.push(new TextDecoder().decode((await get(`${WIX_ORIGIN}/${m}-sitemap.xml`,6*1024*1024)).bytes))}
 catch{throw new InhoudError('De oude site boerbart.nl is nu niet te bereiken. Probeer het later opnieuw.',502)}
 const have=(await getDb().select({id:media.id}).from(media).where(like(media.sourceId,'wix:%'))).length;
 return {pages:pageUrls(maps),inBeeldbank:have};
}

export type PagePhotos={url:string;title:string;total:number;added:number;existed:number;gone:number;skipped:number;remaining:number};
/** Foto's van één pagina ophalen, hooguit 8 per keer. `remaining` > 0: nog eens vragen voor dezelfde pagina, met
 *  `after` = het totaal van gone + skipped tot nu toe. Die foto's staan niet in de beeldbank en blijven dus vooraan in de
 *  lijst; zo worden ze niet steeds opnieuw geprobeerd. */
export async function wixPhotosFromPage(url:unknown,after:unknown=0):Promise<PagePhotos>{
 const u=String(url??'');
 if(!WIX_PAGE.test(u)||SKIP.test(u))throw new InhoudError('Geen pagina van de oude site.');
 let html:string;
 try{html=new TextDecoder().decode((await get(new URL(u).href,6*1024*1024)).bytes)}
 catch{throw new InhoudError('Deze pagina van de oude site is nu niet te bereiken.',502)}
 const title=pageTitle(html,u),ids=photoIds(html);
 const known=new Set((await getDb().select({sourceId:media.sourceId}).from(media).where(like(media.sourceId,'wix:%'))).map(r=>r.sourceId.slice(4)));
 const skipFirst=Math.max(0,Math.min(500,Math.floor(Number(after)||0))),todo=ids.filter(id=>!known.has(id)).slice(skipFirst);
 const r:PagePhotos={url:u,title,total:ids.length,added:0,existed:ids.length-todo.length-skipFirst,gone:0,skipped:0,remaining:0};
 let n=0;
 for(const id of todo){
  if(r.added+r.gone+r.skipped>=PER_REQUEST){r.remaining=todo.length-n;break}
  n++;
  try{const s=await storeWixPhoto(id,`${title} – oude site`,u);if(s.status==='nieuw')r.added++;else if(s.status==='bestond')r.existed++;else if(s.status==='weg')r.gone++;else r.skipped++}
  catch{r.skipped++}
 }
 return r;
}
