// Voorraad tellen op de werkplek (wens eigenaar 6 november 2026): personeel loopt de voorraad door („er is nog zoveel cola”),
// typt per regel de nieuwe voorraad en geeft bij een verschil een reden. De eigenaar ziet daarna een lijst met afwijkingen,
// naast wat er sinds de vorige telling via de kassa en de website is verkocht („hoezo is die afwijking zoveel groter?”).
// Geen tweede voorraadlijst en geen nieuwe tabel: de telling is een gewone voorraadbeweging in stock_moves (Inkoop & voorraad).
// De reden, wie telde en de oude en nieuwe stand staan in de referentie van die beweging. Hier alleen regels, zonder database.

export const COUNT_PREFIX='Werkplektelling';
export const DEVIATION_REASONS={
 groep:'Groep of feest buiten de kassa',
 personeel:'Leden of eigen gebruik',
 bederf:'Bederf of over de datum',
 kapot:'Kapot, gemorst of weggegooid',
 kassa:'Niet (goed) aangeslagen in de kassa',
 levering:'Levering nog niet geboekt',
 telfout:'Vorige telling klopte niet',
 anders:'Anders (toelichting)',
} as const;
export type DeviationReason=keyof typeof DEVIATION_REASONS;
export const isDeviationReason=(v:unknown):v is DeviationReason=>typeof v==='string'&&Object.hasOwn(DEVIATION_REASONS,v);
export const MAX_COUNTS=300;
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f·]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const round=(n:number)=>Math.round(n*1000)/1000;
/** Getal voor in de referentie en op het scherm: hooguit drie decimalen, met komma. */
export const amount=(n:number)=>String(round(n)).replace('.',',');

export type CountInput={ingredientId:string;quantity:number;reason?:string;note?:string};
export type CheckedCount={ingredientId:string;quantity:number;reason:DeviationReason|null;note:string};
/** Controleert een telling. Een verschil vraagt altijd een reden; bij „anders” ook een toelichting.
 * free: magazijnartikelen (lib/warehouse-core.ts) raken op door gewoon gebruik; daar is een reden niet nodig. */
export function checkCount(input:unknown,oldStock:number,free=false):CheckedCount{
 const c=input as CountInput;
 if(!c||typeof c.ingredientId!=='string'||!c.ingredientId||c.ingredientId.length>100)throw Error('Ongeldige voorraadregel.');
 if(typeof c.quantity!=='number'||!Number.isFinite(c.quantity)||c.quantity<0||c.quantity>1000000)throw Error('Vul een voorraad van 0 of meer in.');
 const note=clean(c.note,200),diff=round(c.quantity-oldStock);
 if(diff===0)return {ingredientId:c.ingredientId,quantity:c.quantity,reason:null,note};
 if(free&&!isDeviationReason(c.reason))return {ingredientId:c.ingredientId,quantity:c.quantity,reason:null,note};
 if(!isDeviationReason(c.reason))throw Error('Kies bij elk verschil een reden van de afwijking.');
 if(c.reason==='anders'&&!note)throw Error('Schrijf bij „Anders” kort wat er is gebeurd.');
 return {ingredientId:c.ingredientId,quantity:c.quantity,reason:c.reason,note};
}

/** „Werkplektelling · was 12 · geteld 8 · Groep of feest buiten de kassa: verjaardag · door Sanne” */
export function countReference(c:{oldStock:number;quantity:number;reason:DeviationReason|null;note:string;by:string}){
 const parts=[COUNT_PREFIX,'was '+amount(c.oldStock),'geteld '+amount(c.quantity)],note=clean(c.note,200);
 if(c.reason)parts.push(DEVIATION_REASONS[c.reason]+(note?': '+note:''));else if(note)parts.push(note);
 const by=clean(c.by,60);if(by)parts.push('door '+by);
 return parts.join(' · ');
}
export type ParsedCount={oldStock:number;quantity:number;reason:DeviationReason|null;reasonText:string;note:string;by:string};
export function parseCountReference(ref:string):ParsedCount|null{
 const parts=ref.split(' · ');if(parts[0]!==COUNT_PREFIX)return null;
 const num=(p:string|undefined,label:string)=>p?.startsWith(label+' ')?Number(p.slice(label.length+1).replace(',','.')):NaN;
 const oldStock=num(parts[1],'was'),quantity=num(parts[2],'geteld');if(!Number.isFinite(oldStock)||!Number.isFinite(quantity))return null;
 let by='',rest=parts.slice(3);if(rest.length&&rest[rest.length-1].startsWith('door ')){by=rest[rest.length-1].slice(5);rest=rest.slice(0,-1)}
 const text=rest.join(' · ');let reason:DeviationReason|null=null,note=text;
 for(const [k,label] of Object.entries(DEVIATION_REASONS))if(text===label||text.startsWith(label+': ')){reason=k as DeviationReason;note=text.slice(label.length).replace(/^: /,'');break}
 return {oldStock,quantity,reason,reasonText:reason?DEVIATION_REASONS[reason]:'',note,by};
}

/** Groot verschil: minstens 2 (stuks, liters, kilo's) én meer dan een vijfde van wat er lag of verkocht is. */
export function largeDeviation(diff:number,oldStock:number,sold:number){const d=Math.abs(diff);return d>=2&&d>0.2*Math.max(oldStock,sold,1)}

type Move={ingredientId:string;quantity:number;date:string;reason:string;reference:string;seq?:number};
export type DeviationRow={date:string;ingredientId:string;name:string;unit:string;oldStock:number;quantity:number;diff:number;soldSince:number;sinceDate:string;reason:DeviationReason|null;reasonText:string;note:string;by:string;large:boolean};
/** Lijst voor de eigenaar: elke telling op de werkplek met een verschil, nieuwste eerst, met wat er sinds de vorige telling is verkocht. */
export function deviationReport(moves:Move[],ingredients:{id:string;name:string;unit:string}[]):DeviationRow[]{
 const sorted=[...moves].sort((a,b)=>a.date.localeCompare(b.date)||(a.seq??0)-(b.seq??0));
 const lastCount=new Map<string,string>(),sold=new Map<string,number>(),out:DeviationRow[]=[];
 for(const m of sorted){
  if(m.reason==='Verkoop'){sold.set(m.ingredientId,(sold.get(m.ingredientId)||0)-m.quantity);continue}
  if(m.reason!=='Telling / correctie'&&m.reason!=='Beginvoorraad')continue;
  const p=parseCountReference(m.reference),since=lastCount.get(m.ingredientId)||'',s=round(sold.get(m.ingredientId)||0);
  lastCount.set(m.ingredientId,m.date);sold.set(m.ingredientId,0);
  if(!p)continue;const diff=round(p.quantity-p.oldStock);if(diff===0)continue;
  const i=ingredients.find(x=>x.id===m.ingredientId);
  out.push({date:m.date,ingredientId:m.ingredientId,name:i?.name||'Onbekend',unit:i?.unit||'',oldStock:p.oldStock,quantity:p.quantity,diff,soldSince:s,sinceDate:since,reason:p.reason,reasonText:p.reasonText||p.note,note:p.reason?p.note:'',by:p.by,large:largeDeviation(diff,p.oldStock,s)});
 }
 return out.reverse();
}

// ---- Onderling inkopen (wens eigenaar 6 november 2026): de kok haalt iets uit de winkel dat van een lid is (kaas van
// Piet, brood van Sanne). Dat is een verkoop van de eigenaar van het product, op naam van de keuken, zodat het
// in de weekafsluiting van de coöperatieve winkel bij de juiste persoon terechtkomt. Het gaat niet naar een werkplek.
// Besluit eigenaar 6 november 2026: „Keuken betaalt inkoopprijs.” Zie internalUnitCents.
export const INTERNAL_MODE='onderling';
export const INTERNAL_TAKERS={keuken:'Keuken',bar:'Koffiebar',restaurant:'Restaurant'} as const;
export type InternalTaker=keyof typeof INTERNAL_TAKERS;
/** Referentie op de bestelling: „Keuken · Sanne”. */
export function internalReference(taker:unknown,by:unknown){
 if(typeof taker!=='string'||!Object.hasOwn(INTERNAL_TAKERS,taker))throw Error('Kies voor wie het is: keuken, koffiebar of restaurant.');
 const who=clean(by,40);if(!who)throw Error('Vul in wie het uit de winkel haalt.');
 return INTERNAL_TAKERS[taker as InternalTaker]+' · '+who;
}

export const INTERNAL_PRICE_CHOICE='inkoopprijs (onderling)';
export const MANUAL_PRICE_CHOICE='zelf ingevulde prijs (inkoopprijs onbekend)';
export const MAX_MANUAL_CENTS=100000;
/** Zelf ingevulde prijs per stuk (incl. btw), alleen als de inkoopprijs onbekend is (besluit eigenaar 6 november 2026). */
export function manualUnitCents(v:unknown,name:string){
 if(!Number.isSafeInteger(v)||(v as number)<1)throw Error('Vul bij '+name+' een prijs per stuk in: de inkoopprijs is nog niet bekend.');
 if((v as number)>MAX_MANUAL_CENTS)throw Error('Controleer de prijs bij '+name+': dat bedrag is wel erg hoog.');
 return v as number;
}
/**
 * Inkoopprijs per stuk, inclusief btw, voor onderling inkopen (besluit eigenaar 6 november 2026: „Keuken betaalt inkoopprijs”).
 * - Product van een lid: wat het lid normaal per stuk krijgt, dus de winkelprijs min het coöperatiedeel en de winkelpot van
 *   die dag (ownerBp, basispunten, samen; besluit eigenaar 16 november 2026: kaas van € 10 bij 15% + 5% wordt € 8,00).
 *   De aanroeper rekent ownerBp uit: eigen percentage of standaard 15% (DEFAULT_COOP_BP), plus de winkelpot. In de weekafsluiting gaat dit bedrag volledig naar het lid
 *   (coop-core: onderlinge regels zonder inhouding), zodat het lid precies hetzelfde krijgt als bij een gewone verkoop.
 * - Product van de coöperatie zelf (geen eigenaar): de laatste factuurprijs, exclusief btw (costExclCents), plus de btw
 *   van het product (besluit eigenaar 6 november 2026). Bij een recept telt alleen een kostprijs waarvan elk ingrediënt een
 *   factuurprijs heeft; een schatting telt niet. Onbekend: null, dan vult de keuken zelf een prijs in (manualUnitCents).
 */
/**
 * Inkoopprijs voor een stuk met een etiketprijs (bijvoorbeeld runderlever uit de vriezer; besluit eigenaar 9 november 2026:
 * „etiket min coöperatiedeel”). Product van een lid: het etiketbedrag min het coöperatiedeel en de winkelpot van die dag (ownerBp), net als
 * internalUnitCents. Product van de coöperatie zelf: het volle etiketbedrag. Eén etiket is altijd één stuk.
 */
export const LABEL_PRICE_CHOICE=(labelCents:number,owner:boolean)=>`etiket € ${(labelCents/100).toFixed(2).replace('.',',')}${owner?', min coöperatiedeel en winkelpot':''}`;
export function internalLabelUnitCents(labelCents:unknown,p:{name:string;owner:boolean;ownerBp:number|null}){
 if(!Number.isSafeInteger(labelCents)||(labelCents as number)<1)throw Error('Vul bij '+p.name+' het bedrag van het etiket in, of maak een foto van het etiket.');
 if((labelCents as number)>MAX_MANUAL_CENTS)throw Error('Controleer het etiketbedrag bij '+p.name+': dat bedrag is wel erg hoog.');
 if(!p.owner)return labelCents as number;
 const bp=Math.min(10000,Math.max(0,p.ownerBp??0));return Math.round((labelCents as number)*(10000-bp)/10000);
}
export function internalUnitCents(p:{priceCents:number;vat:string;owner:boolean;ownerBp:number|null;costExclCents:number|null}):number|null{
 if(p.owner){const bp=Math.min(10000,Math.max(0,p.ownerBp??0));return Math.round(p.priceCents*(10000-bp)/10000)}
 if(p.costExclCents===null||!Number.isFinite(p.costExclCents)||p.costExclCents<0)return null;
 return Math.round(p.costExclCents*(100+Number(p.vat))/100);
}
