// Owner decision 2 November 2026: everything 9% VAT, only alcoholic drinks 21%.
// A suggestion only: the owner reviews the list; nothing is published automatically.
// Alcohol-free variants (0.0 / 0,0% / alcoholvrij) stay 9%; bitterballen, bitter lemon and wine vinegar are no alcohol.
const ALCOHOL=/\b(bier|pils|pilsener|witbier|blondbier|bokbier|tripel|dubbel|weizen|ipa|radler|kriek|cider|wijn|wine|ros[ée]|prosecco|cava|champagne|cr[ée]mant|port|sherry|vermouth|gin|whisky|whiskey|rum|vodka|likeur|jenever|beerenburg|brandy|cognac|amaretto|baileys|aperol|spritz|limoncello|sambuca|alcohol)\b/i;
const ALCOHOL_IN_WORD=/(bier|wijn)(?!azijn)/i;
const ALCOHOL_FREE=/\b0[.,]0\b|0[.,]0\s*%|\balcoholvrij|\bzonder alcohol|\b0\s*%/i;
const NOT_ALCOHOL_SRC='bitterbal\\w*|bitter\\s*lemon|bittergarnituur|wijn\\s*azijn|azijn|wijngum|druivensap';
const NOT_ALCOHOL=new RegExp(NOT_ALCOHOL_SRC,'i');
const withoutLookalikes=(n:string)=>n.replace(new RegExp(NOT_ALCOHOL_SRC,'gi'),' ');
export type VatSuggestion={vat:'9'|'21';reason:string;check:boolean};
export function suggestVat(name:string):VatSuggestion{
 const n=name.trim();
 const rest=withoutLookalikes(n);
 if(NOT_ALCOHOL.test(n)&&!ALCOHOL.test(rest)&&!ALCOHOL_IN_WORD.test(rest))return {vat:'9',reason:'Geen alcohol',check:false};
 const alcoholic=ALCOHOL.test(rest)||ALCOHOL_IN_WORD.test(rest);
 if(!alcoholic)return {vat:'9',reason:'Eten, drinken of product zonder alcohol',check:false};
 if(ALCOHOL_FREE.test(n))return {vat:'9',reason:'Alcoholvrij (0.0)',check:false};
 // A package with alcohol plus other products is a mixed supply: the rate has to be checked by hand.
 if(/pakket|box|borrel/i.test(n))return {vat:'21',reason:'Pakket met alcohol: zelf controleren (gemengde levering)',check:true};
 return {vat:'21',reason:'Alcoholhoudende drank',check:false};
}
