// Price analysis and proposals (owner request, 2 November 2026). Pure functions: no database, no network.
// - Compares each product with regional reference prices (lib/price-benchmarks.ts), only sit-down horeca.
// - Proposes a price only when the product is clearly BELOW the regional range, and then only up to the
//   bottom of that range: a careful step, never a jump to the average. At least 2 regional prices are needed.
// - Above the region: no automatic lowering (Boerderijrecreatie may ask more for its own farm products); a note to check.
// - Also flags products that differ strongly from comparable products on Boerderijrecreatie's own menu, and copies.
// - Suggests VAT (lib/vat-suggest: 9%, alcoholic drinks 21% by law) and a work station when it is missing.
// Nothing is applied here: the owner reviews and applies proposals in Prijzen & verkoopklaar.
import {BENCHMARKS,type Benchmark} from './price-benchmarks';
import {suggestVat} from './vat-suggest';
import {priceCheckOpen} from './orders';

type Category={label:string;match:RegExp;exclude?:RegExp;proposals:boolean;station:'kok'|'barista'|null;note?:string};
// Order matters: the first matching category wins.
export const CATEGORIES:Record<string,Category>={
 'ijskoffie':{label:'IJskoffie',match:/iced (latte|cappuc)|frappuc/i,proposals:true,station:'barista'},
 'cappuccino':{label:'Cappuccino',match:/cappuc/i,proposals:true,station:'barista'},
 'koffie':{label:'Koffie',match:/\b(koffie|lungo|espresso|latte|macchiato|affogato)\b/i,exclude:/extra shot/i,proposals:true,station:'barista'},
 'thee':{label:'Thee',match:/\bthee\b/i,proposals:true,station:'barista'},
 'warme-melk':{label:'Chocolademelk en melk',match:/chocolademelk|\bmelk\b|karnemelk|jerseymelk/i,exclude:/1l melk|liter/i,proposals:true,station:'barista'},
 'water':{label:'Water',match:/\bspa\b|\bwater\b|bronwater/i,exclude:/waterijs/i,proposals:true,station:'barista'},
 'frisdrank':{label:'Frisdrank',match:/coca|cola\b|cola |fanta|rivella|fuze|ice tea|bitter ?lemon|ginger|tonic|fristi|anjola|fritz|naturfrisk|\bmoj-|lemonade|frisdrank/i,proposals:true,station:'barista'},
 'smoothie':{label:'Smoothies en milkshakes',match:/smooth|milkshake/i,proposals:true,station:'barista'},
 'speciaalbier':{label:'Speciaalbier',match:/gudzekop|tripel|trippel|quadrupel|qaudrupel|weizen|witbier/i,exclude:/0[.,]0/i,proposals:true,station:'barista'},
 'pils':{label:'Bier (glas of flesje)',match:/\bbier\b|pils|blondbier|radler|\bblond\b|krombacher|franziskaner|affligem|hoegaarden|liefmans|warsteiner/i,proposals:true,station:'barista'},
 'wijn':{label:'Wijn per glas',match:/\b(rode|witte|ros[ée])? ?wijn\b/i,exclude:/boerenwijn|boeren wijn|fles/i,proposals:true,station:'barista'},
 'kindertosti':{label:'Kindertosti',match:/kindertosti/i,proposals:true,station:'kok'},
 'tosti':{label:'Tosti',match:/tosti/i,proposals:true,station:'kok'},
 'soep':{label:'Soep',match:/soep/i,proposals:true,station:'kok'},
 'burger':{label:'Burger',match:/burger/i,proposals:false,station:'kok',note:'In de regio worden burgers vaak met friet geserveerd; daarom geen automatisch voorstel.'},
 'bitterballen':{label:'Bitterballen',match:/bitterbal/i,proposals:true,station:'kok'},
 'kinderpannenkoek':{label:'Kinderpannenkoek',match:/kinderpannenkoek/i,proposals:true,station:'kok'},
 'pannenkoek':{label:'Pannenkoek',match:/pannenkoek|pancake/i,proposals:true,station:'kok'},
 'gebak':{label:'Taart en gebak',match:/taart|brownie|muffin|kleefkoek|cake/i,exclude:/mix|pakket/i,proposals:true,station:'barista'},
};

export function categorize(name:string):string|null{
 for(const [key,c] of Object.entries(CATEGORIES))if(c.match.test(name)&&!(c.exclude&&c.exclude.test(name)))return key;
 return null;
}

const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2)};
/** Round up to a menu-friendly amount: 5 cents below €5, otherwise 25 cents. */
export function menuRound(cents:number){const step=cents<500?5:25;return Math.ceil(cents/step)*step}

export type RegionStats={n:number;min:number;max:number;median:number;references:Benchmark[];lowReferences:Benchmark[]};
export function regionStats(category:string,benchmarks:Benchmark[]=BENCHMARKS):RegionStats|null{
 const all=benchmarks.filter(b=>b.category===category);
 const horeca=all.filter(b=>b.segment==='horeca'),low=all.filter(b=>b.segment==='afhaal');
 if(!horeca.length&&!low.length)return null;
 const p=horeca.map(b=>b.priceCents);
 return {n:horeca.length,min:p.length?Math.min(...p):0,max:p.length?Math.max(...p):0,median:p.length?median(p):0,references:horeca,lowReferences:low};
}

export type ProductLike={id:string;version:number;draft:Record<string,unknown>;published:Record<string,unknown>|null};
export type Advice={
 id:string;version:number;name:string;department:string;priceCents:number;
 category:string|null;categoryLabel:string|null;region:RegionStats|null;
 position:'onder'|'binnen'|'boven'|'onbekend';
 proposedCents:number|null;reason:string;
 ownMedian:number|null;ownFlag:string|null;duplicate:boolean;
 vat:string;vatSuggestion:'9'|'21';vatReason:string;
 station:string;stationSuggestion:'kok'|'barista'|'winkel'|null;
 priceCheck:boolean;published:boolean;changedSincePublish:boolean;
 blockers:string[];
};

// Drinks and ice cream are served from the counter (barista); other restaurant products come from the kitchen.
const COUNTER=/koffie|thee|melk|cola|fanta|rivella|spa\b|sap\b|smooth|milkshake|limonade|lemonade|limo\b|spritz|cocktail|mojito|bier|wijn|prosecco|tonic|ginger|ijs\b|ijsje|waterijs|schepijs|cornetto|magnum|sorbet|fristi|chocolademelk/i;
const ALCOHOL_CATEGORIES=new Set(['pils','speciaalbier','wijn']);
const ALCOHOL_FREE=/0[.,]0|alcoholvrij|zonder alcohol/i;
const isWinkel=(d:Record<string,unknown>)=>String(d.department||'').trim().toLowerCase()==='winkel';
const priceCheckOf=priceCheckOpen; // één regel (lib/orders.ts)
const strip=(d:Record<string,unknown>)=>JSON.stringify({...d,check:'',sourceCheck:undefined});

export function adviseAll(rows:ProductLike[],benchmarks:Benchmark[]=BENCHMARKS):Advice[]{
 const items=rows.map(r=>({r,name:String(r.draft.name||''),price:Number(r.draft.priceCents)||0,cat:categorize(String(r.draft.name||''))}));
 // Own-menu comparison per category (restaurant only), ignoring copies.
 const own=new Map<string,number[]>();
 for(const i of items)if(i.cat&&!isWinkel(i.r.draft)&&!/^kopie van/i.test(i.name)&&i.price>0){if(!own.has(i.cat))own.set(i.cat,[]);own.get(i.cat)!.push(i.price)}
 return items.map(({r,name,price,cat})=>{
  const d=r.draft,winkel=isWinkel(d);
  const category=winkel?null:cat;
  const conf=category?CATEGORIES[category]:null;
  const region=category?regionStats(category,benchmarks):null;
  let position:Advice['position']='onbekend',proposedCents:number|null=null,reason='Geen regionale vergelijking voor dit product.';
  if(winkel)reason='Winkelproduct: geen regionale horecavergelijking; prijs ongewijzigd.';
  else if(region&&region.n>=2&&price>0){
   if(price<region.min*0.95){position='onder';
    if(conf!.proposals){proposedCents=menuRound(region.min);reason=`Onder de regio (${region.n} zaken, ${euro(region.min)}–${euro(region.max)}). Voorstel: onderkant van de regio.`}
    else reason=`Onder de regio (${euro(region.min)}–${euro(region.max)}). ${conf!.note||''}`.trim();
   }else if(price>region.max*1.05){position='boven';reason=`Boven de regio (${euro(region.min)}–${euro(region.max)}). Geen automatische verlaging: past het bij de beleving en kwaliteit van Boerderijrecreatie?`}
   else{position='binnen';reason=`Past in de regio (${region.n} zaken, ${euro(region.min)}–${euro(region.max)}).`}
  }else if(region&&region.n<2&&!winkel){reason=region.n===1?`Eén regionale prijs (${euro(region.min)}): te weinig voor een voorstel.`:'Alleen afhaalprijzen in de regio: geen voorstel.'}
  const ownPrices=category?own.get(category)||[]:[];const ownMedian=ownPrices.length>=3?median(ownPrices):null;
  const ownFlag=ownMedian&&price>0&&!/^kopie van/i.test(name)&&(price<ownMedian*0.6||price>ownMedian*1.8)?`Wijkt sterk af van vergelijkbare producten op de eigen kaart (meestal ${euro(ownMedian)}). Bewust, of een vergissing?`:null;
  const duplicate=/^kopie van/i.test(name);
  const base=suggestVat(name);
  // Beer and wine with alcohol are 21% by law, also when the name does not say "bier" (for example Gudzekop Trippel).
  const v=category&&ALCOHOL_CATEGORIES.has(category)&&!ALCOHOL_FREE.test(name)?{vat:'21' as const,reason:'Bier of wijn met alcohol: wettelijk 21%'}:base;
  const station=String(d.station||'');
  const stationSuggestion=['kok','barista','winkel'].includes(station)?null:winkel?'winkel':conf?.station??(COUNTER.test(name)?'barista':'kok');
  const priceCheck=priceCheckOf(d);
  const published=!!r.published;
  const changedSincePublish=published&&strip(d)!==strip(r.published!);
  const blockers:string[]=[];
  if(priceCheck)blockers.push('Prijs controleren');
  if(!d.vat)blockers.push('Btw ontbreekt');
  if(!['kok','barista','winkel'].includes(station))blockers.push('Werkafdeling ontbreekt');
  if(!published)blockers.push('Niet gepubliceerd');
  else if(changedSincePublish)blockers.push('Wijziging niet gepubliceerd');
  if(d.available===false)blockers.push('Op niet beschikbaar gezet');
  return {id:r.id,version:r.version,name,department:String(d.department||''),priceCents:price,category,categoryLabel:conf?.label??null,region,position,proposedCents,reason,ownMedian,ownFlag,duplicate,
   vat:String(d.vat||''),vatSuggestion:v.vat,vatReason:v.reason,station,stationSuggestion,priceCheck,published,changedSincePublish,blockers};
 });
}
export const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
