// Leverancier in de coöperatieve winkel (wensen eigenaar 5 november 2026): pure regels, los te testen.
// - „Je bent bijna uitverkocht”: een pushbericht als de voorraad van een eigen product onder de grens zakt (standaard 3).
// - Zondagmiddag: „nog zoveel voorraad, wil je er een aanbieding van maken?” (aanbieding zelf: lib/offer-core.ts).
// - Maandag bij bederfelijke producten: „Wat wil je met de oude voorraad?” a. mag weg, b. ik kom het ophalen.
import {validOffer} from './offer-core';
export const SUPPLIER_LOW_DEFAULT=3;
export const SUNDAY_ASK_HOUR=12,MONDAY_ASK_HOUR=9;
export type OldStockChoice='weg'|'ophalen';
export const OLD_STOCK_LABEL:Record<OldStockChoice,string>={weg:'Mag weg',ophalen:'Ik kom het ophalen'};
/** Grens voor „bijna uitverkocht”: wat de leverancier instelde (lowAt), anders 3. */
export const lowFor=(p:{lowAt?:unknown})=>Number.isInteger(p.lowAt)&&Number(p.lowAt)>=0?Number(p.lowAt):SUPPLIER_LOW_DEFAULT;
/** Een bericht alleen op het moment dat de grens wordt gepasseerd, niet bij elke verkoop daarna. */
export function lowStockMessage(name:string,before:number,after:number,lowAt:number):{title:string;body:string}|null{
 if(after>=before)return null;
 if(after<=0&&before>0)return {title:`${name} is uitverkocht`,body:`Alles van ${name} is verkocht. Meld een nieuwe levering op je ledenpagina.`};
 if(before>lowAt&&after<=lowAt)return {title:'Je bent bijna uitverkocht',body:`Nog ${after} van ${name} op voorraad. Breng je binnenkort nieuwe?`};
 return null;
}
const parts=(now:Date)=>{const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return {weekday:f.find(p=>p.type==='weekday')?.value||'',hour:Number(f.find(p=>p.type==='hour')?.value||0)}};
export const amsterdamDay=(now:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now);
/** Zondag vanaf 12:00: tijd om te vragen of de leverancier een aanbieding wil (die gaat om 15:00 in). */
export const sundayAskDue=(now:Date)=>{const t=parts(now);return t.weekday==='Sun'&&t.hour>=SUNDAY_ASK_HOUR};
/** Maandag vanaf 9:00: de vraag over de oude voorraad van bederfelijke producten. */
export const mondayAskDue=(now:Date)=>{const t=parts(now);return t.weekday==='Mon'&&t.hour>=MONDAY_ASK_HOUR};
/** Vrijdag vanaf 12:00: het weekbericht met de open diensten van de komende week (keuze eigenaar 6 november 2026). */
export const fridayWeekMessageDue=(now:Date)=>{const t=parts(now);return t.weekday==='Fri'&&t.hour>=12};
/** De vraag over oude voorraad staat open op maandag en dinsdag, voor bederfelijke producten met voorraad, tot er een antwoord is. */
export const oldStockWindow=(now:Date)=>{const w=parts(now).weekday;return w==='Mon'||w==='Tue'};
/** Wat de leverancier per product zelf instelt. Gooit een Nederlandse melding. */
export function parseOptions(raw:unknown){
 const b=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const offer=b.offer===null||b.offer===undefined?null:b.offer;
 if(offer!==null&&!validOffer(offer))throw Error('Kies voor de zondagaanbieding een percentage van 10 tot en met 95 en een geldige tijd (bijvoorbeeld 15:00).');
 if(b.lowAt!==undefined&&(!Number.isInteger(b.lowAt)||Number(b.lowAt)<0||Number(b.lowAt)>999))throw Error('Kies bij „bijna op” een aantal van 0 tot en met 999.');
 if(b.perishable!==undefined&&typeof b.perishable!=='boolean')throw Error('Ongeldige keuze bij bederfelijk.');
 return {offer:offer?{percent:(offer as {percent:number}).percent,...(typeof (offer as {from?:string}).from==='string'?{from:(offer as {from:string}).from}:{})}:null,lowAt:b.lowAt===undefined?undefined:Number(b.lowAt),perishable:b.perishable as boolean|undefined};
}
