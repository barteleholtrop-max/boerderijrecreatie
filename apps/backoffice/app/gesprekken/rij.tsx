'use client';
// Eén gesprek in de lijst, zoals in het goedgekeurde telefoonontwerp (9 november 2026). Gedeeld door Gesprekken op de
// computer (/gesprekken) en in telefoonstand (/gesprekken/telefoon), zodat de uitstraling overal gelijk is (wens eigenaar).
import {waitingLabel} from './mail';
import {CHANNEL_NAME,windowText,type Channel} from '@/lib/meta-core';

export type Kind='gmail'|'chat'|Channel;
export type ListRow={ref:string;kind:Kind;name:string;text:string;at:string;waiting:string;assigned:string;unread:boolean;windowLeft?:number;automated?:boolean;drafts?:number;attachments?:number;
 /** Aantal ongelezen berichten (WhatsApp, Messenger, Instagram); mail telt als 1. */ unreadCount?:number;
 /** Het laatste bericht is van ons: ✓✓ voor de tekst, zoals in WhatsApp. */ fromUs?:boolean};
export const KIND_NAME:Record<Kind,string>={gmail:'Mail',chat:'Websitechat',...CHANNEL_NAME};
/** Klein kanaalteken op de avatar, zoals in een chatlijst. */
const KIND_MARK:Record<Kind,string>={gmail:'✉',chat:'💬',whatsapp:'W',messenger:'M',instagram:'IG'};
/** Mailvoorbeeld: onderwerp en het begin van het laatste bericht, zoals in een chatlijst. */
export const mailPreview=(subject:string,snippet:string)=>snippet&&subject&&!snippet.startsWith(subject)?subject+' — '+snippet:snippet||subject;
export const isWaiting=(w:string)=>w==='klant-wacht'||w==='opnieuw-open';
export const initials=(n:string)=>n.replace(/<[^>]*>/g,'').replace(/[^A-Za-zÀ-ÿ0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
/** Tijd zoals op een telefoon: vandaag de klok, gisteren „gisteren”, anders de dag. */
export function stamp(iso:string){
 if(!iso)return '';const d=new Date(iso),now=new Date(),tz={timeZone:'Europe/Amsterdam'} as const;
 const day=(x:Date)=>new Intl.DateTimeFormat('sv-SE',tz).format(x),y=new Date(now.getTime()-86400_000);
 if(day(d)===day(now))return new Intl.DateTimeFormat('nl-NL',{...tz,hour:'2-digit',minute:'2-digit'}).format(d);
 if(day(d)===day(y))return 'gisteren';
 return new Intl.DateTimeFormat('nl-NL',{...tz,day:'numeric',month:'short'}).format(d);
}
// Chatlijst in WhatsApp-stijl (wens eigenaar 12 november 2026: „aanpassen als WhatsApp-scherm, waar je ook de berichten ziet”):
// naam en tijd, daaronder het laatste bericht, een groen bolletje met het aantal ongelezen berichten. De afhandeling staat
// klein eronder in gewone tekst in plaats van gekleurde labels.
export function ConversationRow({r,active=false,onOpen}:{r:ListRow;active?:boolean;onOpen:()=>void}){
 const [w]=waitingLabel[r.waiting]||[''];
 const count=r.unread?Math.max(1,r.unreadCount||1):0;
 const urgent=isWaiting(r.waiting);
 const meta=[KIND_NAME[r.kind],w,r.windowLeft!==undefined&&r.waiting!=='afgehandeld'&&r.windowLeft>0&&r.windowLeft<6*3600_000?windowText(r.windowLeft):'',
  r.automated?'Automatisch':'',r.drafts?'Concept klaar':'',r.attachments?'📎 '+r.attachments:'',r.assigned?'→ '+r.assigned:''].filter(Boolean);
 return <button className={'tel-row wa'+(r.waiting==='afgehandeld'?' done':'')+(active?' active':'')} aria-current={active||undefined} onClick={onOpen}>
  <span className={'tel-avatar k-'+r.kind} aria-hidden="true">{initials(r.name)}<span className={'tel-mark k-'+r.kind}>{KIND_MARK[r.kind]}</span></span>
  <span className="tel-body">
   <span className="tel-line"><strong>{r.name}</strong><span className={'tel-time'+(count?' new':'')}>{stamp(r.at)}</span></span>
   <span className="tel-line"><span className={'tel-text'+(count?' unread':'')}>{r.fromUs&&<span className="tel-ticks" aria-label="Laatste bericht van ons">✓✓ </span>}{r.text||'(geen tekst)'}</span>
    {count?<span className="tel-count" aria-label={count+' ongelezen'}>{count}</span>:urgent?<span className="tel-dot" aria-label="Klant wacht op ons"/>:null}</span>
   <span className={'tel-meta'+(urgent?' urgent':'')}>{meta.join(' · ')}</span>
  </span>
 </button>;
}
