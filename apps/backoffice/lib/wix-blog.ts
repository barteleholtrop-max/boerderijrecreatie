// Oude blogs van de Wix-site (boerbart.nl) overhalen naar Inhoud (wens eigenaar 13 november 2026: „hoe halen we nu alle
// oude blogs van de vorige site?”, besluit: eerst als concept). Dit bestand leest alleen: de lijst uit de sitemap van Wix
// en per blog de titel, datum, tekst, coverfoto en een eventueel YouTube-filmpje. Geen netwerk hier, zodat het te testen is.
// Opslaan doet lib/wix-import.ts.
import {parseVideo,slugify} from './inhoud';

export const WIX_ORIGIN='https://www.boerbart.nl';
/** Alleen een blogadres van de eigen Wix-site; nooit een ander adres (de server haalt het op). */
export const WIX_POST=/^https:\/\/www\.boerbart\.nl\/post\/[^/?#\s"<>]{1,200}$/;

export function postUrls(sitemapXml:string):string[]{
 return [...new Set([...sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m=>decode(m[1])).filter(u=>WIX_POST.test(u)))];
}
/** Het oude adres (laatste deel na /post/), leesbaar gemaakt: daarmee herkennen we een blog die al is overgehaald. */
export function wixSlug(url:string){try{return decodeURIComponent(new URL(url).pathname.replace(/^\/post\//,''))}catch{return url.replace(/^.*\/post\//,'')}}

const NAMED:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',euro:'€',
 laquo:'«',raquo:'»',bull:'•',middot:'·',deg:'°',times:'×',copy:'©',reg:'®',trade:'™',szlig:'ß'};
// Letters met een teken (ë, é, è, ê, ä, ï, ö, ü, ç, ñ …): &euml; &Eacute; enzovoort.
const MARKS:Record<string,string>={uml:'\u0308',acute:'\u0301',grave:'\u0300',circ:'\u0302',tilde:'\u0303',cedil:'\u0327',ring:'\u030a'};
const letter=(e:string)=>{const m=/^([a-z])(uml|acute|grave|circ|tilde|cedil|ring)$/i.exec(e);return m?(m[1]+MARKS[m[2]]).normalize('NFC'):null};
function decode(s:string){
 return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e:string)=>{
  if(e[0]==='#'){const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return Number.isFinite(n)&&n>0&&n<0x110000?String.fromCodePoint(n):''}
  return NAMED[e]??NAMED[e.toLowerCase()]??letter(e)??m;
 });
}
const text=(h:string)=>decode(h.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')).replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[ \t ]+/g,' ').replace(/ *\n */g,'\n').trim();

type Part={type:'kop'|'alinea'|'item';text:string};
/** De tekst tussen twee herkenningspunten (blog: Wix „content-viewer” tot de voet; pagina: <main> zonder kop- en voettekst
 *  van de site), in volgorde: koppen, alinea's en opsommingen. */
function parts(html:string,from='data-id="content-viewer"',to='data-hook="post-footer"'):Part[]{
 const start=html.indexOf(from);if(start<0)return [];
 let body=html.slice(start);const end=body.indexOf(to);if(end>0)body=body.slice(0,end);
 body=body.replace(/<(style|script|svg|button|figcaption)\b[\s\S]*?<\/\1>/gi,'');
 const out:Part[]=[],tag=/<(\/?)(h[1-6]|p|li)\b[^>]*>/gi;let open:{name:string;at:number}|null=null,li=0,liAt=0,m:RegExpExecArray|null;
 while((m=tag.exec(body))){
  const close=m[1]==='/',name=m[2].toLowerCase();
  if(name==='li'){if(!close){if(li++===0)liAt=tag.lastIndex}else if(li>0&&--li===0){const t=text(body.slice(liAt,m.index));if(t)out.push({type:'item',text:t})}continue}
  if(li>0)continue;
  if(!close)open={name,at:tag.lastIndex};
  else if(open&&open.name===name){const t=text(body.slice(open.at,m.index));if(t)out.push({type:name==='p'?'alinea':'kop',text:t});open=null}
 }
 return out;
}

const NL=/\b(de|het|een|en|van|ik|we|wij|niet|is|dat|op|voor|met|onze|ons|zijn|maar|ook|naar)\b/g,
 EN=/\b(the|and|of|to|our|that|for|with|you|are|it|this|not|but|have|from)\b/g,DE=/\b(der|die|das|und|ist|nicht|mit|wir|unser|unseren|ihr|auf|auch|sich|ein|eine)\b/g;
/** Grove taalkeuze op de hele tekst: een vertaling (Engels of Duits) als duidelijk meer Engelse of Duitse dan Nederlandse woordjes. */
export function translation(s:string):''|'Engels'|'Duits'{const l=s.toLowerCase(),nl=(l.match(NL)||[]).length,en=(l.match(EN)||[]).length,de=(l.match(DE)||[]).length;
 return en>nl*1.5&&en>=10?'Engels':de>nl*1.5&&de>=10?'Duits':''}

export type WixPost={url:string;wixSlug:string;slug:string;title:string;summary:string;body:string;publishedAt:string;photo:string|null;video:string;translation:''|'Engels'|'Duits'};
/** Eén blogpagina van Wix naar een stuk voor Inhoud. Geeft null als het geen herkenbare blog is. */
export function parsePost(html:string,url:string):WixPost|null{
 let ld:Record<string,unknown>|null=null;
 for(const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){try{const d=JSON.parse(m[1]);if(d&&d['@type']==='BlogPosting')ld=d}catch{}}
 if(!ld)return null;
 const title=text(String(ld.headline||'')).replace(/\s+/g,' ').slice(0,140);if(!title)return null;
 const date=String(ld.datePublished||'');
 const publishedAt=/^\d{4}-\d{2}-\d{2}T/.test(date)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(date)):'';
 const image=(ld.image as {url?:unknown}|undefined)?.url,photo=typeof image==='string'&&/^https:\/\/static\.wixstatic\.com\/media\/[^\s"<>]+$/.test(image)?image:null;
 const {blocks,summary}=assemble(parts(html),title);
 const video=firstVideo(html.slice(Math.max(0,html.indexOf('data-id="content-viewer"'))));
 const ws=wixSlug(url),all=[title,summary,...blocks].join('\n');
 return {url,wixSlug:ws,slug:slugify(ws)||slugify(title),title,summary,body:blocks.join('\n\n').slice(0,20000),publishedAt,photo,video,translation:translation(all)};
}

/** Delen naar Inhoud-tekst: opsommingen bij elkaar in één alinea („• …” per regel), koppen met „## ”. Dezelfde tekst twee keer
 *  (Wix zet koppen soms dubbel voor telefoon en computer) en een kop die gelijk is aan de titel komen er één keer in.
 *  De eerste gewone alinea wordt de inleiding (als die kort genoeg is), anders de eerste zin(nen). */
function assemble(list:Part[],title:string){
 const blocks:string[]=[];let items:string[]=[];const seen=new Set<string>([title.toLowerCase()]);
 const flush=()=>{if(items.length)blocks.push(items.map(i=>'• '+i.replace(/\n+/g,' ')).join('\n'));items=[]};
 for(const raw of list){
  // Wix gebruikt kopstijlen ook voor gewone tekst: een lange „kop” is een alinea.
  const p:Part=raw.type==='kop'&&(raw.text.length>120||/[.!?][\s\S]+[.!?]/.test(raw.text))?{type:'alinea',text:raw.text}:raw;
  const key=p.text.replace(/\s+/g,' ').toLowerCase();if(seen.has(key))continue;seen.add(key);
  if(p.type==='item'){items.push(p.text);continue}
  flush();blocks.push(p.type==='kop'?'## '+p.text.replace(/\n+/g,' '):p.text.replace(/\n{2,}/g,'\n'));
 }
 flush();
 // Een kop zonder tekst erna (laatste blok, of direct gevolgd door een kop) is meestal een knop of los label: weg.
 const kept=blocks.filter((b,i)=>!b.startsWith('## ')||(i+1<blocks.length&&!blocks[i+1].startsWith('## ')));
 let summary='';const first=kept.findIndex(b=>!b.startsWith('## ')&&!b.startsWith('• '));
 if(first===0&&kept[0].length<=400){summary=kept[0].replace(/\s+/g,' ');kept.shift()}
 else if(first>=0){const s=kept[first].replace(/\s+/g,' ');summary=s.length<=280?s:(s.slice(0,280).match(/^.*[.!?](?=\s)/)?.[0]||s.slice(0,277).replace(/\s+\S*$/,'')+'…')}
 return {blocks:kept,summary};
}
const firstVideo=(region:string)=>[...region.matchAll(/https?:(?:\\\/|\/){2}(?:www\.)?(?:youtube\.com(?:\\\/|\/)(?:watch\?v=|embed(?:\\\/|\/))|youtu\.be(?:\\\/|\/))[A-Za-z0-9_-]{11}/g)]
 .map(m=>parseVideo(m[0].replace(/\\\//g,'/'))).find(Boolean)?.url||'';

/** De verhalen van de oude site (besluit eigenaar 13 november 2026: „ga verder met de verhalen van de oude site”). Vaste
 *  lijst, zodat formulieren, bestelpagina's en de rondleiding er niet tussen komen. Adres op de oude site → naam. */
export const STORY_PAGES:Record<string,string>={jerseys:'Jerseys',overons:'Over ons',keuken:'Onze keuken',boerderij:'Boerderij',gras:'Gras',
 kippen:'Kippen',kippenboer:'Kippenboer',mobielmelken:'Mobiel melken',boerenpaad:'Boerenpaad',schoolreisje:'Schoolreisje',kinderfeest:'Kinderfeest',
 boerbartcooperatie:'Boer Bart als coöperatie',bepaalzelfwaarde:'Bepaal zelf de waarde',strategiesessie:'Strategiesessie',speelboerderij:'Speelboerderij',
 bijdeboeraantafel:'Ite by Boer Bart',winkel:'Boerderijwinkel'};
export type WixPage=Omit<WixPost,'translation'|'publishedAt'>&{path:string};
/** Een gewone pagina van de oude site (geen blog): de tekst in <main>, zonder kop- en voettekst van de site. Eerste foto op
 *  de pagina als coverfoto, eerste YouTube-filmpje als filmpje. Null als er (bijna) geen tekst op staat. */
export function parsePage(html:string,path:string):WixPage|null{
 if(!Object.hasOwn(STORY_PAGES,path))return null;
 const title=STORY_PAGES[path],from='<main id="PAGES_CONTAINER"',start=html.indexOf(from);
 if(start<0)return null;
 const end=html.indexOf('</main>',start),region=html.slice(start,end>start?end:undefined);
 const {blocks,summary}=assemble(parts(html,from,'</main>'),title);
 if([summary,...blocks].join(' ').split(/\s+/).filter(Boolean).length<20)return null;
 const photo=/https:\/\/static\.wixstatic\.com\/media\/[0-9a-f]{6}_[0-9a-f]{32}~mv2\.(?:jpe?g|png|webp)/i.exec(decode(region).replace(/%7E/gi,'~'))?.[0]||null;
 const url=WIX_ORIGIN+'/'+path;
 return {url,path,wixSlug:path,slug:slugify(title),title,summary,body:blocks.join('\n\n').slice(0,20000),photo,video:firstVideo(region)};
}
