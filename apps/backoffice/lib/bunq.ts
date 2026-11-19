// bunq-koppeling (wens eigenaar 6 november 2026): het Mollie-geld op bunq Main verdelen over de eigen subrekeningen, en
// uitbetalingen van BB-tegoed klaarzetten als conceptbetaling die de eigenaar in de bunq-app bevestigt.
// - Alleen server-side (fetch en node:crypto, geen extra pakket). De API-sleutel staat versleuteld bij Systeem & koppelingen → bunq.
// - Standaard de testomgeving van bunq (sandbox). De echte bank alleen als BUNQ_LIVE_ENABLED=1 op de server staat: dat gaat pas aan
//   bij publiceren, met apart akkoord van de eigenaar.
// - De backoffice verplaatst zelf nooit geld (besluit eigenaar 6 november 2026: alles bevestigen op de telefoon). Er zijn alleen
//   conceptbetalingen, die bunq pas uitvoert als de eigenaar ze in de bunq-app bevestigt:
//   1. ownDraft: de maandagverdeling, één concept met een regel per eigen subrekening. Vóór het klaarzetten wordt gecontroleerd dat
//      elk doel-IBAN echt een eigen rekening is (opnieuw opgehaald bij bunq).
//   2. draftPayment: een uitbetaling aan een lid.
// - BUNQ_API_BASE mag voor tests naar een lokale nepserver wijzen; alleen http://127.0.0.1 of http://localhost wordt geaccepteerd.
import {generateKeyPairSync,createSign,createHash,randomUUID} from 'node:crypto';

export class BunqError extends Error{status:number;providerStatus?:number;constructor(message:string,status=502){super(message);this.status=status}}
const local=(v:string|undefined)=>v&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v.replace(/\/+$/,''))?v.replace(/\/+$/,''):null;
export const bunqLiveAllowed=()=>process.env.BUNQ_LIVE_ENABLED==='1';
export const SANDBOX_BASE='https://public-api.sandbox.bunq.com';
export const LIVE_BASE='https://api.bunq.com';
/** Waar de backoffice met bunq praat: een lokale nepserver (tests), de echte bank (alleen als live is toegestaan) of de sandbox. */
export function bunqBase(){return local(process.env.BUNQ_API_BASE)??(bunqLiveAllowed()?LIVE_BASE:SANDBOX_BASE)}
export const bunqMode=()=>bunqLiveAllowed()&&!local(process.env.BUNQ_API_BASE)?'live' as const:'sandbox' as const;
/** Een sandbox-sleutel begint met "sandbox_"; een echte sleutel heeft geen voorvoegsel. Zonder live geldt alleen de sandbox. */
export function validBunqKey(key:string,live=bunqLiveAllowed()){return /^sandbox_[A-Za-z0-9]{20,80}$/.test(key)||(live&&/^[A-Za-z0-9]{40,80}$/.test(key))}
/**
 * Stand van de koppelingen voor Financiën (wens eigenaar 12 november 2026: „bunq staat op niet gekoppeld terwijl het wel werkt”).
 * bunq: een geldige sleutel (betaalverzoek én Bank & verdeling), live of sandbox. SnelStart: beide sleutels ingevuld (alleen lezen).
 * Alleen de stand, nooit een sleutel.
 */
export function connectionState(get:(key:string)=>string|undefined){
 const key=(get('GUEST_BUNQ_API_KEY')||'').trim();
 return {bunq:validBunqKey(key)?(key.startsWith('sandbox_')?'sandbox' as const:bunqMode()):null,snelstart:!!get('GUEST_SNELSTART_SUBSCRIPTION_KEY')&&!!get('GUEST_SNELSTART_CLIENT_KEY')};
}
export const keyFingerprint=(key:string)=>createHash('sha256').update('bunq:'+key).digest('hex').slice(0,32);

// ---- Bedragen
/** Centen → bunq-bedrag ("12.50"). Alleen positieve, hele centen. */
export function bunqAmount(cents:number){if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Ongeldig bedrag.');return (cents/100).toFixed(2)}
/** bunq-bedrag ("12.50" of "-3.00") → centen; NaN bij iets onverwachts. */
export function bunqCents(value:unknown){if(typeof value!=='string'||!/^-?\d{1,9}\.\d{2}$/.test(value))return NaN;const neg=value.startsWith('-'),[e,c]=value.replace('-','').split('.');const n=Number(e)*100+Number(c);return neg?-n:n}

// ---- Sessie
/** Wat bewaard moet blijven tussen verzoeken (versleuteld opgeslagen door de aanroeper). */
export type BunqSession={fingerprint:string;privateKey:string;installationToken:string;deviceRegistered:boolean;sessionToken:string;userId:number;sessionAt:string};
export type SessionStore={load():Promise<BunqSession|null>;save(s:BunqSession):Promise<void>};

function sign(privateKey:string,body:string){return createSign('SHA256').update(body).sign(privateKey,'base64')}
const headers=(token:string|null,body:string,privateKey:string|null)=>({
 'Cache-Control':'no-cache','User-Agent':'BoerBart-Backoffice/1.0','X-Bunq-Language':'nl_NL','X-Bunq-Region':'nl_NL','X-Bunq-Geolocation':'0 0 0 0 000',
 'X-Bunq-Client-Request-Id':randomUUID(),'Content-Type':'application/json',
 ...(token?{'X-Bunq-Client-Authentication':token}:{}),...(privateKey&&body?{'X-Bunq-Client-Signature':sign(privateKey,body)}:{})});

type Item=Record<string,unknown>;
async function raw(method:'GET'|'POST'|'PUT',path:string,o:{token?:string|null;body?:unknown;privateKey?:string|null}={}):Promise<{items:Item[];pagination:Item|null}>{
 const body=o.body===undefined?'':JSON.stringify(o.body);let res:Response;
 try{res=await fetch(bunqBase()+'/v1'+path,{method,headers:headers(o.token??null,body,o.privateKey??null),body:body||undefined,signal:AbortSignal.timeout(20000)})}
 catch{throw new BunqError('bunq is nu niet bereikbaar. Probeer het zo opnieuw.',503)}
 const data=await res.json().catch(()=>null) as {Response?:unknown;Pagination?:unknown;Error?:{error_description_translated?:string;error_description?:string}[]}|null;
 if(!res.ok){
  const detail=data?.Error?.[0]?.error_description_translated||data?.Error?.[0]?.error_description||'';
  const e=new BunqError(res.status===401||res.status===403?'bunq weigert de toegang. Controleer de API-sleutel bij Systeem & koppelingen → bunq.':'bunq kon het verzoek niet verwerken'+(detail?': '+String(detail).slice(0,200):'.'),res.status===429?503:res.status>=500?503:502);
  e.providerStatus=res.status;throw e;
 }
 if(!data||!Array.isArray(data.Response))throw new BunqError('Onverwacht antwoord van bunq.');
 return {items:data.Response.filter((x):x is Item=>!!x&&typeof x==='object'),pagination:data.Pagination&&typeof data.Pagination==='object'?data.Pagination as Item:null};
}
const pick=(items:Item[],key:string)=>items.map(i=>i[key]).find(v=>v&&typeof v==='object') as Item|undefined;

/** Installatie (eenmalig per sleutel), apparaat registreren en een sessie openen. Een bestaande sessie wordt hergebruikt. */
async function openSession(apiKey:string,store:SessionStore,fresh=false):Promise<BunqSession>{
 const fingerprint=keyFingerprint(apiKey);let s=await store.load();
 if(s&&s.fingerprint!==fingerprint)s=null; // andere sleutel: alles opnieuw
 if(s&&!fresh&&s.sessionToken)return s;
 if(!s){
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const inst=await raw('POST','/installation',{body:{client_public_key:publicKey}});
  const token=pick(inst.items,'Token')?.token;if(typeof token!=='string')throw new BunqError('Onverwacht antwoord van bunq bij de installatie.');
  s={fingerprint,privateKey,installationToken:token,deviceRegistered:false,sessionToken:'',userId:0,sessionAt:''};await store.save(s);
 }
 if(!s.deviceRegistered){
  await raw('POST','/device-server',{token:s.installationToken,privateKey:s.privateKey,body:{description:'Boerderijrecreatie backoffice',secret:apiKey}});
  s={...s,deviceRegistered:true};await store.save(s);
 }
 const sess=await raw('POST','/session-server',{token:s.installationToken,privateKey:s.privateKey,body:{secret:apiKey}});
 const token=pick(sess.items,'Token')?.token,user=pick(sess.items,'UserCompany')??pick(sess.items,'UserPerson')??pick(sess.items,'UserApiKey');
 if(typeof token!=='string'||!user||!Number.isSafeInteger(user.id))throw new BunqError('Onverwacht antwoord van bunq bij het aanmelden.');
 s={...s,sessionToken:token,userId:user.id as number,sessionAt:new Date().toISOString()};await store.save(s);return s;
}

export type BunqClient={mode:'sandbox'|'live';userId:number;call:(method:'GET'|'POST'|'PUT',path:string,body?:unknown)=>Promise<{items:Item[];pagination:Item|null}>};
/** Een verbonden client. Een verlopen sessie wordt één keer automatisch vernieuwd. */
export async function bunqClient(apiKey:string,store:SessionStore):Promise<BunqClient>{
 if(!validBunqKey(apiKey))throw new BunqError(apiKey.startsWith('sandbox_')||!apiKey?'De bunq-koppeling staat nog niet aan. Plak een sandbox-sleutel bij Systeem & koppelingen → bunq.':'Een echte bunq-sleutel werkt pas als live bij publiceren wordt aangezet. Gebruik nu een sandbox-sleutel (sandbox_…).',503);
 let s=await openSession(apiKey,store);
 const call=async(method:'GET'|'POST'|'PUT',path:string,body?:unknown)=>{
  const go=()=>raw(method,path.replace('{user}',String(s.userId)),{token:s.sessionToken,privateKey:s.privateKey,body});
  try{return await go()}catch(e){if(e instanceof BunqError&&e.providerStatus===401){s=await openSession(apiKey,store,true);return go()}throw e}
 };
 return {mode:bunqMode(),userId:s.userId,call};
}

// ---- Rekeningen
export type BunqAccount={id:number;description:string;iban:string;name:string;balanceCents:number;status:string};
export const normalizeIban=(v:unknown)=>typeof v==='string'?v.toUpperCase().replace(/[\s.-]/g,''):'';
export function readAccount(item:Item):BunqAccount|null{
 const key=Object.keys(item).find(k=>k.startsWith('MonetaryAccount'));if(!key)return null;
 const a=item[key] as Item;if(!a||!Number.isSafeInteger(a.id))return null;
 const alias=Array.isArray(a.alias)?(a.alias as Item[]).find(x=>x.type==='IBAN'):undefined;
 const balance=a.balance as Item|undefined;
 return {id:a.id as number,description:String(a.description||''),iban:normalizeIban(alias?.value),name:String(alias?.name||''),
  balanceCents:balance&&balance.currency==='EUR'?bunqCents(balance.value):NaN,status:String(a.status||'')};
}
/** Alle actieve eigen rekeningen (hoofdrekening en subrekeningen) met IBAN. */
export async function listAccounts(c:BunqClient){
 const r=await c.call('GET','/user/{user}/monetary-account?count=200');
 return r.items.map(readAccount).filter((a):a is BunqAccount=>!!a&&a.status==='ACTIVE'&&!!a.iban);
}

// ---- Betalingen lezen
export type BunqPayment={id:number;created:string;amountCents:number;description:string;counterpartyName:string;counterpartyIban:string};
export function readPayment(item:Item):BunqPayment|null{
 const p=item.Payment as Item|undefined;if(!p||!Number.isSafeInteger(p.id))return null;
 const amount=p.amount as Item|undefined,cp=(p.counterparty_alias||{}) as Item;
 if(!amount||amount.currency!=='EUR')return null;const cents=bunqCents(amount.value);if(!Number.isFinite(cents))return null;
 // bunq geeft "2026-11-02 10:00:00.123456" in UTC.
 const created=typeof p.created==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(p.created)?p.created.slice(0,19).replace(' ','T')+'Z':'';
 if(!created)return null;
 return {id:p.id as number,created,amountCents:cents,description:String(p.description||'').slice(0,300),counterpartyName:String(cp.display_name||cp.name||'').slice(0,120),counterpartyIban:normalizeIban(cp.iban)};
}
/** Betalingen op een rekening vanaf `since` (ISO), nieuwste eerst; maximaal `max` stuks (bladert terug met older_id). */
export async function paymentsSince(c:BunqClient,accountId:number,since:string,max=1000){
 const out:BunqPayment[]=[];let path=`/user/{user}/monetary-account/${accountId}/payment?count=200`;
 while(out.length<max){
  const r=await c.call('GET',path);const page=r.items.map(readPayment).filter((p):p is BunqPayment=>!!p);
  out.push(...page.filter(p=>p.created>=since));
  const older=typeof r.pagination?.older_url==='string'?r.pagination.older_url:'';
  if(!page.length||page[page.length-1].created<since||!older)break;
  const m=/older_id=(\d+)/.exec(older);if(!m)break;path=`/user/{user}/monetary-account/${accountId}/payment?count=200&older_id=${m[1]}`;
 }
 return out;
}

// ---- Geld verplaatsen
const description=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9/\-?:().,'+ ]/g,' ').replace(/\s+/g,' ').trim().slice(0,140);
/** Conceptbetaling naar EIGEN rekeningen (de maandagverdeling): één concept met een regel per bestemming. Elk doel moet bij bunq als
 *  eigen, actieve rekening bekendstaan, en anders dan de rekening waar het van af gaat. Pas na bevestigen in de bunq-app gebeurt er iets. */
export async function ownDraft(c:BunqClient,o:{fromId:number;entries:{toIban:string;amountCents:number;description:string}[]}){
 if(!o.entries.length)throw new BunqError('Er is niets klaar te zetten.',409);
 const accounts=await listAccounts(c),from=accounts.find(a=>a.id===o.fromId);
 if(!from)throw new BunqError('De rekening waarvan geld af moet, is niet (meer) gevonden bij bunq.',409);
 const entries=o.entries.map(e=>{const to=accounts.find(a=>a.iban===normalizeIban(e.toIban));
  if(!to)throw new BunqError('Een doel is geen eigen bunq-rekening. Naar buiten gaat alleen een uitbetaling aan een lid.',409);
  if(to.id===from.id)throw new BunqError('Van en naar zijn dezelfde rekening.',409);
  return {amount:{value:bunqAmount(e.amountCents),currency:'EUR'},counterparty_alias:{type:'IBAN',value:to.iban,name:to.name||to.description||'Boerderijrecreatie'},description:description(e.description)}});
 const r=await c.call('POST',`/user/{user}/monetary-account/${from.id}/draft-payment`,{number_of_required_accepts:1,entries});
 const id=pick(r.items,'Id')?.id;if(!Number.isSafeInteger(id))throw new BunqError('Onverwacht antwoord van bunq bij de conceptbetaling.');
 return id as number;
}
/** Conceptbetaling: bunq voert hem pas uit als de eigenaar hem in de bunq-app bevestigt. */
export async function draftPayment(c:BunqClient,o:{fromId:number;toIban:string;toName:string;amountCents:number;description:string}){
 const r=await c.call('POST',`/user/{user}/monetary-account/${o.fromId}/draft-payment`,{number_of_required_accepts:1,entries:[{
  amount:{value:bunqAmount(o.amountCents),currency:'EUR'},counterparty_alias:{type:'IBAN',value:normalizeIban(o.toIban),name:description(o.toName).slice(0,70)||'Lid'},description:description(o.description)}]});
 const id=pick(r.items,'Id')?.id;if(!Number.isSafeInteger(id))throw new BunqError('Onverwacht antwoord van bunq bij de conceptbetaling.');
 return id as number;
}
export type DraftStatus='PENDING'|'ACCEPTED'|'REJECTED'|'CANCELLED';
const draftStatusOf=(v:unknown):DraftStatus=>{if(v==='PENDING'||v==='ACCEPTED'||v==='REJECTED'||v==='CANCELLED')return v;throw new BunqError('Onverwachte status van een conceptbetaling bij bunq.')};
/** De betaling die bunq na bevestigen uit een concept maakt (veld object), als die er al is. */
function draftPaymentId(d:Item){const o=d.object as Item|undefined,p=(o?.Payment??o?.PaymentBatch) as Item|undefined;return p&&Number.isSafeInteger(p.id)?p.id as number:null}
/** Stand van een conceptbetaling, met het id van de echte betaling als bunq die al heeft gemaakt. */
export async function draftStatus(c:BunqClient,fromId:number,draftId:number):Promise<{status:DraftStatus;paymentId:number|null}>{
 const r=await c.call('GET',`/user/{user}/monetary-account/${fromId}/draft-payment/${draftId}`);
 const d=pick(r.items,'DraftPayment');if(!d)throw new BunqError('Onverwacht antwoord van bunq bij een conceptbetaling.');
 return {status:draftStatusOf(d.status),paymentId:draftPaymentId(d)};
}
/** Zoekt een concept terug aan een kenmerk in de omschrijving (na een verloren antwoord van bunq). */
export async function findDraft(c:BunqClient,fromId:number,ref:string):Promise<number|null>{
 const r=await c.call('GET',`/user/{user}/monetary-account/${fromId}/draft-payment?count=200`);
 for(const it of r.items){const d=it.DraftPayment as Item|undefined;if(!d||!Number.isSafeInteger(d.id))continue;
  const entries=Array.isArray(d.entries)?d.entries as Item[]:[];if(entries.some(e=>typeof e.description==='string'&&e.description.includes(ref)))return d.id as number}
 return null;
}
/** Eén betaling op een rekening, om te controleren dat het geld echt is afgeschreven. */
export async function paymentById(c:BunqClient,accountId:number,id:number){
 const r=await c.call('GET',`/user/{user}/monetary-account/${accountId}/payment/${id}`);
 return r.items.map(readPayment).find((p):p is BunqPayment=>!!p)??null;
}
/** Een weigering waarvan zeker is dat bunq niets heeft aangemaakt (4xx, behalve 408 en 429). */
export const definiteRefusal=(e:unknown)=>e instanceof BunqError&&!!e.providerStatus&&e.providerStatus>=400&&e.providerStatus<500&&e.providerStatus!==408&&e.providerStatus!==429;

// ---- Betaalverzoek (bunq.me) voor gasten (wens eigenaar 10 november 2026: „kan het ook via een betaalverzoekstructuur?”)
// Per bestelling één betaalverzoek op de rekening Main, met precies het bedrag en het bestelnummer. De gast betaalt via de link
// (iDEAL in de eigen bank-app); daarna haalt de backoffice de stand zelf op. Betaald geldt alleen als bunq een betaling van precies
// dat bedrag bij dit verzoek laat zien, of (als achtervang) als er op Main een bijschrijving staat met precies deze omschrijving
// en dit bedrag. Niets op het woord van de gast.
export type BunqMeTab={id:number;status:string;shareUrl:string|null;description:string;amountCents:number;paid:{paymentId:number;amountCents:number}[]};
export const bunqMeDescription=(v:string)=>description(v);
export async function createBunqMeTab(c:BunqClient,accountId:number,o:{amountCents:number;description:string;redirectUrl:string}){
 const r=await c.call('POST',`/user/{user}/monetary-account/${accountId}/bunqme-tab`,{bunqme_tab_entry:{amount_inquired:{value:bunqAmount(o.amountCents),currency:'EUR'},description:description(o.description),redirect_url:o.redirectUrl}});
 const id=pick(r.items,'Id')?.id;if(!Number.isSafeInteger(id))throw new BunqError('Onverwacht antwoord van bunq bij het betaalverzoek.');
 return id as number;
}
export function readBunqMeTab(item:Item):BunqMeTab|null{
 const t=item.BunqMeTab as Item|undefined;if(!t||!Number.isSafeInteger(t.id))return null;
 const entry=(t.bunqme_tab_entry||{}) as Item,amount=(entry.amount_inquired||{}) as Item;
 const paid:{paymentId:number;amountCents:number}[]=[];
 for(const r of Array.isArray(t.result_inquiries)?t.result_inquiries as Item[]:[]){
  const pay=((r.payment as Item|undefined)?.Payment??r.payment) as Item|undefined,a=(pay?.amount||{}) as Item;
  if(pay&&Number.isSafeInteger(pay.id)&&a.currency==='EUR'){const cents=Math.abs(bunqCents(a.value));if(Number.isFinite(cents))paid.push({paymentId:pay.id as number,amountCents:cents})}
 }
 return {id:t.id as number,status:String(t.status||''),shareUrl:typeof t.bunqme_tab_share_url==='string'&&/^https:\/\//.test(t.bunqme_tab_share_url)?t.bunqme_tab_share_url:null,
  description:String(entry.description||''),amountCents:amount.currency==='EUR'?bunqCents(amount.value):NaN,paid};
}
export async function getBunqMeTab(c:BunqClient,accountId:number,id:number){
 const r=await c.call('GET',`/user/{user}/monetary-account/${accountId}/bunqme-tab/${id}`);
 const t=r.items.map(readBunqMeTab).find((x):x is BunqMeTab=>!!x);if(!t)throw new BunqError('Onverwacht antwoord van bunq bij het betaalverzoek.');return t;
}
/** Sluiten zodat er niet nog eens op betaald kan worden (na betaald, of een dubbel aangemaakt verzoek). Fouten zijn niet erg. */
export async function cancelBunqMeTab(c:BunqClient,accountId:number,id:number){
 await c.call('PUT',`/user/{user}/monetary-account/${accountId}/bunqme-tab/${id}`,{status:'CANCELLED'}).catch(()=>{});
}
