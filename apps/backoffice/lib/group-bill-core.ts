// Gezamenlijke rekening (wens eigenaar 5 november 2026). Pure regels, zonder database of netwerk, zodat alles testbaar is.
// - Een gast opent zelf een rekening als rekeninghouder, met een zelfgekozen maximum. Alleen wie de code heeft, bestelt erop.
// - Iedereen die op een rekening bestelt, laat naam, e-mail en telefoonnummer achter (voor de factuur: wie wat bestelde).
// - Maximum bereikt: niets meer erbij tot de rekeninghouder het maximum verhoogt. Vanaf 80% een waarschuwing op de werkplek.
// - Afrekenen: in één keer of gesplitst in gelijke delen (de laatste centen gaan naar de eerste delen). Elk deel met iDEAL,
//   contant of pin. Zodra het afrekenen begint, gaat de rekening dicht voor nieuwe bestellingen.
// - Altijd een factuur, met „Voldaan” zodra alles betaald is.
import {allocate,MAX_ORDER_CENTS} from './order-options';
import type {SaleLine} from './orders';
import {parseGuestContact,parseOpenBill,MIN_LIMIT_CENTS,MAX_LIMIT_CENTS,type GuestContact} from './public-orders';
export {parseGuestContact,parseOpenBill,MIN_LIMIT_CENTS,MAX_LIMIT_CENTS,type GuestContact};

export const NEAR_PERCENT=80;
export const MAX_SHARES=20;
export function checkNewLimit(limitCents:unknown,spentCents:number){
 if(!Number.isSafeInteger(limitCents)||(limitCents as number)>MAX_LIMIT_CENTS||(limitCents as number)>MAX_ORDER_CENTS)throw Error('Kies een maximum tot '+euro(MAX_LIMIT_CENTS)+'.');
 if((limitCents as number)<Math.max(MIN_LIMIT_CENTS,spentCents))throw Error('Het maximum kan niet lager dan wat er al op de rekening staat ('+euro(spentCents)+').');
 return limitCents as number;
}

/** Hoe vol de rekening is: voor de balk op de werkplek en bij de rekeninghouder. */
export function fillState(spentCents:number,limitCents:number){
 const percent=limitCents>0?Math.min(100,Math.round(spentCents/limitCents*100)):0;
 return {spentCents,limitCents,percent,near:percent>=NEAR_PERCENT,full:spentCents>=limitCents,leftCents:Math.max(0,limitCents-spentCents)};
}
/** Waarom een bestelling niet meer op de rekening past (maximum), of null. */
export function limitProblem(spentCents:number,orderCents:number,limitCents:number,holder:string){
 if(spentCents+orderCents<=limitCents)return null;
 const left=Math.max(0,limitCents-spentCents);
 return left>0?`Dit past niet meer op de rekening: er kan nog ${euro(left)} bij. Vraag ${holder||'de rekeninghouder'} om het maximum te verhogen.`
  :`De rekening is vol. Vraag ${holder||'de rekeninghouder'} om het maximum te verhogen.`;
}

/** Gelijke delen in hele centen die precies optellen tot het totaal. */
export function splitAmounts(totalCents:number,count:number){
 if(!Number.isSafeInteger(count)||count<1||count>MAX_SHARES)throw Error('Kies door hoeveel personen je wilt delen: 1 tot en met '+MAX_SHARES+'.');
 if(!Number.isSafeInteger(totalCents)||totalCents<=0)throw Error('Er staat niets op de rekening om te betalen.');
 if(count>totalCents)throw Error('Het bedrag is te klein om zo vaak te delen.');
 return allocate(Array(count).fill(1),totalCents);
}

// ---- Factuur
export const invoiceLabel=(n:number|null)=>n?'BB-'+String(n).padStart(5,'0'):'(nog geen nummer)';
type OrderIn={id:number;created:string;totalCents:number;vat9Cents:number;vat21Cents:number;data:string};
// paidCents: wat er echt betaald is voor dit deel (meebetalen met „Jou wat goed fielt”); null = het gedeelde bedrag.
type ShareIn={position:number;count:number;amountCents:number;status:string;method:string;paidAt:string;paidCents?:number|null};
export const sharePaid=(s:ShareIn)=>s.paidCents??s.amountCents;
export type Seller={name:string;street:string;postalCode:string;city:string;email:string;phone:string;kvk:string;vatNumber:string;website?:string};
export const METHOD_LABEL:Record<string,string>={online:'iDEAL (Mollie)',bunq:'Betaalverzoek (bunq)',contant:'Contant',pin:'Pin',dividend:'Dividend',bb:'BB-tegoed',nul:'Niets (zelf gekozen)'};
/** Alles wat op de factuur staat. Per persoon wat er besteld is; btw per tarief; betalingen; „Voldaan” als alles betaald is. */
export function invoiceData(g:{name:string;code:string;holderName:string;holderEmail:string;holderPhone:string;invoiceNumber:number|null;created:string;paidAt:string;status:string},orders:OrderIn[],shares:ShareIn[],seller:Seller){
 const people=new Map<string,{name:string;email:string;phone:string;lines:{order:string;created:string;name:string;quantity:number;vat:string;totalCents:number}[];totalCents:number}>();
 for(const o of orders){
  const d=JSON.parse(o.data) as {lines:SaleLine[];guest?:GuestContact};
  const who=d.guest??{name:g.holderName||'Onbekend',email:g.holderEmail,phone:g.holderPhone};
  const key=(who.email||who.name).toLowerCase(),p=people.get(key)??{...who,lines:[],totalCents:0};
  for(const l of d.lines){p.lines.push({order:'P'+String(o.id).padStart(5,'0'),created:o.created,name:l.name+(l.choices?.length?' ('+l.choices.join(', ')+')':''),quantity:l.quantity,vat:l.vat,totalCents:l.totalCents});p.totalCents+=l.totalCents}
  people.set(key,p);
 }
 const totalCents=orders.reduce((s,o)=>s+o.totalCents,0),vat9=orders.reduce((s,o)=>s+o.vat9Cents,0),vat21=orders.reduce((s,o)=>s+o.vat21Cents,0);
 const gross=(rate:string)=>[...people.values()].flatMap(p=>p.lines).filter(l=>l.vat===rate).reduce((s,l)=>s+l.totalCents,0);
 // Betalingen per betaalwijze opgeteld, zonder namen: niemand ziet op de factuur wie hoeveel gaf.
 const byMethod=new Map<string,{label:string;method:string;amountCents:number;paidAt:string}>();
 for(const x of shares.filter(s=>s.status==='betaald'&&sharePaid(s)>0)){const m=METHOD_LABEL[x.method]||x.method,p=byMethod.get(m)??{label:'Betaald',method:m,amountCents:0,paidAt:x.paidAt};p.amountCents+=sharePaid(x);if(x.paidAt>p.paidAt)p.paidAt=x.paidAt;byMethod.set(m,p)}
 const payments=[...byMethod.values()].sort((a,b)=>a.paidAt.localeCompare(b.paidAt));
 const paidCents=payments.reduce((s,p)=>s+p.amountCents,0);
 // Voldaan: alle delen afgerekend (ook als iemand minder of meer koos), of zonder delen alles betaald.
 const allShares=shares.length>0&&shares.every(s=>s.status==='betaald');
 const openShares=shares.filter(s=>s.status==='open').reduce((t,s)=>t+s.amountCents,0);
 // Overzicht (wens eigenaar 5 november 2026): wat er in totaal besteld is en wie er besteld hebben, zonder wie wat nam.
 // Zo voorkomt de factuur scheve gezichten; de uitsplitsing per persoon (people) is er alleen op verzoek.
 const products=new Map<string,{name:string;quantity:number;vat:string;totalCents:number}>();
 for(const l of [...people.values()].flatMap(p=>p.lines)){const k=l.name+'|'+l.vat,x=products.get(k)??{name:l.name,vat:l.vat,quantity:0,totalCents:0};x.quantity+=l.quantity;x.totalCents+=l.totalCents;products.set(k,x)}
 return {number:invoiceLabel(g.invoiceNumber),date:(g.paidAt||g.created).slice(0,10),bill:g.name,code:g.code,
  holder:{name:g.holderName,email:g.holderEmail,phone:g.holderPhone},seller,
  products:[...products.values()].sort((a,b)=>b.totalCents-a.totalCents||a.name.localeCompare(b.name,'nl')),orderedBy:[...people.values()].map(p=>p.name),
  people:[...people.values()],totalCents,vat:[{rate:'9',vatCents:vat9,exclCents:gross('9')-vat9},{rate:'21',vatCents:vat21,exclCents:gross('21')-vat21}].filter(v=>v.vatCents>0),
  exclCents:totalCents-vat9-vat21,payments,paidCents,openCents:shares.length?openShares:Math.max(0,totalCents-paidCents),paid:allShares||(totalCents>0&&paidCents>=totalCents),
  // Verschil door „Jou wat goed fielt” bij meebetalen (negatief: minder betaald, positief: meer).
  differenceCents:allShares?paidCents-totalCents:0,closed:g.status!=='actief'};
}
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);

// Betalen op de factuur (wens eigenaar 5 november 2026): „mensen moeten op de factuur een link hebben om te betalen”.
// Per openstaand deel een betaallink naar de bestelpagina met het betaalverzoek (?deel=), waar de gast met iDEAL betaalt.
// Het IBAN en de tenaamstelling komen uit Systeem & koppelingen → Facturen. Een voldane rekening krijgt geen betaallinks.
export type InvoicePayment={iban:string;accountName:string;links:{position:number;count:number;amountCents:number;url:string}[]};
export function invoicePayment(shares:{id:string;position:number;count:number;amountCents:number;status:string}[],settings:{iban?:string;accountName?:string},orderPage:string,paid:boolean):InvoicePayment{
 const iban=(settings.iban||'').toUpperCase().replace(/[\s.-]/g,'').replace(/(.{4})/g,'$1 ').trim();
 const links=paid?[]:shares.filter(s=>s.status==='open'&&s.amountCents>0).sort((a,b)=>a.position-b.position).map(s=>{const u=new URL(orderPage);u.searchParams.set('deel',s.id);return {position:s.position,count:s.count,amountCents:s.amountCents,url:u.toString()}});
 return {iban,accountName:(settings.accountName||'').trim(),links};
}

// ---- Factuurmail aan de rekeninghouder (wens eigenaar 5 november 2026; mail aan gasten gaat vanaf info@).
type MailInvoice=ReturnType<typeof invoiceData>;
/** Productnaam zonder emoji (wel in de winkel, niet op een factuur). */
export const plainName=(n:string)=>n.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu,'').replace(/\s+/g,' ').trim()||n;
const day=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(iso.length===10?iso+'T12:00:00Z':iso));
/** Tekst van de factuurmail: „voldaan” (bewijs) of „open” (nog te betalen, met betaallinks). Alleen het overzicht:
 *  wat er besteld is en wie er besteld hebben, niet wie wat nam. */
export function invoiceMailText(inv:MailInvoice,kind:'voldaan'|'open',payLinks:{label:string;amountCents:number;url:string}[]=[]){
 const s=inv.seller,first=(inv.holder.name||'').split(' ')[0]||'gast';
 const lines=[`Beste ${first},`,'',
  kind==='voldaan'?`Dank je wel! De rekening „${inv.bill}” is helemaal betaald. De factuur zit als PDF in de bijlage; hieronder staat het overzicht.`
   :`Dank je wel voor jullie bezoek aan Boer Bart. Op de rekening „${inv.bill}” staat nog ${euro(inv.openCents)} open. De factuur zit als PDF in de bijlage; hieronder staat het overzicht en hoe je kunt betalen.`,
  '',`FACTUUR ${inv.number} · ${day(inv.date)}${inv.paid?' · VOLDAAN':''}`,`Rekening: ${inv.bill}`,'',
  ...inv.products.map(p=>`${p.quantity}× ${plainName(p.name)} (${p.vat}% btw)  ${euro(p.totalCents)}`),'',
  ...(inv.orderedBy.length?[`Besteld door: ${inv.orderedBy.join(', ')}`,'']:[]),
  `Totaal excl. btw  ${euro(inv.exclCents)}`,...inv.vat.map(v=>`Btw ${v.rate}% over ${euro(v.exclCents)}  ${euro(v.vatCents)}`),`Totaal incl. btw  ${euro(inv.totalCents)}`,
  ...inv.payments.map(p=>`Betaald: ${p.method} · ${day(p.paidAt)}  ${euro(p.amountCents)}`),
  ...(inv.differenceCents?[`Geef wat goed voelt: ${inv.differenceCents<0?'minder':'meer'} betaald dan de gemiddelde waarde (${euro(Math.abs(inv.differenceCents))})`]:[]),
  inv.paid?'Voldaan.':`Nog te betalen: ${euro(inv.openCents)}`,'',
  ...(kind==='open'&&payLinks.length?[payLinks.length>1?'Betalen met iDEAL (per deel):':'Betalen met iDEAL:',...payLinks.map(l=>`${l.label} (${euro(l.amountCents)}): ${l.url}`),'']:[]),
  'Hartelijke groet,','Rianne en Bart',s.name,...[s.street,[s.postalCode,s.city].filter(Boolean).join(' '),s.phone,s.email].filter(Boolean),
  ...[s.kvk?'KvK '+s.kvk:'',s.vatNumber?'Btw-nummer '+s.vatNumber:''].filter(Boolean)];
 return {subject:kind==='voldaan'?`Factuur ${inv.number} · rekening ${inv.bill} · voldaan`:`Factuur ${inv.number} · rekening ${inv.bill} · nog te betalen`,body:lines.join('\n')};
}
