// Eigen bedrag en groepscode bij bestellen (besluit eigenaar, 3 november 2026: "zoals voorgesteld").
//
// Eigen bedrag ("Wat is het je waard?"):
// - De gast ziet eerst de normale (commerciële) waarde; die blijft de standaard. Daarna mag hij zelf een bedrag kiezen.
// - Alleen in verkoopcontexten waar de beheerder het aanzet. Eerst alleen online bestellen via de website.
// - Grenzen: vanaf € 0,00 (nul mag, wordt gemarkeerd) tot het ingestelde maximum, standaard 300% van de normale waarde.
// - Het gekozen bedrag wordt per regel naar verhouding verdeeld (grootste rest, telt altijd exact op).
// - Btw over wat werkelijk betaald wordt, per regel met het tarief van het product. Laat dit bevestigen door de boekhouder.
// - Normale waarde, gekozen bedrag, verschil en verkoopcontext worden apart bewaard.
//
// Groepscode (bijvoorbeeld het feest van opa):
// - Een gastheer krijgt een code en een link; gasten bestellen daarmee op zijn rekening. Alleen de gastheer betaalt.
// - Hij koppelt er een maximumbedrag aan. Een bestelling die het budget zou overschrijden, wordt geweigerd.
// - Op groepsrekening betalen gasten niets; het eigen bedrag geldt dan niet (de gastheer rekent af).
import type {SaleLine} from './orders';

export const SALES_CONTEXTS={website:'Online bestellen (website)'} as const;
export type SalesContext=keyof typeof SALES_CONTEXTS;
export type OwnAmountSetting={context:SalesContext;enabled:boolean;maxPercent:number;allowZero:boolean};
export const DEFAULT_SETTING=(context:SalesContext):OwnAmountSetting=>({context,enabled:false,maxPercent:300,allowZero:true});
export const MAX_ORDER_CENTS=1_000_000;

export function validSetting(v:unknown):v is OwnAmountSetting{
 const s=v as OwnAmountSetting;
 return !!s&&typeof s==='object'&&Object.hasOwn(SALES_CONTEXTS,s.context)&&typeof s.enabled==='boolean'&&typeof s.allowZero==='boolean'
  &&Number.isInteger(s.maxPercent)&&s.maxPercent>=100&&s.maxPercent<=1000;
}

/** Highest amount a guest may choose for a given normal value. */
export function maxChosen(commercialCents:number,setting:OwnAmountSetting){return Math.floor(commercialCents*setting.maxPercent/100)}

/** Checks a guest's own amount; throws a friendly Dutch message. null/undefined = pay the normal value. */
export function checkChosen(chosen:unknown,commercialCents:number,setting:OwnAmountSetting|null):number|null{
 if(chosen===null||chosen===undefined)return null;
 if(!setting?.enabled)throw Error('Een eigen bedrag kiezen kan hier nu niet. Je betaalt de normale prijs.');
 if(!Number.isSafeInteger(chosen)||(chosen as number)<0)throw Error('Kies een bedrag vanaf € 0,00.');
 const c=chosen as number;
 if(c===0&&!setting.allowZero)throw Error('Kies een bedrag hoger dan € 0,00.');
 if(c>maxChosen(commercialCents,setting))throw Error('Dat bedrag is hoger dan we online aannemen ('+euro(maxChosen(commercialCents,setting))+'). Bedankt voor je gulheid! Vraag het gerust aan een van ons.');
 if(c>MAX_ORDER_CENTS)throw Error('Dit bedrag kan niet online worden besteld. Vraag het aan een van ons.');
 return c;
}

/** Largest remainder: shares proportional to the weights, in whole cents, always summing to amount (ties keep line order). */
export function allocate(weights:number[],amount:number):number[]{
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Ongeldig bedrag.');
 if(!weights.length||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw Error('Ongeldige verdeling.');
 const sum=weights.reduce((a,b)=>a+b,0);
 if(sum===0){if(amount!==0)throw Error('Geen waarde om dit bedrag over te verdelen.');return weights.map(()=>0)}
 const den=BigInt(sum),num=weights.map(w=>BigInt(w)*BigInt(amount));
 const parts=num.map(n=>Number(n/den));
 const order=num.map((n,i)=>({i,r:n%den})).sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1);
 let rest=amount-parts.reduce((a,b)=>a+b,0);
 for(let k=0;rest>0;k++,rest--)parts[order[k].i]++;
 return parts;
}

export const vatOf=(cents:number,rate:string)=>Math.round(cents*Number(rate)/(100+Number(rate)));

export type Valuation={commercialCents:number;chosenCents:number;differenceCents:number;zero:boolean;
 lines:{paidCents:number;paidVatCents:number}[];vat9Cents:number;vat21Cents:number};
/** What is actually paid, per line and in total, with VAT over the paid amount. */
export function valuation(lines:SaleLine[],chosen:number|null):Valuation{
 const commercialCents=lines.reduce((s,l)=>s+l.totalCents,0),chosenCents=chosen??commercialCents;
 const paid=allocate(lines.map(l=>l.totalCents),chosenCents);
 const out=lines.map((l,i)=>({paidCents:paid[i],paidVatCents:vatOf(paid[i],l.vat)}));
 const sum=(rate:string)=>out.filter((_,i)=>lines[i].vat===rate).reduce((s,x)=>s+x.paidVatCents,0);
 return {commercialCents,chosenCents,differenceCents:chosenCents-commercialCents,zero:chosenCents===0,lines:out,vat9Cents:sum('9'),vat21Cents:sum('21')};
}

// ---- Groepscode
const ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L: easy to read aloud and type
export const CODE_PATTERN=/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export function newGroupCode(random:(n:number)=>Uint8Array=n=>crypto.getRandomValues(new Uint8Array(n))){
 const out:string[]=[];
 while(out.length<8){for(const b of random(16)){if(b<248&&out.length<8)out.push(ALPHABET[b%31])}} // 248 = 8×31: no bias
 return out.join('');
}
/** Accepts what a guest types or scans: spaces, dashes and lower case are fine. */
export function normalizeCode(v:unknown){if(typeof v!=='string')return null;const c=v.toUpperCase().replace(/[\s-]/g,'');return CODE_PATTERN.test(c)?c:null}

export type GroupCode={id:string;code:string;name:string;host:string;budgetCents:number;validFrom:string;validUntil:string;status:'actief'|'gesloten';version:number};
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
export function validGroupInput(v:unknown):v is Pick<GroupCode,'name'|'host'|'budgetCents'|'validFrom'|'validUntil'>{
 const g=v as GroupCode;
 return !!g&&typeof g==='object'&&typeof g.name==='string'&&g.name.trim().length>0&&g.name.length<=80&&typeof g.host==='string'&&g.host.length<=80
  &&Number.isSafeInteger(g.budgetCents)&&g.budgetCents>0&&g.budgetCents<=MAX_ORDER_CENTS&&day(g.validFrom)&&day(g.validUntil)&&g.validFrom<=g.validUntil;
}
/** Why a group code cannot be used now, or null if it can (dates in Europe/Amsterdam). */
export function groupProblem(g:GroupCode|null,today:string):string|null{
 if(!g)return 'Deze groepscode kennen we niet. Kijk de code nog even na.';
 if(g.status!=='actief')return 'Deze groepscode is gesloten. Vraag het aan de gastheer of aan een van ons.';
 if(today<g.validFrom)return 'Deze groepscode is pas geldig vanaf '+g.validFrom.split('-').reverse().join('-')+'.';
 if(today>g.validUntil)return 'Deze groepscode is verlopen.';
 return null;
}
export function budgetProblem(spentCents:number,orderCents:number,budgetCents:number){
 return spentCents+orderCents>budgetCents?'Het budget van deze groep is bereikt. Vraag het aan de gastheer of bestel en betaal zelf.':null;
}
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
