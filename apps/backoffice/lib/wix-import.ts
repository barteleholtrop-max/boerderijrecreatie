// Oude blogs van example.nl (Wix) overhalen naar Inhoud, als concept (besluit eigenaar 13 november 2026: „Eerst concept”).
// De backoffice haalt ze zelf op (ook online, zonder Chromebook), in kleine porties zodat geen verzoek te lang duurt.
// Alleen vaste adressen: de sitemap van www.example.nl, blogpagina's op www.example.nl/post/… en coverfoto's van
// static.wixstatic.com. Nooit een adres dat iemand zelf invult. Twee keer overhalen kan geen kwaad: de herkomst
// (wix:<oud adres>) is uniek, en een foto met dezelfde herkomst staat maar één keer in de beeldbank.
// Vertalingen (Engels, Duits) worden overgeslagen; de Nederlandse versie komt wel mee.
import {getDb} from '@/db';
import {contentItems,media} from '@/db/schema';
import {eq,like} from 'drizzle-orm';
import {env} from '@/lib/portable/env';
import {WIX_ORIGIN,WIX_POST,postUrls,parsePost,wixSlug,parsePage,STORY_PAGES} from './wix-blog';
import {insertImported,InhoudError} from './inhoud';

const MAX_PAGE=6*1024*1024,MAX_PHOTO=30*1024*1024;
const PHOTO=/^https:\/\/static\.wixstatic\.com\/media\/[^\s"<>]+$/;
const BY='oude blog van example.nl';

export async function get(url:string,max:number):Promise<{bytes:Uint8Array;type:string}>{
 const r=await fetch(url,{headers:{'User-Agent':'BoerBart-backoffice/1.0 (import oude blogs)',Accept:'text/html,application/xml,image/*'},redirect:'follow',signal:AbortSignal.timeout(25000)});
 // Een doorverwijzing mag alleen binnen dezelfde site blijven.
 if(new URL(r.url||url).hostname!==new URL(url).hostname)throw new Error('doorverwezen naar een andere site');
 if(!r.ok)throw new Error('HTTP '+r.status);
 const length=Number(r.headers.get('content-length')||0);if(length>max)throw new Error('te groot');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>max)throw new Error('te groot');
 return {bytes,type:r.headers.get('content-type')||''};
}
const source=(url:string)=>'wix:'+wixSlug(url);

/** De oude blogs volgens de sitemap van Wix, met per blog of hij al is overgehaald. */
export async function wixList(){
 let urls:string[];
 try{urls=postUrls(new TextDecoder().decode((await get(WIX_ORIGIN+'/blog-posts-sitemap.xml',MAX_PAGE)).bytes))}
 catch{throw new InhoudError('De oude site example.nl is nu niet te bereiken. Probeer het later opnieuw.',502)}
 const done=new Set((await getDb().select({source:contentItems.source}).from(contentItems).where(like(contentItems.source,'wix:%'))).map(r=>r.source));
 return {total:urls.length,posts:urls.map(url=>({url,slug:wixSlug(url),imported:done.has(source(url))}))};
}

/** Wix-foto-ID uit een fotoadres, bijvoorbeeld 04235c_<32 tekens>~mv2.jpg. */
export function wixMediaId(url:string){const m=/^https:\/\/static\.wixstatic\.com\/media\/([0-9a-f]{6}_[0-9a-f]{32}~mv2(?:_d_\d+_\d+_s_\w+)?\.(?:jpe?g|png|webp|gif))(?:\/|$)/i.exec(decodeURIComponent(url));return m?m[1]:null}
const mimeOf=(a:Uint8Array)=>a[0]===255&&a[1]===216?'image/jpeg':a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71?'image/png':String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP'?'image/webp':null;

export type StoredPhoto={url:string;status:'nieuw'|'bestond'|'weg'|'overgeslagen'};
/** Een foto van de oude site in de beeldbank, in de oorspronkelijke kwaliteit (het bestand zoals het ooit is geüpload).
 *  Herkomst wix:<foto-ID>, uniek: dezelfde foto komt er nooit twee keer in, ook niet via een blog én een pagina.
 *  Geeft Wix het origineel niet, dan de opgegeven (verkleinde) versie; bestaat de foto bij Wix niet meer, dan status 'weg'. */
export async function storeWixPhoto(mediaId:string,name:string,source:string,fallback?:string):Promise<StoredPhoto>{
 const sourceId='wix:'+mediaId.slice(0,140),db=getDb();
 const old=(await db.select({id:media.id}).from(media).where(eq(media.sourceId,sourceId)))[0];
 if(old)return {url:'/api/media/'+old.id,status:'bestond'};
 let bytes:Uint8Array|null=null;
 for(const u of ['https://static.wixstatic.com/media/'+mediaId,...(fallback&&PHOTO.test(fallback)?[fallback]:[])]){
  try{bytes=(await get(u,MAX_PHOTO)).bytes;break}catch(e){if(!(e instanceof Error&&/HTTP 40[34]/.test(e.message)))throw e}
 }
 if(!bytes)return {url:'',status:'weg'};
 const mime=mimeOf(bytes);if(!mime||!env.BUCKET)return {url:'',status:'overgeslagen'};
 const id=crypto.randomUUID();await env.BUCKET.put(id,bytes.slice().buffer as ArrayBuffer,{httpMetadata:{contentType:mime}});
 try{await db.insert(media).values({id,name:name.slice(0,240),sourceId,source:source.slice(0,1000),mime,size:bytes.length})}
 catch{await env.BUCKET.delete(id);const again=(await db.select({id:media.id}).from(media).where(eq(media.sourceId,sourceId)))[0];return again?{url:'/api/media/'+again.id,status:'bestond'}:{url:'',status:'overgeslagen'}}
 return {url:'/api/media/'+id,status:'nieuw'};
}
async function storePhoto(url:string,name:string,page:string):Promise<string>{
 const id=PHOTO.test(url)?wixMediaId(url):null;if(!id)return '';
 return (await storeWixPhoto(id,name,page,url)).url;
}

export type ImportResult={url:string;status:'nieuw'|'al-overgehaald'|'vertaling'|'mislukt';title?:string;note?:string};
/** Hooguit 5 blogs per keer overhalen. Een fout bij één blog stopt de rest niet. */
export async function wixImport(urls:unknown):Promise<ImportResult[]>{
 if(!Array.isArray(urls)||!urls.length||urls.length>5)throw new InhoudError('Kies 1 tot 5 blogs per keer.');
 const out:ImportResult[]=[];
 for(const u of urls){
  const url=String(u);
  if(!WIX_POST.test(url)){out.push({url,status:'mislukt',note:'Geen blogadres van example.nl.'});continue}
  try{
   if((await getDb().select({id:contentItems.id}).from(contentItems).where(eq(contentItems.source,source(url))))[0]){out.push({url,status:'al-overgehaald'});continue}
   const page=await get(new URL(url).href,MAX_PAGE),post=parsePost(new TextDecoder().decode(page.bytes),url);
   if(!post){out.push({url,status:'mislukt',note:'Geen blog gevonden op deze pagina.'});continue}
   if(post.translation){out.push({url,status:'vertaling',title:post.title,note:post.translation+'; de Nederlandse versie komt wel mee.'});continue}
   let photo='',note='';
   if(post.photo)try{photo=await storePhoto(post.photo,post.title,url);if(!photo)note='Coverfoto bestaat niet meer op de oude site.'}catch{note='Coverfoto niet overgehaald.'}
   const r=await insertImported({kind:'blog',title:post.title,slug:post.slug,summary:post.summary,body:post.body,photo,video:post.video,publishedAt:post.publishedAt,source:source(url)},BY);
   out.push({url,status:r.already?'al-overgehaald':'nieuw',title:post.title,note:note||undefined});
  }catch(e){out.push({url,status:'mislukt',note:e instanceof InhoudError?e.message:'Niet op te halen. Probeer het later opnieuw.'})}
 }
 return out;
}

// ——— Verhalen van de oude site (wens eigenaar 15 november 2026: „ga verder met de verhalen van de oude site”) ———
// Een vaste lijst gewone pagina's (Jerseys, Over ons, Onze keuken …), als concept-stuk in Inhoud met herkomst
// wix-pagina:<adres>. Zonder datum: die komt bij het publiceren. Prijzen in deze oude teksten zijn niet bijgewerkt; het
// bewerkscherm waarschuwt daarvoor (prijzen horen in Gerechten & prijzen).
const storySource=(path:string)=>'wix-pagina:'+path;
export async function wixStoryList(){
 const done=new Set((await getDb().select({source:contentItems.source}).from(contentItems).where(like(contentItems.source,'wix-pagina:%'))).map(r=>r.source));
 return {stories:Object.entries(STORY_PAGES).map(([path,title])=>({path,title,imported:done.has(storySource(path))}))};
}
export type StoryResult={path:string;status:'nieuw'|'al-overgehaald'|'leeg'|'mislukt';title?:string;note?:string};
/** Hooguit 3 verhalen per keer. Alleen adressen uit de vaste lijst. */
export async function wixImportStories(paths:unknown):Promise<StoryResult[]>{
 if(!Array.isArray(paths)||!paths.length||paths.length>3)throw new InhoudError('Kies 1 tot 3 verhalen per keer.');
 const out:StoryResult[]=[];
 for(const raw of paths){
  const path=String(raw);
  if(!Object.hasOwn(STORY_PAGES,path)){out.push({path,status:'mislukt',note:'Geen verhaal van de oude site.'});continue}
  try{
   if((await getDb().select({id:contentItems.id}).from(contentItems).where(eq(contentItems.source,storySource(path))))[0]){out.push({path,status:'al-overgehaald',title:STORY_PAGES[path]});continue}
   const html=new TextDecoder().decode((await get(WIX_ORIGIN+'/'+path,MAX_PAGE)).bytes),page=parsePage(html,path);
   if(!page){out.push({path,status:'leeg',title:STORY_PAGES[path],note:'Geen tekst gevonden op deze pagina.'});continue}
   let photo='',note='';
   if(page.photo)try{photo=await storePhoto(page.photo,page.title,page.url);if(!photo)note='Foto bestaat niet meer op de oude site.'}catch{note='Foto niet overgehaald.'}
   if(/€|\beuro\b/i.test(page.body+' '+page.summary))note=(note?note+' ':'')+'Er staan oude prijzen in de tekst: nakijken.';
   const r=await insertImported({kind:'blog',title:page.title,slug:page.slug,summary:page.summary,body:page.body,photo,video:page.video,publishedAt:'',source:storySource(path)},'verhaal van de oude site');
   out.push({path,status:r.already?'al-overgehaald':'nieuw',title:page.title,note:note||undefined});
  }catch(e){out.push({path,status:'mislukt',title:STORY_PAGES[path],note:e instanceof InhoudError?e.message:'Niet op te halen. Probeer het later opnieuw.'})}
 }
 return out;
}
