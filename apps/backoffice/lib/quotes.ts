// Offertes (wens eigenaar 5 november 2026): een offerte is een voorstel dat Rianne opmaakt en aanpast, gekoppeld aan
// de klantenkaart (en zo mogelijk aan het gesprek en de aanvraag in Planning). Er komen geen vaste arrangementen of
// algemene groepsprijzen uit voort: regels komen uit het assortiment, uit het goedgekeurde prijsvoorstel bij het
// gesprek of worden met de hand ingevuld. Bedragen zijn inclusief btw, net als de verkoopprijzen in de backoffice.
// Zonder database of netwerk: opslag in de gastgegevens (GuestState.quotes), via /api/gasten.
import {z} from 'zod';
export const QUOTE_STATUSES=['concept','verstuurd','geaccepteerd','afgewezen','vervallen'] as const;
export type QuoteStatus=typeof QUOTE_STATUSES[number];
const date=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Ongeldige datum.')]);
export const quoteLineSchema=z.object({description:z.string().trim().min(1,'Elke regel heeft een omschrijving.').max(500),quantity:z.number().positive('Een aantal is groter dan nul.').max(100000),unitCents:z.number().int().min(0).max(100000000),vat:z.enum(['0','9','21'])});
export type QuoteLine=z.infer<typeof quoteLineSchema>;
export const quoteSchema=z.object({
 id:z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),rev:z.number().int().min(0).optional(),
 customerId:z.string().max(400).default(''),
 customer:z.object({name:z.string().trim().min(1,'Vul de naam van de klant in.').max(300),email:z.union([z.literal(''),z.email('Vul een geldig e-mailadres in.')]).transform(v=>v.trim().toLowerCase()),phone:z.string().trim().max(100),company:z.string().trim().max(300)}),
 threadId:z.string().max(400).default(''),reservationId:z.string().max(100).default(''),
 title:z.string().trim().min(1,'Geef de offerte een titel, bijvoorbeeld „Teamuitje 24 personen”.').max(200),
 eventDate:date.default(''),people:z.number().int().min(0).max(10000).default(0),
 intro:z.string().max(5000).default(''),terms:z.string().max(5000).default(''),
 lines:z.array(quoteLineSchema).max(60),
 validUntil:date.default(''),status:z.enum(QUOTE_STATUSES).default('concept'),
});
export type QuoteInput=z.infer<typeof quoteSchema>;
export type QuoteMail={at:string;by:string;to:string;subject:string;messageId:string};
export type Quote=Omit<QuoteInput,'rev'>&{rev:number;number:string;created:string;updated:string;by:string;sentAt?:string;history:{at:string;by:string;status:QuoteStatus}[];
 // Versturen naar de gast (wens eigenaar 5 november 2026): de persoonlijke link en de verstuurde mails.
 shareToken?:string;mails?:QuoteMail[];
 // Reactie van de gast via de link (wens eigenaar 5 november 2026): akkoord of een vraag, en wat er precies is geaccepteerd.
 responses?:QuoteResponse[];accepted?:QuoteAcceptance};
export type QuoteResponse={at:string;kind:'akkoord'|'vraag';name:string;message:string;rev:number};
export type QuoteAcceptance={at:string;name:string;rev:number;totalCents:number;lines:QuoteLine[];title:string;eventDate:string;people:number};
export function quoteTotals(lines:QuoteLine[]){
 const rates=new Map<string,{rate:string;totalCents:number;vatCents:number;exclCents:number}>();let totalCents=0;
 for(const l of lines){const t=Math.round(l.quantity*l.unitCents);totalCents+=t;const r=rates.get(l.vat)||{rate:l.vat,totalCents:0,vatCents:0,exclCents:0};r.totalCents+=t;rates.set(l.vat,r)}
 const vat=[...rates.values()].sort((a,b)=>Number(a.rate)-Number(b.rate)).map(r=>{const vatCents=Math.round(r.totalCents*Number(r.rate)/(100+Number(r.rate)));return {...r,vatCents,exclCents:r.totalCents-vatCents}});
 return {totalCents,vatCents:vat.reduce((n,r)=>n+r.vatCents,0),exclCents:vat.reduce((n,r)=>n+r.exclCents,0),vat};
}
/** Volgnummer per jaar, nooit hergebruikt: OFF-2026-001. */
export function nextQuoteNumber(existing:{number:string}[],now=new Date()){
 const year=String(now.getUTCFullYear()),prefix='OFF-'+year+'-';
 const max=existing.filter(q=>q.number.startsWith(prefix)).reduce((n,q)=>Math.max(n,Number(q.number.slice(prefix.length))||0),0);
 return prefix+String(max+1).padStart(3,'0');
}
/** Bewaar of wijzig een offerte. Een nieuwere versie van een collega wordt niet overschreven. */
export function saveQuote(list:Quote[],raw:unknown,by:string,now=new Date()):{list:Quote[];quote:Quote}{
 const q=quoteSchema.parse(raw),at=now.toISOString(),old=list.find(x=>x.id===q.id);
 if(old&&typeof q.rev==='number'&&q.rev!==old.rev)throw Error('Deze offerte is intussen door iemand anders gewijzigd. Ververs en controleer de offerte.');
 if(q.status!=='concept'&&!q.lines.length)throw Error('Een offerte zonder regels kan niet verstuurd of geaccepteerd worden.');
 const {rev:_rev,...data}=q;
 const quote:Quote=old?{...old,...data,rev:old.rev+1,updated:at,by,sentAt:q.status==='verstuurd'&&old.status!=='verstuurd'?at:old.sentAt,history:old.status!==q.status?[...old.history,{at,by,status:q.status}].slice(-50):old.history}
  :{...data,rev:1,number:nextQuoteNumber(list,now),created:at,updated:at,by,sentAt:q.status==='verstuurd'?at:undefined,history:[{at,by,status:q.status}]};
 return {list:[...list.filter(x=>x.id!==q.id),quote],quote};
}
/** Alleen een concept mag weg; een verstuurde offerte blijft bewaard (zet hem op vervallen). */
export function deleteQuote(list:Quote[],id:string){const q=list.find(x=>x.id===id);if(!q)throw Error('Offerte onbekend.');if(q.status!=='concept')throw Error('Alleen een concept kan weg. Zet een verstuurde offerte op vervallen.');return list.filter(x=>x.id!==id);}
/** Offertes bij een klantenkaart: dezelfde kaart, hetzelfde e-mailadres, of een gekoppeld gesprek of gekoppelde aanvraag. */
export function quotesForCard(quotes:Quote[],card:{id:string;email:string;threadIds:string[];reservationIds:string[]}){
 const email=card.email.trim().toLowerCase();
 return quotes.filter(q=>q.customerId===card.id||(!!email&&q.customer.email===email)||(!!q.threadId&&card.threadIds.includes(q.threadId))||(!!q.reservationId&&card.reservationIds.includes(q.reservationId))).sort((a,b)=>b.created.localeCompare(a.created));
}
/** Een verstuurde offerte waarvan de geldigheid voorbij is, telt als verlopen (alleen weergave). */
export const isExpired=(q:Pick<Quote,'status'|'validUntil'>,today:string)=>q.status==='verstuurd'&&!!q.validUntil&&q.validUntil<today;

// ── Versturen naar de gast (wens eigenaar 5 november 2026) ──
/** Wat de gast via de persoonlijke link ziet: geen interne velden (wie, geschiedenis, koppelingen, revisie). */
export function publicQuote(q:Quote){
 const {number,title,customer,eventDate,people,intro,terms,lines,validUntil,status,sentAt,updated,rev}=q;
 const last=q.responses?.at(-1);
 return {number,title,customer:{name:customer.name,company:customer.company},eventDate,people,intro,terms,lines,validUntil,status,date:(sentAt||updated).slice(0,10),totals:quoteTotals(lines),rev,
  accepted:q.accepted?{at:q.accepted.at,name:q.accepted.name}:null,question:last?.kind==='vraag'&&last.rev===rev?{at:last.at}:null};
}
export type PublicQuote=ReturnType<typeof publicQuote>;
export const QUOTE_LINK='[link naar de offerte]';
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
const nlDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
/** Voorstel voor de mail; Rianne kan onderwerp en tekst nog aanpassen. De link staat er altijd in. */
export function quoteMailDraft(q:Pick<Quote,'number'|'title'|'intro'|'lines'|'validUntil'|'people'>,sender:string){
 const t=quoteTotals(q.lines);
 const facts=[`Totaal: ${euro(t.totalCents)} inclusief btw`+(q.people>0&&t.totalCents>0?` (${euro(Math.round(t.totalCents/q.people))} per persoon)`:''),q.validUntil&&`Geldig tot ${nlDate(q.validUntil)}`].filter(Boolean).join('\n');
 return {subject:`Offerte ${q.number}: ${q.title} · ${sender}`,body:`${q.intro.trim()?q.intro.trim()+'\n\n':''}${facts}\n\nDe volledige offerte bekijk je hier; daar kun je hem ook als PDF bewaren:\n${QUOTE_LINK}\n\nVia dezelfde link geef je meteen online akkoord, of laat je weten wat je wilt aanpassen. Antwoorden op deze mail kan ook.\n\nMet vriendelijke groet,\n${sender}`};
}
/** De link moet in de mail staan. Haalt Rianne de plek weg, dan komt de link er onderaan bij. */
export function withQuoteLink(body:string,url:string){return body.includes(QUOTE_LINK)?body.split(QUOTE_LINK).join(url):body.trimEnd()+'\n\nBekijk de offerte: '+url;}

// ── Reactie van de gast (wens eigenaar 5 november 2026) ──
export const responseSchema=z.object({kind:z.enum(['akkoord','vraag']),rev:z.number().int().min(1),name:z.string().trim().min(2,'Vul je naam in.').max(120),
 message:z.string().trim().max(2000).default(''),agree:z.boolean().optional()}).refine(v=>v.kind!=='vraag'||v.message.length>=3,{message:'Schrijf kort wat je wilt aanpassen.',path:['message']}).refine(v=>v.kind!=='akkoord'||v.agree===true,{message:'Vink aan dat je akkoord gaat met de offerte.',path:['agree']});
/** Kan de gast nu reageren? Alleen op een verstuurde, nog geldige offerte. */
export function respondProblem(q:Pick<Quote,'status'|'validUntil'>,today:string){
 if(q.status==='geaccepteerd')return 'Je hebt deze offerte al geaccepteerd. Dank je wel!';
 if(q.status!=='verstuurd')return 'Op deze offerte kun je niet meer online reageren. Neem contact met ons op.';
 if(q.validUntil&&q.validUntil<today)return 'Deze offerte is verlopen. Neem contact met ons op voor een nieuw voorstel.';
 return '';
}
/** Akkoord of een vraag van de gast. Akkoord legt precies vast wat er geaccepteerd is (regels en totaal van die versie). */
export function guestRespond(q:Quote,raw:unknown,today:string,now=new Date()):Quote{
 const v=responseSchema.parse(raw),problem=respondProblem(q,today);if(problem)throw Error(problem);
 if(v.rev!==q.rev)throw Error('De offerte is intussen aangepast. Ververs de pagina en bekijk de nieuwe versie.');
 const at=now.toISOString(),by='gast: '+v.name;
 const responses=[...(q.responses||[]),{at,kind:v.kind,name:v.name,message:v.message,rev:q.rev}].slice(-20);
 if(v.kind==='vraag')return {...q,responses};
 return {...q,responses,status:'geaccepteerd',rev:q.rev+1,updated:at,by,history:[...q.history,{at,by,status:'geaccepteerd' as const}].slice(-50),
  accepted:{at,name:v.name,rev:q.rev,totalCents:quoteTotals(q.lines).totalCents,lines:structuredClone(q.lines),title:q.title,eventDate:q.eventDate,people:q.people}};
}
