// Serializable additions to the existing guest workspace. No second mail store or booking store.
import {z} from 'zod';
import {validateBooking,type GuestState} from './guest-core';
const text=z.string().max(12000),lines=z.array(z.string().max(2000)).max(30);
export const knowledgeSchema=z.object({
 id:z.string().min(1).max(100),source:z.url().refine(v=>/^https?:\/\//i.test(v)),informationDate:z.iso.date(),consultedAt:z.iso.datetime(),
 wishes:text,solution:text,included:lines,unknown:lines,
 evidence:z.enum(['feit','interpretatie','onbekend']),status:z.enum(['aangeboden','geaccepteerd','onbekend']),
 historicalPrices:lines,
 // A verified excerpt/import, never a general business rule. No contact details required.
});
export type KnowledgeExample=z.infer<typeof knowledgeSchema>;
export const proposalSchema=z.object({
 items:z.array(z.object({description:z.string().min(1).max(500),quantity:z.number().positive().max(10000),unitCents:z.number().int().min(0).max(10000000)})).max(30),
 assumptions:lines,vat:z.string().max(500),included:lines,unknown:lines,
});
// Suggested date, time and size to reserve in the agenda (wish owner, 3 November 2026). Only a suggestion: Sanne checks
// and adjusts it, and the planning rules decide whether it fits.
export const bookingSchema=z.object({activity:z.enum(['groep','bezoek','yte']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),
 from:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),to:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),people:z.number().int().min(1).max(1000)}).refine(v=>v.from<v.to);
export type BookingSuggestion=z.infer<typeof bookingSchema>;
export const adviceSchema=z.object({wishes:text,solution:text,reason:text,missing:lines,conflicts:lines,
 exampleIds:z.array(z.string().max(100)).max(30),comparisons:lines,proposal:proposalSchema.nullable(),review:lines,nextAction:z.string().max(1000),guestDraft:z.string().max(12000),booking:bookingSchema.nullable().optional()}).strict();
export type Advice=z.infer<typeof adviceSchema>;
export type AdviceRevision={id:string;at:string;by:string;engine?:string;basis:string;lastMessageId?:string;advice:Advice;availability:{id:string;result:string}[];sources:{label:string;status:string;url?:string}[]};
export type QuoteApproval={revisionId:string;at:string;by:string;totalCents:number;proposal:NonNullable<Advice['proposal']>};
export type GroupDossier={revision:number;revisions:AdviceRevision[];approvals:QuoteApproval[];note:string;error?:string};
export const emptyDossier=():GroupDossier=>({revision:0,revisions:[],approvals:[],note:''});
export function proposalTotal(p:NonNullable<Advice['proposal']>){return p.items.reduce((n,i)=>n+Math.round(i.quantity*i.unitCents),0)}
// Models sometimes answer a text field with a list of sentences, or a list field with one sentence (seen with Claude,
// 3 November 2026). Only that shape is repaired here; the content is checked as before.
const TEXT_KEYS=['wishes','solution','reason','nextAction','guestDraft'],LIST_KEYS=['missing','conflicts','comparisons','review','exampleIds'],PROPOSAL_LISTS=['assumptions','included','unknown'];
const asText=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==='string')?v.join('\n'):v===null?'':v;
const asList=(v:unknown)=>typeof v==='string'?(v.trim()?[v]:[]):v===null?[]:v;
export function normalizeAdvice(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
 const a:Record<string,unknown>={...raw as Record<string,unknown>};
 for(const k of TEXT_KEYS)if(k in a)a[k]=asText(a[k]);
 for(const k of LIST_KEYS)if(k in a)a[k]=asList(a[k]);
 // An unclear or incomplete reservation suggestion is dropped, not a reason to reject the whole advice.
 if('booking' in a){const b=a.booking&&typeof a.booking==='object'?{...a.booking as Record<string,unknown>}:null;if(b&&typeof b.people==='string')b.people=Number(b.people);a.booking=b&&bookingSchema.safeParse(b).success?b:null}
 if(a.proposal&&typeof a.proposal==='object'&&!Array.isArray(a.proposal)){const p:Record<string,unknown>={...a.proposal as Record<string,unknown>};for(const k of PROPOSAL_LISTS)if(k in p)p[k]=asList(p[k]);if('vat' in p)p.vat=asText(p.vat);a.proposal=p}
 return a;
}
export function checkAdvice(raw:unknown,examples:KnowledgeExample[]):Advice{
 const parsed=adviceSchema.safeParse(normalizeAdvice(raw));
 if(!parsed.success)throw Error('Het antwoord van de AI had niet de verwachte vorm ('+[...new Set(parsed.error.issues.map(i=>String(i.path[0]??'antwoord')))].join(', ')+'). Probeer het opnieuw; er is niets opgeslagen of verstuurd.');
 const a=parsed.data;
 if(a.exampleIds.some(id=>!examples.some(e=>e.id===id)))throw Error('AI verwees naar een onbekend kennisvoorbeeld.');
 const allowed=new Set(examples.map(e=>e.source.replace(/\/$/,'')));
 for(const url of a.comparisons.join(' ').match(/https?:\/\/[^\s)>\]]+/g)||[])if(!allowed.has(url.replace(/[.,;]+$/,'').replace(/\/$/,'')))throw Error('AI verwees naar een niet-aangeleverde bronlink.');
 // Prices remain internal. The separate, approved quote is added by the server, never by the model.
 if(/€|\beur(?:o)?\b|\b\d+[,.]\d{2}\b|\b(?:prijs|tarief|kost(?:en)?|bedrag|gratis|kosteloos)\b/i.test(a.guestDraft))throw Error('Het gastconcept bevat een onbevestigde prijs. Maak een nieuw voorstel.');
 if(/\b(?:beschikbaar|gereserveerd|bevestigd|vastgelegd|plek vrij)\b/i.test(a.guestDraft))throw Error('Het gastconcept suggereert onbevestigde beschikbaarheid. Maak een nieuw voorstel.');
 if(!a.guestDraft.trim())throw Error('AI gaf geen gastconcept terug.');
 // Always store the field (null when unclear), so this advice is reused instead of prepared again.
 return {...a,booking:a.booking??null};
}
export function availabilityFor(s:GuestState,ref:string){
 return s.reservations.filter(r=>r.threadId===ref&&r.status!=='geannuleerd').map(r=>{
  try{validateBooking(s,{...r,status:'bevestigd'});return {id:r.id,result:'Past volgens de huidige centrale capaciteitscontrole; uitvoering/ruimte nog beoordelen. Dit houdt geen plaats vast.'}}
  catch(e){return {id:r.id,result:'Ter beoordeling: '+(e instanceof Error?e.message:'Onbekend')}}
 });
}
export function assertBasis(expected:string,actual:string){if(expected!==actual)throw Error('Het gesprek, concept of de planning is intussen gewijzigd. Bereid opnieuw voor; je tekst blijft behouden.');}
export function guestText(d:GroupDossier,revisionId:string){
 const r=d.revisions.find(r=>r.id===revisionId);if(!r)throw Error('Advies niet gevonden.');
 const approved=d.approvals.find(a=>a.revisionId===revisionId);
 return r.advice.guestDraft+(approved?'\n\nHet goedgekeurde prijsvoorstel is '+new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(approved.totalCents/100)+'. Inbegrepen: '+approved.proposal.included.join('; ')+'. Btw: '+approved.proposal.vat+'.':'');
}

// ---- Meest recente geschiedenis (wens eigenaar 3 november 2026) ----
// Een goedgekeurd prijsvoorstel wordt meteen een nieuw bronvoorbeeld in dezelfde kennis (groupKnowledge), zodat
// volgende voorstellen op de nieuwste eigen prijzen kunnen leunen. Append-only: één record per goedgekeurde
// voorstelversie. Geen contactgegevens: e-mailadressen en telefoonnummers worden weggehaald.
const scrub=(v:string)=>v.replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi,'[e-mail]').replace(/(?:\+31|0031|\b0)[\s-]?(?:\d[\s-]?){8,10}\b/g,'[telefoon]');
const money=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
export const approvalKnowledgeId=(revisionId:string,at:string)=>'B-'+at.slice(0,10).replace(/-/g,'')+'-'+revisionId.slice(0,8);
export function approvalKnowledge(r:AdviceRevision,a:QuoteApproval,source:string):KnowledgeExample{
 const p=a.proposal;
 return knowledgeSchema.parse({id:approvalKnowledgeId(r.id,a.at),source,informationDate:a.at.slice(0,10),consultedAt:a.at,evidence:'feit',status:'aangeboden',
  wishes:scrub(r.advice.wishes).slice(0,12000),solution:scrub(r.advice.solution).slice(0,12000),
  historicalPrices:[...p.items.slice(0,25).map(i=>scrub(`${i.description}: ${i.quantity} × ${money(i.unitCents)}`).slice(0,2000)),`Totaal ${money(a.totalCents)} · btw: ${scrub(p.vat)}`.slice(0,2000),`Goedgekeurd door ${a.by} op ${a.at.slice(0,10)}; aangeboden, acceptatie door de gast nog niet vastgelegd.`],
  included:p.included.slice(0,30).map(v=>scrub(v).slice(0,2000)),unknown:p.unknown.slice(0,30).map(v=>scrub(v).slice(0,2000))});
}
/** Nieuwste eerst: eigen goedgekeurde voorstellen en recente bronnen wegen het zwaarst. */
export const newestFirst=(examples:KnowledgeExample[])=>[...examples].sort((x,y)=>y.informationDate.localeCompare(x.informationDate)||y.consultedAt.localeCompare(x.consultedAt));
