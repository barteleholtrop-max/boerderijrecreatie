// Berichten van Meta in Gesprekken (akkoord eigenaar 9 november 2026): WhatsApp, Facebook Messenger en Instagram Direct.
// Pure regels zonder database of netwerk, los te testen: de webhook ontleden,
// het venster van 24 uur, telefoonnummers en de berichten die we naar Meta sturen.
// Reacties onder berichten (feed, comments) horen hier niet bij en worden genegeerd (besluit eigenaar).
// Ook in de browser te gebruiken (geen node-modules); de handtekening van Meta staat in meta-signature.ts.

export type Channel='whatsapp'|'messenger'|'instagram';
export const CHANNELS:Channel[]=['whatsapp','messenger','instagram'];
export const CHANNEL_NAME:Record<Channel,string>={whatsapp:'WhatsApp',messenger:'Messenger',instagram:'Instagram'};
export type Media={id?:string;url?:string;mime?:string;filename?:string;
 /** Geïmporteerd uit een WhatsApp-export: het bestand staat in de eigen opslag (blob), of komt nog (pending). */ blob?:string;pending?:boolean};
export type MetaMessage={kind:'message';channel:Channel;contact:string;name:string;phone:string;id:string;fromUs:boolean;at:string;type:string;text:string;media:Media|null;
 /** webhook: live binnengekomen; echo: door ons verstuurd vanuit de app op de telefoon; history: opgehaalde oude gesprekken. */
 source:'webhook'|'echo'|'history'|'import'};
export type MetaStatus={kind:'status';id:string;status:string;error:string};
export type MetaEvent=MetaMessage|MetaStatus;

export const WINDOW_MS=24*3600_000;
// Het nummer gaat volledig naar de backoffice (besluit eigenaar 9 november 2026): geen oude gesprekken uit de app, tenzij ingesteld.
export const HISTORY_DAYS_DEFAULT=0;
export const threadId=(channel:Channel,contact:string)=>channel+':'+contact;
export const threadRef=(id:string)=>'meta:'+id;

/** Nederlandse en internationale nummers naar alleen cijfers met landcode (06… → 316…). */
export function normalizePhone(raw:string){
 let d=String(raw||'').replace(/[^\d+]/g,'');
 if(d.startsWith('+'))d=d.slice(1);else if(d.startsWith('00'))d=d.slice(2);else if(/^0[1-9]/.test(d))d='31'+d.slice(1);
 d=d.replace(/\D/g,'');return d.length>=8&&d.length<=15?d:'';
}
/** Leesbaar: +31 6 12345678 voor Nederlandse mobiele nummers, anders +<cijfers>. */
export function showPhone(digits:string){
 const d=normalizePhone(digits);if(!d)return '';
 return /^316\d{8}$/.test(d)?'+31 6 '+d.slice(3):'+'+d;
}

const s=(v:unknown,n=4000)=>typeof v==='string'?v.slice(0,n):'';
const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
const arr=(v:unknown)=>(Array.isArray(v)?v:[]) as unknown[];
const iso=(seconds:unknown)=>{const n=Number(seconds);return Number.isFinite(n)&&n>0?new Date((n<1e12?n*1000:n)).toISOString():''};

/** Eén WhatsApp-bericht (live, echo of geschiedenis) naar soort, tekst en bijlage. */
function whatsappContent(m:Record<string,unknown>):{type:string;text:string;media:Media|null}{
 const type=s(m.type,40)||'onbekend',part=obj(m[type]);
 const media=(['image','audio','video','document','sticker'].includes(type)&&s(part.id,200))?{id:s(part.id,200),mime:s(part.mime_type,100),...(s(part.filename,200)?{filename:s(part.filename,200)}:{})}:null;
 if(type==='text')return {type,text:s(obj(m.text).body),media:null};
 if(type==='location'){const l=part;return {type,text:[s(l.name,200),s(l.address,300),l.latitude!=null&&l.longitude!=null?`${l.latitude}, ${l.longitude}`:''].filter(Boolean).join(' · '),media:null}}
 if(type==='button')return {type,text:s(part.text,500),media:null};
 if(type==='interactive'){const r=obj(part.button_reply),l=obj(part.list_reply);return {type,text:s(r.title,500)||s(l.title,500),media:null}}
 if(type==='reaction')return {type,text:s(part.emoji,20),media:null};
 if(type==='contacts')return {type,text:arr(m.contacts).map(c=>s(obj(obj(c).name).formatted_name,200)).filter(Boolean).join(', '),media:null};
 return {type,text:s(part.caption,2000),media};
}

/** Messenger en Instagram: tekst en bijlagen (url van Meta) uit één bericht. */
function directContent(m:Record<string,unknown>):{type:string;text:string;media:Media|null}{
 const att=arr(m.attachments).map(obj)[0],text=s(m.text);
 if(!att)return {type:'text',text,media:null};
 const t=s(att.type,40),url=s(obj(att.payload).url,2000);
 const type=t==='image'?'image':t==='audio'?'audio':t==='video'?'video':t==='file'?'document':t||'bijlage';
 return {type,text,media:url?{url}:null};
}

/**
 * Ontleedt een webhookbericht van Meta. Onbekende of niet-ondersteunde onderdelen worden overgeslagen; reacties onder
 * berichten (feed, comments) ook. Oude gesprekken (geschiedenis) alleen vanaf `historySince` (ms).
 */
export function parseWebhook(body:unknown,{historySince=0}:{historySince?:number}={}):MetaEvent[]{
 const b=obj(body),out:MetaEvent[]=[];
 if(b.object==='whatsapp_business_account'){
  for(const entry of arr(b.entry).map(obj))for(const change of arr(entry.changes).map(obj)){
   const field=s(change.field,60),v=obj(change.value);
   if(field==='messages'){
    const names=new Map(arr(v.contacts).map(obj).map(c=>[s(c.wa_id,40),s(obj(c.profile).name,200)]));
    for(const m of arr(v.messages).map(obj)){
     const from=normalizePhone(s(m.from,40)),id=s(m.id,300);if(!from||!id)continue;
     out.push({kind:'message',channel:'whatsapp',contact:from,name:names.get(s(m.from,40))||'',phone:from,id,fromUs:false,at:iso(m.timestamp)||new Date().toISOString(),...whatsappContent(m),source:'webhook'});
    }
    for(const st of arr(v.statuses).map(obj)){const id=s(st.id,300);if(id)out.push({kind:'status',id,status:s(st.status,40),error:arr(st.errors).map(obj).map(e=>s(e.title,200)||s(e.message,200)).filter(Boolean).join('; ')})}
   }
   // Met de app op de telefoon verstuurd (coexistence): ook in de backoffice, als bericht van ons.
   if(field==='smb_message_echoes'){
    for(const m of arr(v.message_echoes).map(obj)){
     const to=normalizePhone(s(m.to,40)),id=s(m.id,300);if(!to||!id)continue;
     out.push({kind:'message',channel:'whatsapp',contact:to,name:'',phone:to,id,fromUs:true,at:iso(m.timestamp)||new Date().toISOString(),...whatsappContent(m),source:'echo'});
    }
   }
   // Oude gesprekken uit de app (eenmalig na het koppelen), in delen. Alleen de afgesproken periode (besluit eigenaar: 1 maand).
   if(field==='history'){
    for(const h of arr(v.history).map(obj))for(const t of arr(h.threads).map(obj)){
     const contact=normalizePhone(s(t.id,40));if(!contact)continue;
     for(const m of arr(t.messages).map(obj)){
      const id=s(m.id,300),at=iso(m.timestamp);if(!id||!at||Date.parse(at)<historySince)continue;
      out.push({kind:'message',channel:'whatsapp',contact,name:'',phone:contact,id,fromUs:normalizePhone(s(m.from,40))!==contact,at,...whatsappContent(m),source:'history'});
     }
    }
   }
  }
 }
 if(b.object==='page'||b.object==='instagram'){
  const channel:Channel=b.object==='page'?'messenger':'instagram';
  for(const entry of arr(b.entry).map(obj)){
   const own=s(entry.id,100);
   // Alleen privéberichten (messaging); entry.changes zijn reacties en berichten op de tijdlijn: overslaan.
   for(const ev of arr(entry.messaging).map(obj)){
    const m=obj(ev.message),id=s(m.mid,300);if(!id||m.is_deleted||m.is_unsupported)continue;
    const sender=s(obj(ev.sender).id,100),recipient=s(obj(ev.recipient).id,100),fromUs=m.is_echo===true||(!!own&&sender===own),contact=fromUs?recipient:sender;
    if(!/^\d{1,40}$/.test(contact))continue;
    out.push({kind:'message',channel,contact,name:'',phone:'',id,fromUs,at:iso(ev.timestamp)||new Date().toISOString(),...directContent(m),source:fromUs?'echo':'webhook'});
   }
  }
 }
 return out;
}

/** Korte tekst voor de lijst en de melding. */
export function describe(type:string,text:string){
 const label:Record<string,string>={audio:'Spraakbericht',image:'Foto',video:'Video',document:'Document',sticker:'Sticker',location:'Locatie',reaction:'Reactie',contacts:'Contact',template:'Sjabloon'};
 const t=text.replace(/\s+/g,' ').trim();
 return label[type]?(t?label[type]+' · '+t:label[type]):t||'Bericht';
}

/** Hoeveel ms we nog vrij (en gratis) mogen antwoorden: 24 uur na het laatste bericht van de klant. */
export function windowLeft(lastCustomerAt:string,now=Date.now()){const at=Date.parse(lastCustomerAt);return Number.isFinite(at)?Math.max(0,at+WINDOW_MS-now):0}
export function windowText(ms:number){if(ms<=0)return 'Venster van 24 uur is dicht';const h=Math.floor(ms/3600_000);return h>=1?`Nog ${h} uur gratis antwoorden`:`Nog ${Math.max(1,Math.ceil(ms/60_000))} minuten gratis antwoorden`}

/** Wie wacht op wie, zoals bij de mail: klant-wacht, wij-wachten, afgehandeld of opnieuw-open. */
export function waitingFor(t:{status:string;statusAt:string;lastFromUs:number;lastCustomerAt:string}){
 if(t.status==='afgehandeld')return t.lastCustomerAt&&t.statusAt&&t.lastCustomerAt>t.statusAt?'opnieuw-open':'afgehandeld';
 return t.lastFromUs?'wij-wachten':'klant-wacht';
}

/** Waarom er nu niet verzonden mag worden, of '' als het mag. */
export function sendBlocker(t:{lastMessageId:string;lastCustomerAt:string},seenLastMessageId:string,mode:'tekst'|'sjabloon',channel:Channel,now=Date.now()){
 if(t.lastMessageId!==seenLastMessageId)return 'Er is intussen een nieuw bericht in dit gesprek. Lees het eerst; er is niets verzonden.';
 if(mode==='tekst'&&windowLeft(t.lastCustomerAt,now)<=0)return channel==='whatsapp'
  ?'Het venster van 24 uur is dicht. Kies een goedgekeurd sjabloon; er is niets verzonden.'
  :'Het venster van 24 uur is dicht. Meta laat nu geen antwoord meer toe totdat de klant opnieuw schrijft; er is niets verzonden.';
 if(mode==='sjabloon'&&channel!=='whatsapp')return 'Sjablonen bestaan alleen voor WhatsApp.';
 return '';
}

export type Template={name:string;language:string;category:string;body:string;params:number};
/** Goedgekeurde WhatsApp-sjablonen die hier te gebruiken zijn: alleen variabelen in de tekst, geen kop met variabele of afbeelding. */
export function usableTemplates(raw:unknown):Template[]{
 return arr(obj(raw).data).map(obj).filter(t=>s(t.status,30)==='APPROVED').flatMap(t=>{
  const comps=arr(t.components).map(obj),body=comps.find(c=>s(c.type,20)==='BODY'),head=comps.find(c=>s(c.type,20)==='HEADER');
  if(!body)return [];
  if(head&&(s(head.format,20)!=='TEXT'||/\{\{/.test(s(head.text))))return [];
  if(comps.some(c=>s(c.type,20)==='BUTTONS'&&arr(c.buttons).some(x=>/\{\{/.test(s(obj(x).url,2000)))))return [];
  const text=s(body.text),params=new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m=>m[1])).size;
  return [{name:s(t.name,200),language:s(t.language,20)||'nl',category:s(t.category,40),body:text,params}];
 }).filter(t=>/^[a-z0-9_]{1,200}$/.test(t.name));
}
export const fillTemplate=(body:string,values:string[])=>body.replace(/\{\{\s*(\d+)\s*\}\}/g,(m,n)=>values[Number(n)-1]??m);

/** Wat we naar Meta sturen. */
export function outgoing(channel:Channel,contact:string,send:{mode:'tekst';text:string}|{mode:'sjabloon';template:Template;values:string[]}){
 if(send.mode==='sjabloon')return {messaging_product:'whatsapp',recipient_type:'individual',to:contact,type:'template',
  template:{name:send.template.name,language:{code:send.template.language},...(send.template.params?{components:[{type:'body',parameters:send.values.map(text=>({type:'text',text}))}]}:{})}};
 if(channel==='whatsapp')return {messaging_product:'whatsapp',recipient_type:'individual',to:contact,type:'text',text:{preview_url:false,body:send.text}};
 return {recipient:{id:contact},messaging_type:'RESPONSE',message:{text:send.text}};
}
/** Het bericht-id dat Meta teruggeeft na verzenden. */
export const sentId=(res:unknown)=>s(obj(arr(obj(res).messages)[0]).id,300)||s(obj(res).message_id,300);

/** Alleen bestanden van Meta zelf ophalen (geen willekeurige adressen). */
export function metaMediaUrl(raw:string){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
  return /(^|\.)(fbsbx\.com|fbcdn\.net|cdninstagram\.com|whatsapp\.net)$/.test(u.hostname)}catch{return false}
}
