// Zondagaanbieding van een leverancier (wens eigenaar 5 november 2026): „als op zondag om 15 uur nog voorraad is, dan verkopen voor
// ..% van de vraagprijs; in de kassa aangeven dat het korting heeft”. Eén regel voor kassa, website en server (ook lib/offer-core.ts).
// Tijdstip zelf in te stellen door de leverancier (wens eigenaar 6 november 2026): from = „HH:MM”, standaard 15:00.
export type Offer={percent:number;from?:string};
export const OFFER_HOUR=15;
export const OFFER_FROM_DEFAULT='15:00';
const OFFER_TIME=/^([01]\d|2[0-3]):([0-5]\d)$/;
/** Begintijd van de aanbieding („HH:MM”); zonder eigen tijd 15:00. */
export const offerFrom=(o:{from?:unknown}|null|undefined)=>typeof o?.from==='string'&&OFFER_TIME.test(o.from)?o.from:OFFER_FROM_DEFAULT;
const minutes=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const offerParts=(now:Date)=>{const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return {weekday:f.find(p=>p.type==='weekday')?.value||'',hour:Number(f.find(p=>p.type==='hour')?.value||0),minute:Number(f.find(p=>p.type==='minute')?.value||0)}};
/** Geldig percentage van de vraagprijs: 10 tot en met 95; een eigen begintijd is „HH:MM” (of ontbreekt: 15:00). */
export const validOffer=(v:unknown):v is Offer=>!!v&&typeof v==='object'&&Number.isInteger((v as Offer).percent)&&(v as Offer).percent>=10&&(v as Offer).percent<=95&&((v as Offer).from===undefined||typeof (v as Offer).from==='string'&&OFFER_TIME.test((v as Offer).from as string));
/** Loopt de aanbieding nu? Op zondag vanaf de begintijd (standaard 15:00, Nederlandse tijd) tot het einde van de dag. Voorraad is nodig om te verkopen. */
export function offerActive(p:{offer?:unknown},now=new Date()){if(!validOffer(p.offer))return false;const t=offerParts(now);return t.weekday==='Sun'&&t.hour*60+t.minute>=minutes(offerFrom(p.offer))}
/** De aanbiedingsprijs, afgerond op hele centen. */
export const offerPrice=(priceCents:number,percent:number)=>Math.round(priceCents*percent/100);
// „Aanbieding maken” (wens eigenaar 7 november 2026): de leverancier start zelf een korting, meteen, tot en met een datum die hij
// kiest. percent = % van de vraagprijs (zoals bij de zondagaanbieding); from/until = dagen (Europe/Amsterdam), beide inbegrepen.
export type Deal={percent:number;from:string;until:string};
const DEAL_DAY=/^\d{4}-\d{2}-\d{2}$/;
export const validDeal=(v:unknown):v is Deal=>!!v&&typeof v==='object'&&Number.isInteger((v as Deal).percent)&&(v as Deal).percent>=10&&(v as Deal).percent<=95
 &&typeof (v as Deal).from==='string'&&DEAL_DAY.test((v as Deal).from)&&typeof (v as Deal).until==='string'&&DEAL_DAY.test((v as Deal).until)&&(v as Deal).until>=(v as Deal).from;
const amsterdamDate=(now:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now);
/** Loopt de eigen aanbieding vandaag? */
export function dealActive(p:{deal?:unknown},now=new Date()){if(!validDeal(p.deal))return false;const d=amsterdamDate(now);return p.deal.from<=d&&d<=p.deal.until}
/** Wat de kassa, de website en de server rekenen: de laagste prijs van een lopende eigen aanbieding of zondagaanbieding, anders de gewone prijs. */
export function currentPrice(p:{priceCents:number;offer?:unknown;deal?:unknown},now=new Date()){
 const percents=[...(offerActive(p,now)?[(p.offer as Offer).percent]:[]),...(dealActive(p,now)?[(p.deal as Deal).percent]:[])];
 if(!percents.length)return {priceCents:p.priceCents,wasCents:null,percent:null};
 const percent=Math.min(...percents);return {priceCents:offerPrice(p.priceCents,percent),wasCents:p.priceCents,percent};
}

export type ProductChoice={id:string,label:string,extraCents:number};
export type ProductGroup={id:string,title:string,required:boolean,choices:ProductChoice[]};
export type SaleProduct={onStartscherm?:boolean,zelfkassa?:{at:string,labelName:string},name:string,priceCents:number,vat:string,station:string,available:boolean,department:string,pot?:string,optionGroups?:ProductGroup[],check?:string,sourceCheck?:string,customerPrice?:boolean,offer?:unknown,deal?:unknown};
/** "Prijs controleren" staat open: zichtbaar (check) of als verborgen markering uit de oorspronkelijke lijst (sourceCheck).
 *  Eén regel voor website, kassa, server en overzichten (besluit eigenaar 4 november 2026). */
export const priceCheckOpen=(p:{check?:unknown;sourceCheck?:unknown})=>p.check==='Prijs controleren'||p.sourceCheck==='Prijs controleren';
// priceCents: alleen bij een product met „klant voert prijs in” (customerPrice, wens eigenaar 5 november 2026), bijvoorbeeld
// rundvlees dat per stuk in gewicht verschilt: het bedrag van het etiket, per stuk, incl. btw.
export type RequestedLine={productId:string,version:number,quantity:number,selections:Record<string,string>,note:string,priceCents?:number};
/** Bovengrens per stuk alleen tegen tikfouten met extra nullen (eigenaar: verder geen grenzen). */
export const MAX_CUSTOMER_PRICE_CENTS=100000;
export const CUSTOMER_PRICE_CHOICE='prijs van het etiket';
export type SaleLine={productId:string,name:string,quantity:number,unitCents:number,totalCents:number,vat:string,vatCents:number,station:string,choices:string[],note:string};
/** now: het moment van verkopen (zondagaanbieding vanaf 15:00, lib/offer-core.ts). */
export function buildLine(p:SaleProduct,input:RequestedLine,now=new Date()):SaleLine{
 if(!p.available)throw Error('Product is niet beschikbaar.');
 if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>99)throw Error('Kies een aantal van 1 tot en met 99.');
 // Werkafdeling „Geen” mag alleen voor een product dat voor een pot telt (entree speelboerderij): niets klaar te maken.
 if(!['kok','barista','winkel'].includes(p.station)&&!(p.station==='geen'&&!!p.pot))throw Error('Stel eerst de werkafdeling van '+p.name+' in.');
 if(!['9','21'].includes(p.vat)||priceCheckOpen(p))throw Error('Controleer eerst prijs en btw van '+p.name+'.');
 if(!Number.isSafeInteger(p.priceCents)||p.priceCents<0)throw Error('Ongeldige productprijs.');
 if(typeof input.note!=='string'||input.note.length>300||!input.selections||typeof input.selections!=='object'||Array.isArray(input.selections))throw Error('Ongeldige bestelkeuzes of opmerking.');
 const groups=p.optionGroups||[],choices:string[]=[];let unitCents=p.priceCents;
 if(p.customerPrice===true){
  const c=input.priceCents;
  if(!Number.isSafeInteger(c)||(c as number)<1)throw Error('Vul de prijs van het etiket in bij '+p.name+'.');
  if((c as number)>MAX_CUSTOMER_PRICE_CENTS)throw Error('Controleer de prijs bij '+p.name+': dat bedrag is wel erg hoog.');
  unitCents=c as number;choices.push(CUSTOMER_PRICE_CHOICE);
 }else if(input.priceCents!==undefined&&input.priceCents!==null)throw Error('Bij '+p.name+' geldt de vaste prijs.');
 else{
  // Zondagaanbieding (alleen bij een vaste prijs): zichtbaar op de bon en in de kassa als keuze bij de regel.
  const price=currentPrice(p,now);unitCents=price.priceCents;
  if(price.percent!==null)choices.push(`Aanbieding: ${price.percent}% van de prijs (korting)`);
 }
 for(const key of Object.keys(input.selections))if(!groups.some(g=>g.id===key))throw Error('Een keuzevraag is gewijzigd. Kies het product opnieuw.');
 for(const g of groups){const selected=input.selections[g.id];if(!selected){if(g.required)throw Error('Maak een keuze bij '+g.title+'.');continue}const choice=g.choices.find(c=>c.id===selected);if(!choice)throw Error('Ongeldige keuze bij '+g.title+'.');if(!Number.isSafeInteger(choice.extraCents)||choice.extraCents<0)throw Error('Ongeldige meerprijs.');unitCents+=choice.extraCents;choices.push(g.title+': '+choice.label);}
 const totalCents=unitCents*input.quantity;if(!Number.isSafeInteger(totalCents)||totalCents>100000000)throw Error('Bestelbedrag te hoog.');
 return {productId:input.productId,name:p.name,quantity:input.quantity,unitCents,totalCents,vat:p.vat,vatCents:Math.round(totalCents*Number(p.vat)/(100+Number(p.vat))),station:p.station,choices,note:input.note.trim()};
}
// Queryable columns derived from the recorded lines; the full lines stay in the order JSON as the historical record.
export function orderTotals(lines:SaleLine[]){return {totalCents:lines.reduce((s,l)=>s+l.totalCents,0),vat9Cents:lines.filter(l=>l.vat==='9').reduce((s,l)=>s+l.vatCents,0),vat21Cents:lines.filter(l=>l.vat==='21').reduce((s,l)=>s+l.vatCents,0)};}
export function lineRecords(lines:SaleLine[]){return lines.map((l,position)=>({position,productId:l.productId,name:l.name,station:l.station,quantity:l.quantity,unitCents:l.unitCents,totalCents:l.totalCents,vat:l.vat,vatCents:l.vatCents}));}
// Period filter for overviews: whole days (YYYY-MM-DD) in Europe/Amsterdam, at most 366 days.
const amsterdamDay=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(d);
function dayStart(day:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const noon=new Date(day+'T12:00:00Z');if(Number.isNaN(noon.getTime())||noon.toISOString().slice(0,10)!==day)return null;
 // Find the UTC instant of local midnight by checking the offsets around it (handles summer/winter time).
 for(const h of [-1,-2,0,-3,1]){const t=new Date(Date.parse(day+'T00:00:00Z')+h*3600000);if(amsterdamDay(t)===day&&amsterdamDay(new Date(t.getTime()-1))!==day)return t;}return null;}
export function orderPeriod(from:string|null,to:string|null){
 if(!from||!to)return null;const start=dayStart(from),endDay=dayStart(to);if(!start||!endDay||to<from)throw Error('Kies een geldige periode.');
 const next=new Date(Date.parse(to+'T12:00:00Z')+86400000).toISOString().slice(0,10),end=dayStart(next)!;
 if(end.getTime()-start.getTime()>367*86400000)throw Error('Kies een periode van maximaal een jaar.');
 return {from:start.toISOString(),until:end.toISOString()};
}
