// Prijsvoorstellen voor winkelproducten (besluit eigenaar 3 november 2026, „Voorraad en winkelprijzen”).
// Basis: de laatste inkoopprijs (kostprijs uit het recept, exclusief btw) en een doelmarge per grootboekrekening.
// Daarbij: verkoopsnelheid, „mag sneller weg” en voorraad. Afgerond op hele of halve euro's.
// De AI doet alleen een voorstel; de prijs verandert pas na „Overnemen” door een medewerker.
// Marge = (verkoopprijs excl. btw − kostprijs) / verkoopprijs excl. btw, zoals in lib/costing.ts.

export type LedgerKind='doorverkoop'|'grondstof';
export type Ledger={id:string;name:string;kind:LedgerKind;marginPct:number|null};
// Grootboekrekeningen uit SnelStart, groep „Kostprijs van de omzet nevenactiviteit” (aangeleverd door de eigenaar,
// 3 november 2026). Doelmarges zijn het startvoorstel; per product kan een eigen doelmarge worden ingesteld.
export const LEDGERS:Ledger[]=[
 {id:'7101',name:'Horeca btw laag',kind:'doorverkoop',marginPct:75},
 {id:'7102',name:'Meel/graan',kind:'grondstof',marginPct:null},
 {id:'7103',name:'Eieren',kind:'doorverkoop',marginPct:35},
 {id:'7104',name:'Kaas',kind:'doorverkoop',marginPct:35},
 {id:'7105',name:'Vlees',kind:'doorverkoop',marginPct:30},
 {id:'7106',name:'Non-food btw hoog',kind:'doorverkoop',marginPct:45},
 {id:'7107',name:'Koffie',kind:'doorverkoop',marginPct:80},
 {id:'7108',name:'Alcohol',kind:'doorverkoop',marginPct:50},
 {id:'7109',name:'Zeep',kind:'grondstof',marginPct:null},
 {id:'7110',name:'Winkel',kind:'doorverkoop',marginPct:40},
];
export const SALE_LEDGERS=LEDGERS.filter(l=>l.kind==='doorverkoop');
export const ledgerLabel=(id:string)=>{const l=LEDGERS.find(l=>l.id===id);return l?`${l.id} ${l.name}`:''};

export const RULES={
 minMarginPct:20,   // nooit een voorstel onder deze marge
 maxStepPct:15,     // hooguit zoveel procent omhoog of omlaag per voorstel (de afronding gaat voor)
 fasterSalePct:10,  // korting bij „mag sneller weg” als er meer dan 2 weken voorraad ligt
 fasterSaleWeeks:2,
 slowWeeks:6,       // „ligt stil” vanaf zoveel weken voorraad: 5% lager
 slowPct:5,
 fastPerWeek:15,    // „verkoopt snel” vanaf zoveel per week, met minder dan 1,5 week voorraad: 3% hoger
 fastWeeks:1.5,
 fastPct:3,
 defaultMarginPct:40,
 roundCents:50,
};

export type ShopInput={
 priceCents:number;vat:string;ledger?:string;targetMarginPct?:number;fasterSale?:boolean;
 costCents:number|null;       // kostprijs per stuk excl. btw (uit het recept)
 previousCostCents?:number|null;costNote?:string; // vorige inkoopprijs en waar de nieuwe vandaan komt, voor de uitleg
 soldPerWeek:number;          // gemiddeld verkocht per week (laatste 4 weken)
 stock:number|null;           // getelde voorraad in stuks, null = onbeperkt of onbekend
};
export type ShopAdvice={proposedCents:number|null;reasons:string[];marginNowPct:number|null;marginNewPct:number|null;targetMarginPct:number;problem:string|null};

export const margin=(priceCents:number,vat:string,costCents:number)=>{const ex=priceCents/(1+Number(vat)/100);return ex>0?Math.round((ex-costCents)/ex*1000)/10:null};
export const roundHalf=(cents:number)=>Math.max(RULES.roundCents,Math.round(cents/RULES.roundCents)*RULES.roundCents);
const pct=(n:number)=>(n>0?'+':'')+Math.round(n*100)+'%';
const priceFor=(costCents:number,vat:string,marginPct:number)=>costCents/(1-marginPct/100)*(1+Number(vat)/100);

export function targetMargin(i:Pick<ShopInput,'ledger'|'targetMarginPct'>){
 if(typeof i.targetMarginPct==='number')return i.targetMarginPct;
 return LEDGERS.find(l=>l.id===i.ledger)?.marginPct??RULES.defaultMarginPct;
}

export function adviseShop(i:ShopInput):ShopAdvice{
 const target=targetMargin(i);
 const base={proposedCents:null,reasons:[] as string[],marginNowPct:null,marginNewPct:null,targetMarginPct:target};
 if(!['9','21'].includes(i.vat))return {...base,problem:'Btw ontbreekt.'};
 if(i.costCents===null||!(i.costCents>0))return {...base,problem:'Geen inkoopprijs: koppel een factuur of vul een geschatte prijs in bij het ingrediënt.'};
 if(!(i.priceCents>0))return {...base,problem:'Nog geen verkoopprijs.'};
 const reasons:string[]=[];
 let cents=priceFor(i.costCents,i.vat,target);
 if(i.previousCostCents&&i.previousCostCents>0&&Math.abs(i.costCents/i.previousCostCents-1)>=0.005)reasons.push(`Inkoop ${pct(i.costCents/i.previousCostCents-1)}${i.costNote?` (${i.costNote})`:''}`);
 const weeks=i.stock!==null&&i.soldPerWeek>0?i.stock/i.soldPerWeek:i.stock!==null&&i.stock>0?Infinity:null;
 if(i.fasterSale&&i.stock!==null&&i.stock>0&&weeks!==null&&weeks>RULES.fasterSaleWeeks){cents*=1-RULES.fasterSalePct/100;reasons.push(`Mag sneller weg: ${weeks===Infinity?'er is de laatste weken niets verkocht':`voorraad voor ${Math.round(weeks)} weken`}`)}
 else if(i.stock!==null&&i.stock>0&&weeks!==null&&weeks>RULES.slowWeeks){cents*=1-RULES.slowPct/100;reasons.push(`Ligt stil: ${weeks===Infinity?'de laatste weken niets verkocht':`voorraad voor ${Math.round(weeks)} weken`}`)}
 else if(i.soldPerWeek>=RULES.fastPerWeek&&(weeks===null||weeks<RULES.fastWeeks)){cents*=1+RULES.fastPct/100;reasons.push(`Verkoopt snel (${Math.round(i.soldPerWeek)} per week)`)}
 const lo=i.priceCents*(1-RULES.maxStepPct/100),hi=i.priceCents*(1+RULES.maxStepPct/100);
 if(cents<lo){cents=lo;reasons.push(`Begrensd op ${RULES.maxStepPct}% per keer`)}
 if(cents>hi){cents=hi;reasons.push(`Begrensd op ${RULES.maxStepPct}% per keer`)}
 let proposed=roundHalf(cents);
 const floor=priceFor(i.costCents,i.vat,RULES.minMarginPct);
 if(proposed<floor)proposed=Math.ceil(floor/RULES.roundCents)*RULES.roundCents;
 const now=margin(i.priceCents,i.vat,i.costCents);
 if(proposed===i.priceCents)return {...base,marginNowPct:now,problem:null};
 if(!reasons.length||reasons.every(r=>r.startsWith('Begrensd')))reasons.unshift(`Marge nu ${now}%, doel ${target}%`);
 return {proposedCents:proposed,reasons,marginNowPct:now,marginNewPct:margin(proposed,i.vat,i.costCents),targetMarginPct:target,problem:null};
}

/** Laatste twee factuurprijzen per stuk van een ingrediënt, voor de uitleg „Inkoop +8% (factuur …)”. */
export function costTrend(invoices:{supplier:string;number:string;date:string;reviewed:boolean;lines:{kind:string;ingredientId:string;quantity:number;netCents:number}[]}[],ingredientId:string){
 const prices=invoices.filter(v=>v.reviewed).flatMap(v=>v.lines.filter(l=>l.kind==='product'&&l.ingredientId===ingredientId&&l.quantity>0).map(l=>({date:v.date,supplier:v.supplier,unitCents:l.netCents/l.quantity}))).sort((a,b)=>b.date.localeCompare(a.date));
 if(prices.length<2)return null;
 const [d,m]=[prices[0].date.slice(8,10),prices[0].date.slice(5,7)];
 return {previousCents:prices[1].unitCents,note:`factuur ${prices[0].supplier} ${d}-${m}`};
}
