// Offerte naar de gast sturen (wens eigenaar 5 november 2026). Via de Gmail-koppeling van Gesprekken, dus vanaf de
// gastenmailbox (info@). De mail bevat een persoonlijke link naar de offerte (/offerte/<link>); daar kan de gast hem
// bekijken en als PDF bewaren. Een vaste Message-ID per verzending voorkomt dat dezelfde mail twee keer weggaat.
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {loadGuest,editGuest} from './guest-store';
import {withQuoteLink,type Quote} from './quotes';
export const quoteUrl=(token:string)=>new URL('/offerte/'+token,process.env.APP_ORIGIN||'http://localhost:3001').toString();
export const quoteSendSchema=z.object({id:z.string().max(64),to:z.email('Vul een geldig e-mailadres van de gast in.').max(300),subject:z.string().trim().min(1,'Vul een onderwerp in.').max(200),body:z.string().trim().min(1,'Schrijf een korte tekst bij de offerte.').max(20000),requestId:z.uuid()});
export async function sendQuote(raw:unknown,by:string){
 const b=quoteSendSchema.parse(raw);
 const {sendEnabled,mailbox,isConnected,mailClient}=await import('./mail-store');
 if(!sendEnabled())throw Error('Verzenden staat uit in deze omgeving (MAIL_SEND_ENABLED). Download de PDF en stuur hem zelf mee.');
 if(!await isConnected())throw Error('Gmail is niet gekoppeld (Gesprekken → Google koppelen). Download de PDF en stuur hem zelf mee.');
 // 1. De persoonlijke link vastleggen (eenmalig per offerte).
 let token='';
 await editGuest(s=>{const q=(s.quotes||[]).find(x=>x.id===b.id);if(!q)throw Error('Offerte onbekend.');if(!q.lines.length)throw Error('Een offerte zonder regels kan niet verstuurd worden.');
  if(['afgewezen','vervallen'].includes(q.status))throw Error('Deze offerte is afgewezen of vervallen. Zet hem eerst terug op concept.');
  q.shareToken??=randomBytes(32).toString('base64url');token=q.shareToken;});
 // 2. Versturen; dezelfde aanvraag (requestId) wordt niet opnieuw verstuurd.
 const client=await mailClient(),messageId=`<offerte-${b.id}-${b.requestId}@boerbart.nl>`;
 const found=(await client.findMessages('in:sent rfc822msgid:'+messageId)).messages?.[0];
 if(!found){const {buildMessage}=await import('./mail-core');await client.sendMessage(buildMessage({from:mailbox(),to:b.to,subject:b.subject,body:withQuoteLink(b.body,quoteUrl(token)),messageId}))}
 // 3. Status verstuurd en de verzending in de geschiedenis.
 const at=new Date().toISOString();
 await editGuest(s=>{const q=(s.quotes||[]).find(x=>x.id===b.id);if(!q)return;if((q.mails||[]).some(m=>m.messageId===messageId))return;
  q.mails=[...(q.mails||[]),{at,by,to:b.to.toLowerCase(),subject:b.subject,messageId}].slice(-20);
  if(q.status==='concept'){q.status='verstuurd';q.history=[...q.history,{at,by,status:'verstuurd' as const}].slice(-50)}
  q.sentAt??=at;q.rev+=1;q.updated=at;q.by=by;});
 return {url:quoteUrl(token)};
}
/** De offerte bij een persoonlijke link, of niets. */
export async function quoteByToken(token:string):Promise<Quote|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const {state}=await loadGuest();return (state.quotes||[]).find(q=>!!q.shareToken&&q.shareToken===token)||null;
}
// ── Online akkoord of een vraag van de gast (wens eigenaar 5 november 2026) ──
const amsterdamToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
/** Verwerkt de reactie via de persoonlijke link en meldt die in de gastenmailbox. */
export async function respondToQuote(token:string,raw:unknown){
 const {guestRespond}=await import('./quotes');
 let after:Quote|null=null;
 await editGuest(s=>{const list=s.quotes||[],i=list.findIndex(q=>!!q.shareToken&&q.shareToken===token);if(i<0)throw Error('Deze offerte kennen we niet.');
  after=guestRespond(list[i],raw,amsterdamToday());s.quotes=list.map((q,n)=>n===i?after!:q);});
 const q=after as Quote|null;if(!q)throw Error('Deze offerte kennen we niet.');
 await notifyTeam(q).catch(()=>{});
 return q;
}
/** Een korte melding in de gastenmailbox, zodat Rianne het meteen ziet. Lukt mailen niet, dan staat het in de backoffice. */
async function notifyTeam(q:Quote){
 const r=q.responses?.at(-1);if(!r)return;
 const {sendEnabled,mailbox,isConnected,mailClient}=await import('./mail-store');
 if(!sendEnabled()||!await isConnected())return;
 const client=await mailClient(),messageId=`<offerte-${q.id}-reactie-${Date.parse(r.at)}@boerbart.nl>`;
 if((await client.findMessages('in:sent rfc822msgid:'+messageId)).messages?.[0])return;
 const link=new URL('/offertes?offerte='+q.id,process.env.APP_ORIGIN||'http://localhost:3001').toString();
 const subject=r.kind==='akkoord'?`Akkoord: offerte ${q.number} (${q.title})`:`Vraag over offerte ${q.number} (${q.title})`;
 const body=r.kind==='akkoord'?`${r.name} heeft online akkoord gegeven op offerte ${q.number} voor ${q.customer.company||q.customer.name}.\n\nLeg de boeking vast in Planning; daar wordt de capaciteit gecontroleerd.\n\n${link}`
  :`${r.name} wil iets aanpassen aan offerte ${q.number} voor ${q.customer.company||q.customer.name}:\n\n${r.message}\n\nPas de offerte aan en stuur hem opnieuw.\n\n${link}`;
 const {buildMessage}=await import('./mail-core');
 await client.sendMessage(buildMessage({from:mailbox(),to:mailbox(),subject,body,messageId}));
}
