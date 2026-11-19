// Guest orders from the website (POST /api/public/orders). No login: the rules below are the protection.
// - Only the configured website origins may send (browser CORS + Origin check).
// - Strict shape and limits; prices, VAT and choices are always recalculated on the server (buildLine).
// - Each request ID is processed once; a repeated request returns the same order.
// - A small in-memory rate limit per client and in total.
// - Online orders wait for payment: status 'wacht-op-betaling'. They are not sent to the work stations
//   until a payment is confirmed (step 2: Mollie, lib/online-payments.ts). Nothing is paid here.
import type {RequestedLine,SaleLine} from './orders';

export const GUEST_ORDER_STATUS='wacht-op-betaling';
// ---- Gezamenlijke rekening (wens eigenaar 5 november 2026; verder in lib/group-bill-core.ts). Hier, zonder imports.
export const MIN_LIMIT_CENTS=1000,MAX_LIMIT_CENTS=500000;
export type GuestContact={name:string;email:string;phone:string};
/** Klantenkaart (wens eigenaar 8 november 2026): alleen als de gast „Onthoud mij als klant van Boer Bart” aanvinkt. Telefoon mag leeg. */
export type CustomerConsent={name:string;email:string;phone:string;consent:true};

const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
/** Naam, e-mail en telefoon van wie op een rekening bestelt. Gooit een Nederlandse melding voor de website. */
export function parseGuestContact(v:unknown):GuestContact{
 const g=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;
 const name=clean(g.name,80),email=clean(g.email,200).toLowerCase(),phone=clean(g.phone,30);
 if(name.length<2)throw Error('Vul je naam in.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))throw Error('Vul een geldig e-mailadres in.');
 if(phone.replace(/\D/g,'').length<9)throw Error('Vul een geldig telefoonnummer in.');
 return {name,email,phone};
}
export function parseCustomerConsent(v:unknown):CustomerConsent|null{
 if(v==null)return null;const g=(typeof v==='object'?v:{}) as Record<string,unknown>;if(g.toestemming!==true)return null;
 const name=clean(g.name,80),email=clean(g.email,200).toLowerCase(),phone=clean(g.phone,30);
 if(name.length<2)throw Error('Vul je naam in, of zet „Onthoud mij” uit.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))throw Error('Vul een geldig e-mailadres in, of zet „Onthoud mij” uit.');
 return {name,email,phone,consent:true};
}
/** Een nieuwe rekening: naam van de rekening en het zelfgekozen maximum. */
/** Eigen rekening (wens eigenaar 11 november 2026): vangnet tegen een rekening die niemand betaalt; de gast kiest zelf een grens
 *  voor een waarschuwing (warnCents), die blokkeert niets. */
export const EIGEN_MAX_CENTS=50000;
export type OpenBillRequest={name:string;limitCents:number;kind:'groep'|'eigen';warnCents:number|null};
export function parseOpenBill(v:unknown):OpenBillRequest{
 const b=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;
 if(b.kind==='eigen'){
  const name=clean(b.name,60)||'Eigen rekening',w=b.warnCents;
  if(w!=null&&(!Number.isSafeInteger(w)||(w as number)<100||(w as number)>EIGEN_MAX_CENTS))throw Error('Kies een grens tussen € 1,00 en € 500,00, of laat hem leeg.');
  return {name,limitCents:EIGEN_MAX_CENTS,kind:'eigen',warnCents:w==null?null:w as number};
 }
 const name=clean(b.name,60);if(name.length<2)throw Error('Geef de rekening een naam, bijvoorbeeld „Familie Jansen”.');
 const limitCents=b.limitCents;
 if(!Number.isSafeInteger(limitCents)||(limitCents as number)<MIN_LIMIT_CENTS)throw Error('Kies een maximum vanaf € 10,00.');
 if((limitCents as number)>MAX_LIMIT_CENTS)throw Error('Kies een maximum tot € 5.000,00. Voor meer: vraag het aan een van ons.');
 return {name,limitCents:limitCents as number,kind:'groep',warnCents:null};
}

export const MAX_BODY_BYTES=16_000;
export const MAX_LINES=30;
export const MAX_QUANTITY=20;
export const MAX_NOTE=200;
export type GuestRoute='eten-drinken'|'winkel';
// chosenCents: the guest's own amount ("Wat is het je waard?"), null = the normal price. groupCode: order on the
// host's group bill (see lib/order-options.ts); then the guest pays nothing and chosenCents must be null.
// Afhaalmoment (winkel, vooraf bestellen; regels voor de momenten in pickup-core.ts).
export type PickupChoice={date:string;time:string;name:string};
/** Controle van wat de gast stuurde. Gooit een Nederlandse melding voor de website. */
export function parsePickup(raw:unknown):PickupChoice|null{
 if(raw===undefined||raw===null)return null;
 if(typeof raw!=='object'||Array.isArray(raw))throw Error('Kies een afhaalmoment.');
 const r=raw as Record<string,unknown>;
 if(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||typeof r.time!=='string'||!/^\d{2}:\d{2}$/.test(r.time))throw Error('Kies een afhaalmoment.');
 const name=typeof r.name==='string'?r.name.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim():'';
 if(name.length<2||name.length>80)throw Error('Vul je naam in, dan weten we voor wie de bestelling is.');
 return {date:r.date,time:r.time,name};
}

// pickup: winkel vooraf bestellen met afhaalmoment en naam (3 november 2026); null = nu in de winkel.
// guest: naam, e-mail en telefoon (verplicht op een gezamenlijke rekening). openBill: de gast opent zelf een rekening
// (wens eigenaar 5 november 2026); token = de geheime beheerlink van de rekeninghouder, gemaakt door de website.
// dividend: betalen met het dividend van vorig jaar (wens eigenaar 5 november 2026); token = de telefoonkoppeling van het lid.
export type GuestOrderRequest={saldoEerst?:'rente'|'bb';requestId:string;route:GuestRoute;lines:RequestedLine[];chosenCents:number|null;groupCode:string|null;pickup:PickupChoice|null;guest?:GuestContact|null;klant?:CustomerConsent|null;openBill?:(OpenBillRequest&{token:string})|null;dividend?:string|null};
export const GROUP_ORDER_STATUS='op-groepsrekening';

// Website origins allowed to send guest orders. PUBLIC_ORDER_ORIGINS (comma separated) overrides the local default.
// 3004: proef met het websiteontwerp van StudioFab (apps/website-fab, wens eigenaar 4 november 2026).
const LOCAL_DEFAULT=['http://localhost:3002','http://127.0.0.1:3002','http://localhost:3003','http://127.0.0.1:3003','http://localhost:3004','http://127.0.0.1:3004'];
export function allowedOrigins(value=process.env.PUBLIC_ORDER_ORIGINS):string[]{
 if(!value?.trim())return LOCAL_DEFAULT;
 return value.split(',').map(v=>v.trim()).filter(Boolean).flatMap(v=>{try{const u=new URL(v);return (u.protocol==='https:'||u.protocol==='http:')&&u.origin===v.replace(/\/$/,'')?[u.origin]:[]}catch{return []}});
}
export function originAllowed(origin:string|null,list=allowedOrigins()){return !!origin&&list.includes(origin)}
export function corsHeaders(origin:string|null,list=allowedOrigins()):Record<string,string>{
 const base:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
 if(!originAllowed(origin,list))return base;
 return {...base,'Access-Control-Allow-Origin':origin!,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'};
}

const billToken=(v:unknown)=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{32,64}$/.test(v))throw Error('Ongeldige rekening.');return v};
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const shortId=(v:unknown,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max;
// Validates the guest's request. Throws a guest-friendly Dutch message on anything unexpected.
export function parseGuestOrder(body:unknown):GuestOrderRequest{
 if(!isRecord(body))throw Error('Ongeldige bestelling.');
 const {requestId,route,lines}=body;
 const chosenCents=body.chosenCents??null,groupCode=body.groupCode??null;
 if(chosenCents!==null&&(!Number.isSafeInteger(chosenCents)||(chosenCents as number)<0))throw Error('Kies een bedrag vanaf € 0,00.');
 if(groupCode!==null&&(typeof groupCode!=='string'||groupCode.length>20))throw Error('Ongeldige groepscode.');
 if(groupCode!==null&&chosenCents!==null)throw Error('Op een groepsrekening betaal je zelf niets; een eigen bedrag is dan niet nodig.');
 if(typeof requestId!=='string'||!GUEST_REQUEST_ID.test(requestId))throw Error('Ongeldige bestelling.');
 if(route!=='eten-drinken'&&route!=='winkel')throw Error('Ongeldige bestelling.');
 if(!Array.isArray(lines)||lines.length<1)throw Error('Je mandje is leeg.');
 if(lines.length>MAX_LINES)throw Error('Kies maximaal '+MAX_LINES+' verschillende regels.');
 const pickup=parsePickup(body.pickup);
 const openBill=body.openBill==null?null:{...parseOpenBill(body.openBill),token:billToken((body.openBill as Record<string,unknown>).token)};
 if(openBill&&(groupCode!==null||chosenCents!==null))throw Error('Ongeldige bestelling.');
 const dividend=body.dividend==null?null:typeof body.dividend==='string'&&/^[A-Za-z0-9_-]{43}$/.test(body.dividend)?body.dividend:(()=>{throw Error('Deze telefoon is niet goed gekoppeld. Open je ledenlink opnieuw.')})();
 if(dividend&&(groupCode!==null||openBill||chosenCents!==null))throw Error('Ongeldige bestelling.');
 // Welk saldo eerst (wens eigenaar 8 november 2026): het rentesaldo (euro's) of het BB-saldo. Standaard eerst het rentesaldo.
 const saldoEerst=body.saldoEerst===undefined||body.saldoEerst===null||body.saldoEerst==='rente'?'rente' as const:body.saldoEerst==='bb'?'bb' as const:(()=>{throw Error('Ongeldige bestelling.')})();
 // Op een gezamenlijke rekening laat iedereen naam, e-mail en telefoonnummer achter (voor de factuur).
 const guest=groupCode!==null||openBill?parseGuestContact(body.guest):null,klant=parseCustomerConsent(body.klant);
 if(pickup&&route!=='winkel')throw Error('Afhalen kan alleen bij winkelbestellingen.');
 return {requestId,route:route as GuestRoute,chosenCents:chosenCents as number|null,groupCode:groupCode as string|null,pickup,guest,...(klant?{klant}:{}),openBill,dividend,...(dividend&&saldoEerst==='bb'?{saldoEerst}:{}),lines:lines.map(l=>{
  if(!isRecord(l)||!shortId(l.productId)||!Number.isInteger(l.version)||Number(l.version)<0)throw Error('Ongeldige productregel.');
  if(!Number.isInteger(l.quantity)||Number(l.quantity)<1||Number(l.quantity)>MAX_QUANTITY)throw Error('Kies per product een aantal van 1 tot en met '+MAX_QUANTITY+'.');
  const note=l.note??'';if(typeof note!=='string'||note.length>MAX_NOTE)throw Error('Een opmerking mag maximaal '+MAX_NOTE+' tekens zijn.');
  const selections=l.selections??{};if(!isRecord(selections)||Object.keys(selections).length>20||Object.entries(selections).some(([k,v])=>!shortId(k)||!shortId(v)))throw Error('Ongeldige keuze.');
  // Etiketprijs (klant voert prijs in, wens eigenaar 5 november 2026): alleen nu in de winkel (zelfservicekassa), niet bij
  // vooraf bestellen of eten en drinken. Of het product dit toestaat, controleert buildLine met de productgegevens.
  // Elders wordt een meegestuurde prijs genegeerd (de prijs komt dan altijd van de server).
  const price=route==='winkel'&&!pickup?l.priceCents??null:null;
  if(price!==null&&(!Number.isSafeInteger(price)||(price as number)<1))throw Error('Vul bij het etiketproduct een geldig bedrag in.');
  return {productId:l.productId as string,version:Number(l.version),quantity:Number(l.quantity),selections:selections as Record<string,string>,note:note.replace(/[\u0000-\u001f\u007f]/g,' ').trim(),...(price!==null?{priceCents:price as number}:{})};
 })};
}

// Eten & drinken goes to the kitchen or the coffee bar; shop products have their own basket.
export function checkRoute(route:GuestRoute,lines:SaleLine[]){
 for(const l of lines){
  const ok=route==='winkel'?l.station==='winkel':l.station==='kok'||l.station==='barista';
  if(!ok)throw Error(l.name+' hoort in '+(route==='winkel'?'het mandje voor eten en drinken':'het winkelmandje')+'.');
 }
}
export const routeMode=(route:GuestRoute)=>route==='winkel'?'winkel':'zelfservice';

export const orderNumber=(id:number)=>'P'+String(id).padStart(5,'0');
// After paying, Mollie sends the guest back to the order page they came from (only a page called bestellen).
// Ook /bestellen/ (de bestelapp in de vormgeving van de nieuwe website, 5 november 2026).
// Ook de zelfscan (wens eigenaar 13 november 2026): na het betalen terug in de zelfscan-app, niet op de bestelpagina.
export const returnPage=(v:unknown)=>typeof v==='string'&&(/^\/(?:[a-z0-9-]+\/)*(?:bestellen|zelfscan)(?:\.html|\/)?$/.test(v)||v==='/abonnementen.html')?v:'/bestellen.html';
export const GUEST_REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// What the guest gets back: no work stations, internal IDs or other internal data.
export function guestReceipt(o:{id:number;created:string;data:string;status?:string;paymentStatus?:string;test?:number}){
 const d=JSON.parse(o.data) as {lines:SaleLine[];totalCents:number;vat9Cents?:number;vat21Cents?:number;mode:string;chosenCents?:number|null;group?:{name:string;code?:string;own?:boolean}|null;pickup?:PickupChoice|null};
 // code alleen terug als deze gast de rekening zelf opende (own): hij deelt hem met wie mee mag bestellen.
 const group=d.group?{name:d.group.name,...(d.group.own&&d.group.code?{code:d.group.code}:{})}:null;
 return {number:orderNumber(o.id),created:o.created,status:o.status??GUEST_ORDER_STATUS,paid:!group&&o.paymentStatus==='betaald',test:o.test!==0,totalCents:d.totalCents,
  // Normal value and, if the guest chose one, the own amount to pay. On a group bill the guest pays nothing.
  commercialCents:d.totalCents,chosenCents:group?null:(d.chosenCents??null),toPayCents:group?0:(d.chosenCents??d.totalCents),group,pickup:d.pickup??null,
  // Winkelbestelling (zelfscan): geen „Stuur mij een bericht als het klaar staat” (wens eigenaar 13 november 2026).
  winkel:d.mode==='winkel',
  lines:d.lines.map(l=>({name:l.name,quantity:l.quantity,choices:l.choices,note:l.note,totalCents:l.totalCents,vat:l.vat}))};
}

// Fixed-window rate limit kept in memory (resets on restart; enough for one location). Per client and in total.
export function createRateLimit({perClient=6,total=120,windowMs=60_000}={}){
 let start=0,all=0;const seen=new Map<string,number>();
 return (client:string,now=Date.now())=>{
  if(now-start>=windowMs){start=now;all=0;seen.clear();}
  const n=(seen.get(client)||0)+1;
  if(n>perClient||all+1>total)return false;
  seen.set(client,n);all++;return true;
 };
}
// Adres van de bezoeker voor de rem (#137). Alleen wat de eigen proxy toevoegt telt: de bezoeker kan zelf
// X-Forwarded-For, CF-Connecting-IP en X-Real-IP meesturen. Online (Cloud Run) voegt Google het echte adres achteraan
// X-Forwarded-For toe; met een load balancer ervoor is dat één plek eerder (TRUSTED_PROXY_HOPS=2). Lokaal via de
// Cloudflare-tunnel (telefoonstand) geldt CF-Connecting-IP; daar is geen Cloud Run.
export function clientKey(h:{get(name:string):string|null},env:Record<string,string|undefined>=process.env){
 const forwarded=(h.get('x-forwarded-for')||'').split(',').map(x=>x.trim()).filter(Boolean);
 const online=Boolean(env.K_SERVICE)||Boolean(env.TRUSTED_PROXY_HOPS);
 if(online){const hops=Math.max(1,Math.min(5,Math.floor(Number(env.TRUSTED_PROXY_HOPS)||1)));return (forwarded[forwarded.length-hops]||forwarded[0]||'onbekend').slice(0,64)}
 return (h.get('cf-connecting-ip')||forwarded[0]||h.get('x-real-ip')||'onbekend').trim().slice(0,64);
}
// Address of the guest order page, for group-code links: the phone address in telefoonstand, else the first website origin.
/** Zelfscan op de eigen telefoon (wens eigenaar 12 november 2026): eigen pagina en eigen app op de website, alleen de winkel. */
export function zelfscanUrl(env:Record<string,string|undefined>=process.env){return new URL('/zelfscan.html',orderPageUrl(env)).toString()}
export function orderPageUrl(env:Record<string,string|undefined>=process.env){
 const tunnel=env.BACKOFFICE_TUNNEL_ORIGIN?.trim().replace(/\/$/,'');
 if(tunnel&&/^https:\/\//.test(tunnel))return tunnel+'/bestellen';
 return allowedOrigins(env.PUBLIC_ORDER_ORIGINS)[0]+'/bestellen.html';
}
