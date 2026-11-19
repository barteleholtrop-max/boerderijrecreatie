// Verkoopoverzicht als document (wens eigenaar 4 november 2026): wat er in een periode verkocht is, in de vorm van een
// factuur, om te downloaden of af te drukken. Gebruikt dezelfde omzetregel als Financiën (lib/order-revenue.ts): alleen
// bestellingen die meetellen (`counted`), met het echt betaalde bedrag per regel. Pure functies, geen database.
export type OverviewLine={productId?:string;name:string;quantity:number;vat:string;paidCents:number;paidVatCents:number};
/** Een geslaagde betaling bij een bestelling (tabel payments, status betaald): methode, provider en bedrag. */
export type PaidWith={method:string;provider:string;cents:number};
export type OverviewOrder={number:string;created:string;mode:string;counted:boolean;paidCents:number;paymentStatus?:string;paidWith?:PaidWith[];lines:OverviewLine[]};
export type ProductRow={name:string;vat:string;quantity:number;exclCents:number;vatCents:number;inclCents:number;paidWith:string};
export type Amounts={exclCents:number;vatCents:number;inclCents:number};
const day=(iso:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(iso));
const add=(a:Amounts,incl:number,vat:number)=>{a.inclCents+=incl;a.vatCents+=vat;a.exclCents+=incl-vat};
const zero=():Amounts=>({exclCents:0,vatCents:0,inclCents:0});
export const MODE_NAMES:Record<string,string>={yte:'Ite by Boerderijrecreatie',zelfservice:'Dagrestaurant',winkel:'Winkel',onderling:'Onderling (uit de winkel voor keuken of bar)','eten-drinken':'Eten & drinken (website)'};

// Betaalwijze (wens eigenaar 12 november 2026: „per regel aangeven hoe dit is voldaan, en bij het totaal per bunq, contant, BB-saldo”).
// Uit de geslaagde betalingen van de bestelling. Volgorde = volgorde in het overzicht.
export const PAY_METHODS={bunq:'bunq',mollie:'Online (Mollie)',contant:'Contant',pin:'Pin',bb:'BB-saldo',rente:'Rentesaldo',groepsrekening:'Groepsrekening',zonder:'Zonder betaling (€ 0)',onbekend:'Niet vastgelegd'} as const;
export type PayMethod=keyof typeof PAY_METHODS;
/** Welke betaalwijze hoort bij één betaalregel (method + provider uit de tabel payments)? */
export function payMethodOf(method:string,provider:string):PayMethod{
 if(provider.startsWith('bunqme-'))return 'bunq';
 if(method==='bb'||provider.startsWith('bb:'))return 'bb';
 if(method==='dividend'||provider.startsWith('dividend'))return 'rente';
 if(method==='contant')return 'contant';
 if(method==='pin')return 'pin';
 if(provider.startsWith('mollie-')||method==='online'||method==='qr'||method==='ideal'||method==='directdebit')return 'mollie';
 return 'onbekend';
}
/**
 * Het betaalde bedrag van een bestelling verdeeld over de betaalwijzen. Naar verhouding van de geslaagde betalingen, afgerond
 * zodat de delen samen precies het betaalde bedrag zijn. Zonder geslaagde betaling: groepsrekening, € 0 of niet vastgelegd.
 */
export function paidSplit(o:Pick<OverviewOrder,'paidCents'|'paymentStatus'|'paidWith'>):{method:PayMethod;cents:number}[]{
 const parts=new Map<PayMethod,number>();for(const p of o.paidWith||[])if(p.cents>0){const m=payMethodOf(p.method,p.provider);parts.set(m,(parts.get(m)||0)+p.cents)}
 const sum=[...parts.values()].reduce((a,b)=>a+b,0);
 if(!sum)return [{method:o.paymentStatus==='op-rekening'?'groepsrekening':o.paymentStatus==='nul-bedrag'||o.paidCents===0?'zonder':'onbekend',cents:o.paidCents}];
 const order=(Object.keys(PAY_METHODS) as PayMethod[]).filter(m=>parts.has(m));let left=o.paidCents;
 return order.map((m,i)=>{const cents=i===order.length-1?left:Math.round(o.paidCents*parts.get(m)!/sum);left-=cents;return {method:m,cents}});
}
/** Korte tekst voor een regel: „bunq”, of bij een gedeelde betaling „Rentesaldo + BB-saldo”. */
export const paidWithText=(o:Pick<OverviewOrder,'paidCents'|'paymentStatus'|'paidWith'>)=>paidSplit(o).map(p=>PAY_METHODS[p.method]).join(' + ');

export function salesOverview(orders:OverviewOrder[]){
 const counted=orders.filter(o=>o.counted);
 const products=new Map<string,ProductRow>(),vat=new Map<string,Amounts>(),days=new Map<string,Amounts&{orders:number}>(),modes=new Map<string,Amounts&{orders:number}>(),methods=new Map<PayMethod,{inclCents:number;orders:number}>();
 const total=zero();
 for(const o of counted){
  const d=days.get(day(o.created))??{...zero(),orders:0};d.orders++;days.set(day(o.created),d);
  const m=modes.get(o.mode)??{...zero(),orders:0};m.orders++;modes.set(o.mode,m);
  for(const part of paidSplit(o)){const t=methods.get(part.method)??{inclCents:0,orders:0};t.inclCents+=part.cents;t.orders++;methods.set(part.method,t)}
  const paidWith=paidWithText(o);
  for(const l of o.lines){
   // Per regel de betaalwijze (12 november 2026): hetzelfde product met een andere betaalwijze is een eigen regel.
   const key=(l.productId||l.name)+'|'+l.name+'|'+l.vat+'|'+paidWith;
   const p=products.get(key)??{name:l.name,vat:l.vat,quantity:0,paidWith,...zero()};p.quantity+=l.quantity;add(p,l.paidCents,l.paidVatCents);products.set(key,p);
   const v=vat.get(l.vat)??zero();add(v,l.paidCents,l.paidVatCents);vat.set(l.vat,v);
   add(d,l.paidCents,l.paidVatCents);add(m,l.paidCents,l.paidVatCents);add(total,l.paidCents,l.paidVatCents);
  }
 }
 return {
  // Hetzelfde product bij elkaar (ook met verschillende betaalwijzen), de best verkochte producten eerst.
  products:(()=>{const rows=[...products.values()],byName=new Map<string,number>();for(const r of rows)byName.set(r.name+'|'+r.vat,(byName.get(r.name+'|'+r.vat)||0)+r.inclCents);
   return rows.sort((a,b)=>byName.get(b.name+'|'+b.vat)!-byName.get(a.name+'|'+a.vat)!||a.name.localeCompare(b.name,'nl')||a.vat.localeCompare(b.vat)||b.inclCents-a.inclCents||a.paidWith.localeCompare(b.paidWith,'nl'))})(),
  vat:[...vat.entries()].map(([rate,a])=>({rate,...a})).sort((a,b)=>Number(a.rate)-Number(b.rate)),
  days:[...days.entries()].map(([date,a])=>({date,...a})).sort((a,b)=>a.date.localeCompare(b.date)),
  methods:(Object.keys(PAY_METHODS) as PayMethod[]).filter(k=>methods.has(k)).map(k=>({method:k,name:PAY_METHODS[k],...methods.get(k)!})),
  modes:[...modes.entries()].map(([mode,a])=>({mode,name:MODE_NAMES[mode]||mode,...a})).sort((a,b)=>b.inclCents-a.inclCents),
  total,orders:counted.length,skipped:orders.length-counted.length,
 };
}

const iso=(d:Date)=>d.toISOString().slice(0,10);
const at=(date:string)=>new Date(date+'T12:00:00Z');
const shift=(date:string,n:number)=>{const d=at(date);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
/** Snelle periodekeuzes rond `today` (YYYY-MM-DD). Een week loopt van maandag t/m zondag. */
export function periodPreset(kind:'dag'|'gisteren'|'week'|'vorige-week'|'maand'|'vorige-maand',today:string){
 if(kind==='dag')return {van:today,tot:today};
 if(kind==='gisteren'){const y=shift(today,-1);return {van:y,tot:y}}
 const monday=shift(today,-((at(today).getUTCDay()+6)%7));
 if(kind==='week')return {van:monday,tot:shift(monday,6)};
 if(kind==='vorige-week')return {van:shift(monday,-7),tot:shift(monday,-1)};
 const first=today.slice(0,8)+'01',next=(f:string)=>{const d=at(f);d.setUTCMonth(d.getUTCMonth()+1);return iso(d)};
 if(kind==='maand')return {van:first,tot:shift(next(first),-1)};
 const prev=(()=>{const d=at(first);d.setUTCMonth(d.getUTCMonth()-1);return iso(d)})();
 return {van:prev,tot:shift(first,-1)};
}
/** Documentnummer voor het overzicht, bijvoorbeeld VO-20261102-20261108. */
export const overviewNumber=(van:string,tot:string)=>'VO-'+van.replaceAll('-','')+(van===tot?'':'-'+tot.replaceAll('-',''));
