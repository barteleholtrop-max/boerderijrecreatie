// Meldingen voor medewerkers (wens eigenaar 9 november 2026): pure regels en teksten, los te testen.
// Rianne en Bartele krijgen in de backoffice-app een melding bij nieuwe gastmail en nieuwe aanvragen via de website,
// zodat niets meer via Google binnenkomt. Een tik op de melding opent het gesprek of de reservering.
// Mail en WhatsApp/Messenger/Instagram openen in de telefoonstand van Gesprekken (wens eigenaar 9 november 2026).
export type StaffMessage={title:string;body:string;url:string;tag:string};
const short=(v:string,n:number)=>{const t=v.replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t};
const day=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)?new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'';

/** Only a real new message from a guest gives a notification: not our own reply, not an automated mail, not the first full sync. */
export function isNewGuestMail(prev:{lastMessageId:string}|null|undefined,next:{lastMessageId:string;lastFromUs:number;automated:number;labeled:number}){
 return !!next.labeled&&!next.lastFromUs&&!next.automated&&!!next.lastMessageId&&next.lastMessageId!==prev?.lastMessageId;
}
export const mailMessage=(t:{threadId:string;customerName:string;customerEmail:string;subject:string}):StaffMessage=>({
 title:'Nieuwe mail van '+short(t.customerName||t.customerEmail||'een gast',60),body:short(t.subject||'(geen onderwerp)',140),
 url:'/management/gesprekken?gesprek='+encodeURIComponent('gmail:'+t.threadId),tag:'mail:'+t.threadId});
export const groupMessage=(r:{requestId:string;name:string;activity:string;date:string;people:number|null}):StaffMessage=>({
 title:'Nieuwe aanvraag: '+short(r.activity,60),body:[short(r.name,60),r.people?r.people+' personen':'',day(r.date)].filter(Boolean).join(' · '),
 url:'/gesprekken?gesprek='+encodeURIComponent('web:'+r.requestId),tag:'aanvraag:'+r.requestId});
export const yteMessage=(r:{id:string;name:string;date:string;from:string;people:number}):StaffMessage=>({
 title:'Nieuwe reservering Ite',body:[short(r.name,60),r.people+' personen',[day(r.date),r.from].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
 url:'/reserveringen',tag:'ite:'+r.id});
/** Only messages that open a page of the backoffice itself (never an outside address). */
export function parseStaffMessage(v:unknown):StaffMessage|null{
 const m=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;
 const s=(k:string,n:number)=>typeof m[k]==='string'?(m[k] as string).slice(0,n):'';
 const url=s('url',300);if(!/^\/[a-z]/.test(url)||url.startsWith('//'))return null;
 const title=s('title',120),tag=s('tag',120);return title&&tag?{title,body:s('body',300),url,tag}:null;
}
/** Nieuw bericht via WhatsApp, Messenger of Instagram (akkoord eigenaar 9 november 2026). */
export const metaStaffMessage=(t:{id:string;channel:string;name:string;phone:string},snippet:string):StaffMessage=>({
 title:'Nieuw '+({whatsapp:'WhatsApp-bericht',messenger:'Messenger-bericht',instagram:'Instagram-bericht'}[t.channel]||'bericht')+' van '+short(t.name||t.phone||'een gast',60),
 body:short(snippet||'Bericht',140),url:'/management/gesprekken?gesprek='+encodeURIComponent('meta:'+t.id),tag:'meta:'+t.id});
