// Eén omzetregel voor alle schermen (besluit eigenaar 4 november 2026, uit de analyse dubbele processen).
// - Telt mee: elke vastgelegde bestelling, behalve een online bestelling die nog op betaling wacht (of waarvan de betaling
//   mislukte) en een terugbetaalde bestelling. Dezelfde regel als de coöperatieverdeling (lib/coop-store.ts).
// - Bedrag: wat echt betaald is. Bij "Jou wat goed fielt" het gekozen bedrag met de btw daarover; anders de normale prijs.
// De status staat in de kolommen van `orders`; de JSON in `orders.data` is alleen de historische vastlegging van de regels.
export const AWAITING_PAYMENT='wacht-op-betaling';
export function countsAsRevenue(o:{status:string;paymentStatus:string}){return o.status!==AWAITING_PAYMENT&&o.paymentStatus!=='terugbetaald'}
export type Payable={totalCents:number;vat9Cents:number;vat21Cents:number;chosenCents:number|null;chosenVat9Cents:number|null;chosenVat21Cents:number|null};
/** Het betaalde bedrag incl. btw en de btw per tarief van een bestelling. */
export function paidAmounts(o:Payable){
 if(o.chosenCents===null||o.chosenCents===undefined)return {cents:o.totalCents,vat9:o.vat9Cents,vat21:o.vat21Cents};
 return {cents:o.chosenCents,vat9:o.chosenVat9Cents??0,vat21:o.chosenVat21Cents??0};
}
/** Leesbare status voor de backoffice. */
export function statusLabel(o:{status:string;paymentStatus:string}){
 if(o.status===AWAITING_PAYMENT)return 'Wacht op betaling';
 if(o.paymentStatus==='terugbetaald')return 'Terugbetaald';
 if(o.paymentStatus==='betaald')return 'Betaald';
 if(o.paymentStatus==='op-rekening')return 'Op groepsrekening';
 if(o.paymentStatus==='nul-bedrag')return 'Zonder betaling (€ 0)';
 return 'Vastgelegd';
}
