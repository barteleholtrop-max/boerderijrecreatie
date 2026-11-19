import {corsHeaders,originAllowed,createRateLimit,clientKey,returnPage} from '@/lib/public-orders';
import {withConnectionSettings} from '@/lib/connection-settings';
import {billByToken,billDetail,changeLimit,changeWarn,requestShareCash,startSharing,participants,shareById,shareForEmail,groupById,refreshShare,payShareOnline,BillError} from '@/lib/group-bill';
import {getSetting} from '@/lib/order-options-store';
import {normalizeCode} from '@/lib/order-options';
import {PaymentsOff,mollieKey} from '@/lib/online-payments';
import {MollieError} from '@/lib/mollie';
export const dynamic='force-dynamic';
// Gezamenlijke rekening voor gasten (wens eigenaar 5 november 2026), zonder login. De bescherming:
// - houder=<token> (in de POST-body, nooit in het adres, zodat de beheerlink niet in logboeken komt; #192): alleen de
//   rekeninghouder kent zijn beheerlink (de backoffice bewaart alleen de sha-256). Met action 'lezen' ziet hij de stand
//   en de factuur; verder verhoogt hij het maximum en start hij het afrekenen (in één keer of gesplitst).
// - ?deel=<id>: een betaalverzoek (onraadbare id). Wie de link heeft, ziet alleen het bedrag en betaalt met iDEAL.
// - Schrijven alleen vanaf de eigen website (Origin), met een limiet per minuut.
const readLimit=createRateLimit({perClient:60,total:600}),writeLimit=createRateLimit({perClient:10,total:200});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
const failure=(origin:string|null,e:unknown)=>e instanceof PaymentsOff?reply(origin,{error:e.message,unavailable:true},503)
 // Wat bunq of Mollie zelf zei, gaat mee als detail (melding eigenaar 11 november 2026: „betalen lukt niet”, zonder reden).
 :e instanceof BillError||e instanceof MollieError?reply(origin,{error:e.message,...(e instanceof MollieError&&e.detail?{detail:e.detail}:{})},e.status<500?e.status:502)
 :e instanceof Error&&/^(Kies|Er staat|Het bedrag|Het maximum)/.test(e.message)?reply(origin,{error:e.message},400)
 :reply(origin,{error:'Dat lukt nu niet. Probeer het zo opnieuw.'},503);
export function OPTIONS(req:Request){const origin=req.headers.get('origin');return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)})}

/** Wat de rekeninghouder ziet: de rekening, de betaalverzoeken en de factuur als overzicht: wat er besteld is en wie er
 *  besteld hebben, niet wie wat nam (wens eigenaar 5 november 2026). Een factuur per persoon kan op verzoek via de backoffice. */
async function holderView(token:string){
 let g=await billByToken(token);if(!g)return null;
 // Lopende iDEAL-betalingen van delen eerst nakijken bij Mollie, zodat de rekeninghouder vanzelf ziet wie betaald heeft.
 for(const x of (await billDetail(g)).shares)if(x.busy){const row=await shareById(x.id);if(row)try{await refreshShare(row)}catch{}}
 g=(await billByToken(token))!;
 const d=await billDetail(g);
 // Meebetalen: de rekeninghouder ziet per persoon of die zijn deel betaald heeft, niet hoeveel.
 return {...d,id:undefined,online:!!mollieKey(),invoice:{...d.invoice,people:[]},participants:(await participants(g)).map(p=>({key:p.key,name:p.name,holder:p.holder})),
  shares:d.shares.map(s=>({...s,paidCents:undefined}))};
}
async function shareView(id:string){
 let s=await shareById(id);if(!s)return null;
 try{await refreshShare(s);s=(await shareById(id))!}catch{}
 const g=(await groupById(s.groupCodeId))!;
 // Meebetalen: alleen het gedeelde bedrag, en of je zelf een bedrag mag kiezen (zelfde grenzen als „Jou wat goed fielt”).
 const own=s.payerEmail?await getSetting('website'):null;
 return {bill:g.name,kind:g.kind,holder:g.holderName.split(' ')[0]||'',payer:s.payerName,position:s.position,count:s.count,amountCents:s.amountCents,paid:s.status==='betaald',replaced:s.status==='vervallen',online:!!mollieKey(),
  busy:!!s.externalRef&&s.status==='open',cash:s.method==='contant-gevraagd'&&s.status==='open',toPayCents:s.paidCents??s.amountCents,ownAmount:own?.enabled?{maxPercent:own.maxPercent,allowZero:own.allowZero}:null};
}
export async function GET(req:Request){
 const origin=req.headers.get('origin'),q=new URL(req.url).searchParams;
 if(!readLimit(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  // De beheerlink hoort niet in een adres (logboeken); oude pagina's krijgen het verzoek om te verversen.
  if(q.has('houder'))return reply(origin,{error:'Ververs de pagina om je rekening te bekijken.'},400);
  if(q.has('deel')){const v=await shareView(q.get('deel')||'');return v?reply(origin,v):reply(origin,{error:'Dit betaalverzoek kennen we niet.'},404)}
  return reply(origin,{error:'Onbekende rekening.'},400);
 })}catch(e){return failure(origin,e)}
}
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Dit kan alleen via de website van Boer Bart.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanvraag.'},415);
 const text=await req.text().catch(()=>'');if(text.length>2000)return reply(origin,{error:'Ongeldige aanvraag.'},413);
 let b:{contant?:unknown;houder?:unknown;deel?:unknown;action?:unknown;limitCents?:unknown;warnCents?:unknown;count?:unknown;page?:unknown;payers?:unknown;chosenCents?:unknown;meebetalen?:unknown;email?:unknown};try{b=JSON.parse(text)}catch{return reply(origin,{error:'Ongeldige aanvraag.'},400)}
 const reading=b.action==='lezen'&&typeof b.houder==='string';
 if(!(reading?readLimit:writeLimit)(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  if(typeof b.deel==='string'){
   const s=await shareById(b.deel);if(!s)return reply(origin,{error:'Dit betaalverzoek kennen we niet.'},404);
   // Terug na Mollie: de bestelpagina van de website waar de gast vandaan kwam (die toont het betaalverzoek met ?deel=).
   const back=new URL(returnPage(b.page),origin!);back.searchParams.set('deel',s.id);
   const chosen=b.chosenCents==null?null:Number.isSafeInteger(b.chosenCents)?b.chosenCents as number:NaN;
   if(Number.isNaN(chosen))return reply(origin,{error:'Kies een geldig bedrag.'},400);
   // Contant bij de kassa (wens eigenaar 11 november 2026): geen betaalverzoek; de kassa rekent af.
   if(b.contant===true){const c=await requestShareCash(s,chosen);return reply(origin,c)}
   const r=await payShareOnline(s,back.toString(),chosen);
   return reply(origin,'paid' in r?{paid:true}:{checkoutUrl:r.checkoutUrl});
  }
  // Meebetalen via de ene link: met het e-mailadres dat bij het bestellen is gebruikt, naar het eigen deel.
  if(typeof b.meebetalen==='string'){
   const code=normalizeCode(b.meebetalen),s=code&&typeof b.email==='string'?await shareForEmail(code,b.email):null;
   if(!s)return reply(origin,{error:'Dit e-mailadres staat niet bij de meebetalers van deze rekening. Gebruik het adres van je bestelling, of vraag het aan de rekeninghouder.'},404);
   return reply(origin,{deel:s.id});
  }
  const g=typeof b.houder==='string'?await billByToken(b.houder):null;
  if(!g)return reply(origin,{error:reading?'Deze rekening kennen we niet. Gebruik de link die je kreeg bij het openen.':'Deze rekening kennen we niet.'},404);
  if(reading)return reply(origin,await holderView(b.houder as string));
  if(b.action==='maximum'){await changeLimit(g,b.limitCents);return reply(origin,await holderView(b.houder as string))}
  // Eigen rekening (wens eigenaar 11 november 2026): zelfgekozen grens voor een waarschuwing; null = geen grens.
  if(b.action==='grens'){await changeWarn(g,b.warnCents??null);return reply(origin,await holderView(b.houder as string))}
  // Afrekenen: de rekeninghouder en de aangevinkte meebetalers krijgen ieder een gelijk deel.
  if(b.action==='afrekenen'){const keys=Array.isArray(b.payers)?b.payers.filter((k):k is string=>typeof k==='string').slice(0,30):[];await startSharing(g,keys);return reply(origin,await holderView(b.houder as string))}
  return reply(origin,{error:'Onbekende actie.'},400);
 })}catch(e){return failure(origin,e)}
}
