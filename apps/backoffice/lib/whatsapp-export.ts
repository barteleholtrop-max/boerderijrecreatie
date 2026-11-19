// WhatsApp-export inlezen (wens eigenaar 13 november 2026: „backup van de gesprekken uit WhatsApp, tekst en media”).
// Pure regels zonder database of netwerk, ook in de browser te gebruiken: de tekst van „Chat exporteren” uit WhatsApp
// (Android en iPhone, Nederlands en Engels) wordt een lijst berichten met tijd, afzender, tekst en eventueel een bijlage.
// Tijden in de export zijn lokale tijd; die worden omgezet naar UTC met de tijdzone Europe/Amsterdam.

export type ExportMessage={at:string;author:string;text:string;attachment:string;kind:string;omitted:boolean};
export type ParsedExport={messages:ExportMessage[];authors:string[];first:string;last:string;dayFirst:boolean};

const INVISIBLE=/[‎‏‪-‮⁦-⁩﻿]/g;
// Android: 13-11-2026 10:59 - Naam: tekst   ·   iPhone: [13-11-2026 10:59:12] Naam: tekst   (ook / of . en AM/PM)
const ANDROID=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?\s+[-–]\s+([\s\S]*)$/;
const IPHONE=/^\[(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?\]\s+([\s\S]*)$/;
const ATTACHED_ANDROID=/^(.+?\.[A-Za-z0-9]{2,5})\s+\((?:bestand bijgevoegd|file attached)\)\s*([\s\S]*)$/i;
const ATTACHED_IPHONE=/^<(?:bijgevoegd|attached):\s*(.+?)>\s*([\s\S]*)$/i;
const OMITTED=/^<?\s*(?:media weggelaten|media omitted|afbeelding weggelaten|image omitted|video weggelaten|video omitted|audio weggelaten|audio omitted|sticker weggelaten|sticker omitted|document weggelaten|document omitted|gif weggelaten|gif omitted)\s*>?$/i;

const EXT:Record<string,[string,string]>={jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],png:['image','image/png'],webp:['image','image/webp'],gif:['image','image/gif'],heic:['image','image/heic'],
 opus:['audio','audio/ogg'],ogg:['audio','audio/ogg'],m4a:['audio','audio/mp4'],mp3:['audio','audio/mpeg'],aac:['audio','audio/aac'],amr:['audio','audio/amr'],wav:['audio','audio/wav'],
 mp4:['video','video/mp4'],'3gp':['video','video/3gpp'],mov:['video','video/quicktime'],
 pdf:['document','application/pdf'],vcf:['document','text/vcard'],txt:['document','text/plain'],doc:['document','application/msword'],
 docx:['document','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],xlsx:['document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']};
/** Soort bericht en mimetype van een bijlage, op de extensie van de bestandsnaam. */
export function mediaType(filename:string):{kind:string;mime:string}{
 const ext=(filename.split('.').pop()||'').toLowerCase(),t=EXT[ext];
 if(t)return {kind:/sticker|STK-/i.test(filename)&&t[0]==='image'?'sticker':t[0],mime:t[1]};
 return {kind:'document',mime:'application/octet-stream'};
}

/** Lokale tijd in Nederland naar ISO (UTC), ook rond zomer- en wintertijd. */
export function amsterdamIso(y:number,mo:number,d:number,h:number,mi:number,s=0){
 const wall=Date.UTC(y,mo-1,d,h,mi,s);
 const offset=(t:number)=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
   .formatToParts(new Date(t)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-t;
 };
 let t=wall-offset(wall);t=wall-offset(t);
 return new Date(t).toISOString();
}

type Head={a:number;b:number;y:number;h:number;mi:number;s:number;ampm:string;rest:string};
function head(line:string):Head|null{
 const m=IPHONE.exec(line)||ANDROID.exec(line);if(!m)return null;
 return {a:+m[1],b:+m[2],y:+m[3],h:+m[4],mi:+m[5],s:m[6]?+m[6]:0,ampm:(m[7]||'').toLowerCase(),rest:m[8]};
}

/** Leest de tekst van een WhatsApp-export. Regels zonder tijd horen bij het bericht erboven (berichten over meerdere regels). */
export function parseWhatsappExport(raw:string,opts:{maxMessages?:number}={}):ParsedExport{
 const lines=raw.replace(/\r\n?/g,'\n').split('\n').map(l=>l.replace(INVISIBLE,''));
 const heads=lines.map(head);
 // Dag-maand of maand-dag: een eerste getal boven 12 bewijst dag-eerst, een tweede getal boven 12 maand-eerst. Standaard dag-eerst (NL).
 let dayFirst=true;
 if(!heads.some(x=>x&&x.a>12)&&heads.some(x=>x&&x.b>12))dayFirst=false;
 const out:ExportMessage[]=[],max=opts.maxMessages??50000;
 let cur:ExportMessage|null=null;
 const finish=()=>{if(!cur)return;cur.text=cur.text.replace(/\n+$/,'');
  const both=cur.text;let m=ATTACHED_IPHONE.exec(both)||ATTACHED_ANDROID.exec(both);
  if(m){cur.attachment=m[1].trim().slice(0,200);cur.text=m[2].trim();cur.kind=mediaType(cur.attachment).kind}
  else if(OMITTED.test(both.trim())){cur.omitted=true;cur.text='';cur.kind='text'}
  if(out.length<max)out.push(cur);cur=null};
 for(let i=0;i<lines.length;i++){
  const h=heads[i];
  if(!h){if(cur)cur.text+=(cur.text?'\n':'')+lines[i];continue}
  finish();
  const colon=h.rest.indexOf(': ');
  // Zonder „Naam: ” is het een melding van WhatsApp zelf (versleuteling, nummer gewijzigd); die nemen we niet over.
  if(colon<1||colon>80)continue;
  let hour=h.h;if(h.ampm==='p'&&hour<12)hour+=12;if(h.ampm==='a'&&hour===12)hour=0;
  const day=dayFirst?h.a:h.b,month=dayFirst?h.b:h.a,year=h.y<100?2000+h.y:h.y;
  if(month<1||month>12||day<1||day>31||hour>23||h.mi>59)continue;
  cur={at:amsterdamIso(year,month,day,hour,h.mi,h.s),author:h.rest.slice(0,colon).trim().slice(0,120),text:h.rest.slice(colon+2),attachment:'',kind:'text',omitted:false};
 }
 finish();
 const authors=[...new Set(out.map(m=>m.author))];
 return {messages:out,authors,first:out[0]?.at||'',last:out.at(-1)?.at||'',dayFirst};
}

/** Een telefoonnummer uit een naam als „+31 6 12345678” (onbekend contact in de export), anders ''. */
export function phoneFromAuthor(author:string){
 const d=author.replace(/[\s\-().]/g,'');
 return /^\+?\d{9,15}$/.test(d)?d:'';
}
