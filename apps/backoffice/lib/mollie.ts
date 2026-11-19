// Online betalen via Mollie (besluit eigenaar 3 november 2026, keuze E). Mollie int; de uitbetaling gaat naar de bunq-rekening.
// - Alleen server-side (fetch, geen extra pakket). De sleutel staat versleuteld bij Systeem & koppelingen → Mollie.
// - Alleen een testsleutel (test_…) werkt, tenzij MOLLIE_LIVE_ENABLED=1 op de server staat. Live gaat pas aan bij publiceren.
// - Een melding van Mollie (webhook) wordt nooit geloofd: de backoffice haalt de betaling altijd zelf op bij Mollie
//   en controleert bedrag, valuta, modus en kenmerk voordat iets als betaald geldt.
// Geen imports: ook los te testen. MOLLIE_API_BASE mag voor tests naar een lokale nepserver wijzen; alleen http://127.0.0.1 of http://localhost wordt geaccepteerd.

export class MollieError extends Error{status:number;providerStatus?:number;detail?:string;constructor(message:string,status=502){super(message);this.status=status}}
const local=(v:string|undefined)=>v&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v.replace(/\/+$/,''))?v.replace(/\/+$/,''):null;
export const mollieBase=()=>local(process.env.MOLLIE_API_BASE)??'https://api.mollie.com';

export const liveAllowed=()=>process.env.MOLLIE_LIVE_ENABLED==='1';
/** Testsleutel altijd; live-sleutel alleen als live op de server is toegestaan. */
export function validMollieKey(key:string,live=liveAllowed()){return /^test_[A-Za-z0-9]{20,64}$/.test(key)||(live&&/^live_[A-Za-z0-9]{20,64}$/.test(key))}
/** Centen → Mollie-bedrag ("12.50"). */
export function mollieAmount(cents:number){if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Ongeldig bedrag.');return (cents/100).toFixed(2)}
/** Mollie-bedrag ("12.50") → centen; NaN bij iets onverwachts. */
export function amountToCents(value:unknown){if(typeof value!=='string'||!/^\d{1,7}\.\d{2}$/.test(value))return NaN;const [e,c]=value.split('.');return Number(e)*100+Number(c)}

export const molliePaymentId=(v:unknown):v is string=>typeof v==='string'&&/^tr_[A-Za-z0-9]{4,40}$/.test(v);
export type MolliePayment={id:string;status:string;mode:'test'|'live';amountCents:number;currency:string;metadata:Record<string,unknown>;checkoutUrl:string|null;customerId?:string|null;mandateId?:string|null;sequenceType?:string;method?:string|null;refundedCents?:number;chargedBackCents?:number};

/** Mollie-status → betaalstatus van de backoffice. null = nog niets besloten (open, pending, authorized). */
export function mapMollieStatus(status:string):'betaald'|'mislukt'|null{
 if(status==='paid')return 'betaald';
 if(status==='failed'||status==='canceled'||status==='expired')return 'mislukt';
 return null;
}

/** Hoort deze Mollie-betaling bij onze betaalregel? Geeft een foutmelding, of null als alles klopt. */
export function checkMolliePayment(p:MolliePayment,expect:{paymentId:string;amountCents:number;mode:'test'|'live'}){
 if(p.metadata.paymentId!==expect.paymentId)return 'Deze betaling hoort bij een andere bestelling.';
 if(p.currency!=='EUR'||p.amountCents!==expect.amountCents)return 'Het bedrag van de betaling klopt niet met de bestelling.';
 if(p.mode!==expect.mode)return 'De betaling is in een andere modus (test/live) gedaan.';
 return null;
}

// Mollie geeft een betaalpagina op mollie.com; bij tests een lokale nepserver.
const safeCheckout=(v:unknown)=>{if(typeof v!=='string')return null;try{const u=new URL(v);return u.protocol==='https:'||(local(u.origin)&&u.protocol==='http:')?u.toString():null}catch{return null}};
function readPayment(raw:unknown):MolliePayment{
 const r=raw as Record<string,unknown>|null;
 const amount=r?.amount as Record<string,unknown>|undefined;
 const links=r?._links as Record<string,{href?:unknown}>|undefined;
 if(!r||!molliePaymentId(r.id)||typeof r.status!=='string'||(r.mode!=='test'&&r.mode!=='live')||!amount)throw new MollieError('Onverwacht antwoord van Mollie.');
 for(const f of ['amountRefunded','amountChargedBack'])if(r[f]&&(r[f] as {currency?:unknown}).currency!==amount.currency)throw new MollieError('Onverwachte valuta bij een Mollie-terugboeking.');
 const cents=amountToCents(amount.value);if(!Number.isFinite(cents))throw new MollieError('Onverwacht bedrag van Mollie.');
 const metadata=r.metadata&&typeof r.metadata==='object'&&!Array.isArray(r.metadata)?r.metadata as Record<string,unknown>:{};
 return {id:r.id,status:r.status,mode:r.mode,amountCents:cents,currency:String(amount.currency||''),metadata,checkoutUrl:safeCheckout(links?.checkout?.href),customerId:typeof r.customerId==='string'?r.customerId:null,mandateId:typeof r.mandateId==='string'?r.mandateId:null,sequenceType:typeof r.sequenceType==='string'?r.sequenceType:'oneoff',method:typeof r.method==='string'?r.method:null,refundedCents:r.amountRefunded?amountToCents((r.amountRefunded as {value:unknown}).value):0,chargedBackCents:r.amountChargedBack?amountToCents((r.amountChargedBack as {value:unknown}).value):0};
}

async function call(key:string,path:string,init:{method?:string;body?:unknown;idempotencyKey?:string}={}){
 let res:Response;
 try{
  res=await fetch(mollieBase()+path,{method:init.method||'GET',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+key,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.idempotencyKey?{'Idempotency-Key':init.idempotencyKey}:{})},
   body:init.body?JSON.stringify(init.body):undefined});
 }catch{throw new MollieError('Mollie is nu niet bereikbaar. Probeer het zo opnieuw.',503)}
 const data=await res.json().catch(()=>null);
 if(res.status===401){const e=new MollieError('De Mollie-sleutel wordt geweigerd. Controleer hem bij Systeem & koppelingen → Mollie.',503);e.providerStatus=401;throw e}
 // Gasten zien een duidelijke Nederlandse melding (wens eigenaar 9 november 2026: de Engelse tekst van Mollie, zoals „Your account is
 // currently suspended”, zei de gast niets). De tekst van Mollie zelf staat in het logboek en gaat mee als detail voor de kassa.
 if(!res.ok){const detail=data&&typeof data.detail==='string'?data.detail.slice(0,200):'';console.error('[mollie]',res.status,detail);
  const e=new MollieError('Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.',res.status>=500?503:502);e.detail=detail;e.providerStatus=res.status;throw e}
 return data;
}

export async function createMolliePayment(key:string,p:{amountCents:number;description:string;redirectUrl:string;webhookUrl:string|null;metadata:Record<string,string>;idempotencyKey:string;customerId?:string;mandateId?:string;sequenceType?:'first'|'recurring';method?:'ideal'|'directdebit'}){
 return readPayment(await call(key,'/v2/payments',{method:'POST',idempotencyKey:p.idempotencyKey,body:{
  amount:{currency:'EUR',value:mollieAmount(p.amountCents)},description:p.description.slice(0,255),redirectUrl:p.redirectUrl,
  ...(p.webhookUrl?{webhookUrl:p.webhookUrl}:{}),locale:'nl_NL',metadata:p.metadata,...(p.customerId?{customerId:p.customerId,sequenceType:p.sequenceType,method:p.method}:{}),...(p.mandateId?{mandateId:p.mandateId}:{})}}));
}
export async function getMolliePayment(key:string,id:string){
 if(!molliePaymentId(id))throw new MollieError('Onbekende betaling.',400);
 return readPayment(await call(key,'/v2/payments/'+id));
}

/** Mollie kan alleen een openbaar https-adres bereiken: MOLLIE_WEBHOOK_ORIGIN, anders het adres van de telefoonstand.
 *  Zonder openbaar adres (gewoon op de eigen computer) controleert de bestelpagina de betaling bij terugkomst. */
export function webhookUrl(env:Record<string,string|undefined>=process.env){
 for(const v of [env.MOLLIE_WEBHOOK_ORIGIN,env.BACKOFFICE_TUNNEL_ORIGIN]){
  try{const u=new URL(v||'');if(u.protocol==='https:'&&!/^(localhost|127\.|\[::1\])/.test(u.hostname))return u.origin+'/api/public/payments/mollie'}catch{}
 }
 return null;
}

// Officiële bron: mollie/openapi/specs.yaml (Customers, Mandates en Payments API), geraadpleegd 5 november 2026.
export const mollieCustomerId=(v:unknown):v is string=>typeof v==='string'&&/^cst_[A-Za-z0-9]{4,80}$/.test(v);
export const mollieMandateId=(v:unknown):v is string=>typeof v==='string'&&/^mdt_[A-Za-z0-9]{4,80}$/.test(v);
export async function createMollieCustomer(key:string,input:{name:string;email:string;subscriptionId:string}){
 const r=await call(key,'/v2/customers',{method:'POST',idempotencyKey:'harvest-customer:'+input.subscriptionId,body:{name:input.name,email:input.email,locale:'nl_NL',metadata:{harvestSubscriptionId:input.subscriptionId}}});
 if(!r||!mollieCustomerId(r.id))throw new MollieError('Onverwacht klantantwoord van Mollie.');return r.id as string;
}
export type MollieMandate={id:string;customerId:string;mode:'test'|'live';status:'valid'|'pending'|'invalid';method:string};
export async function getMollieMandate(key:string,customerId:string,mandateId:string):Promise<MollieMandate>{
 if(!mollieCustomerId(customerId)||!mollieMandateId(mandateId))throw new MollieError('Ongeldige incassomachtiging.');
 const r=await call(key,'/v2/customers/'+customerId+'/mandates/'+mandateId);
 if(!r||r.id!==mandateId||r.customerId!==customerId||!['valid','pending','invalid'].includes(r.status)||!['test','live'].includes(r.mode)||typeof r.method!=='string')throw new MollieError('Onverwachte incassomachtiging van Mollie.');
 return {id:r.id,customerId:r.customerId,mode:r.mode,status:r.status,method:r.method};
}
export async function listMollieMandates(key:string,customerId:string):Promise<MollieMandate[]>{
 if(!mollieCustomerId(customerId))throw new MollieError('Ongeldige incassoklant.');
 const r=await call(key,'/v2/customers/'+customerId+'/mandates?limit=250');
 if(r?._links?.next)throw new MollieError('Het machtigingsoverzicht is te groot om automatisch een machtiging te kiezen.');
 if(!Array.isArray(r?._embedded?.mandates))throw new MollieError('Onverwacht machtigingsoverzicht van Mollie.');
 return r._embedded.mandates.filter((m:Record<string,unknown>)=>mollieMandateId(m.id)&&m.customerId===customerId&&['test','live'].includes(String(m.mode))&&['valid','pending','invalid'].includes(String(m.status))).map((m:MollieMandate)=>({id:m.id,customerId:m.customerId,mode:m.mode,status:m.status,method:m.method}));
}
/** Herstel na een weggevallen antwoord: eerst zoeken op ons vaste betaal-ID, ook als de idempotentiesleutel verlopen is. */
export async function findMollieCustomerPayment(key:string,customerId:string,paymentId:string){
 if(!mollieCustomerId(customerId))throw new MollieError('Ongeldige incassoklant.');
 let from='';for(let page=0;page<20;page++){
  const r=await call(key,'/v2/customers/'+customerId+'/payments?limit=250'+(from?'&from='+encodeURIComponent(from):''));
  const rows=r?._embedded?.payments;if(!Array.isArray(rows))throw new MollieError('Mollie-betaaloverzicht kon niet worden gecontroleerd.');
  const found=rows.filter((p:Record<string,unknown>)=>(p.metadata as Record<string,unknown>|null)?.paymentId===paymentId);if(found.length>1)throw new MollieError('Meerdere betalingen met hetzelfde kenmerk; controleer handmatig.');if(found.length)return readPayment(found[0]);
  if(!r?._links?.next)return null;
  const last=rows.at(-1);if(!molliePaymentId(last?.id)||last.id===from)throw new MollieError('Mollie-betaaloverzicht is onvolledig.');from=last.id;
 }throw new MollieError('Mollie-betaaloverzicht is te groot om veilig een nieuwe incasso te starten.');
}
export async function createMollieRecurring(key:string,p:{amountCents:number;description:string;webhookUrl:string;customerId:string;mandateId:string;paymentId:string;subscriptionId:string}){
 return readPayment(await call(key,'/v2/payments',{method:'POST',idempotencyKey:p.paymentId,body:{amount:{currency:'EUR',value:mollieAmount(p.amountCents)},description:p.description,webhookUrl:p.webhookUrl,customerId:p.customerId,mandateId:p.mandateId,sequenceType:'recurring',method:'directdebit',metadata:{paymentId:p.paymentId,harvestSubscriptionId:p.subscriptionId}}}));
}

// ---- Terugbetalen (besluit eigenaar 9 november 2026: evenementen van leden, één knop voor de coördinator) ----
// Officiële bron: Mollie Refunds API, POST /v2/payments/{paymentId}/refunds. Een vaste Idempotency-Key per betaling zorgt dat
// een herhaalde poging (dubbel klikken, verloren antwoord) bij Mollie nooit een tweede terugbetaling maakt.
export const mollieRefundId=(v:unknown):v is string=>typeof v==='string'&&/^re_[A-Za-z0-9]{4,40}$/.test(v);
export type MollieRefund={id:string;status:string;amountCents:number;paymentId:string};
/** Mislukt of geannuleerd bij Mollie: het geld is niet teruggegaan. */
export const refundFailed=(status:string)=>status==='failed'||status==='canceled';
export async function createMollieRefund(key:string,p:{paymentId:string;amountCents:number;description:string;idempotencyKey:string}):Promise<MollieRefund>{
 if(!molliePaymentId(p.paymentId))throw new MollieError('Onbekende betaling.',400);
 const r=await call(key,'/v2/payments/'+p.paymentId+'/refunds',{method:'POST',idempotencyKey:p.idempotencyKey,
  body:{amount:{currency:'EUR',value:mollieAmount(p.amountCents)},description:p.description.slice(0,140)}});
 const cents=amountToCents(r?.amount?.value);
 if(!r||!mollieRefundId(r.id)||typeof r.status!=='string'||r.amount?.currency!=='EUR'||cents!==p.amountCents)throw new MollieError('Onverwacht antwoord van Mollie bij het terugbetalen.');
 return {id:r.id,status:r.status,amountCents:cents,paymentId:p.paymentId};
}
