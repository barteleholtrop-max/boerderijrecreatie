// Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek voor alles over het bedrijf (pagina /bedrijfsgegevens).
// Zonder database of netwerk: bouwt het profiel uit de opgeslagen contactgegevens. Het IBAN en de tenaamstelling stonden eerst
// bij Systeem & koppelingen → Facturen; een daar al ingevuld IBAN telt mee tot het hier is opgeslagen.
import type {Contact} from './guest-core';
import {normalizeIban} from './nl-core';
export const DEFAULT_TRADE_NAME='Boer Bart';
export type Company={tradeName:string;legalName:string;legalForm:string;owners:string;street:string;postalCode:string;city:string;phone:string;email:string;adminEmail:string;whatsapp:string;website:string;instagram:string;facebook:string;kvk:string;establishmentNumber:string;vatNumber:string;iban:string;ibanName:string;bic:string;ibanFromSettings:boolean};
export function companyProfile(c:Partial<Contact>|undefined,setting:(key:string)=>string|undefined=()=>''):Company{
 const v=(k:keyof Contact)=>String(c?.[k]??'').trim();
 const oldIban=normalizeIban(setting('INVOICE_IBAN')||''),iban=v('iban')||oldIban;
 const tradeName=v('tradeName')||DEFAULT_TRADE_NAME;
 return {tradeName,legalName:v('legalName'),legalForm:v('legalForm'),owners:v('owners'),street:v('street'),postalCode:v('postalCode'),city:v('city'),phone:v('phone'),email:v('email'),adminEmail:v('adminEmail'),whatsapp:v('whatsapp'),website:v('website'),instagram:v('instagram'),facebook:v('facebook'),kvk:v('kvk'),establishmentNumber:v('establishmentNumber'),vatNumber:v('vatNumber'),
  iban,ibanName:v('ibanName')||(v('iban')?'':(setting('INVOICE_ACCOUNT_NAME')||'').trim())||(iban?tradeName:''),bic:v('bic'),ibanFromSettings:!v('iban')&&!!oldIban};
}
/** Naam op facturen: de handelsnaam, met de juridische naam erbij als die anders is. */
//  Een juridische naam die alleen uit cijfers bestaat of gelijk is aan het KvK-nummer is geen naam (het KvK-nummer staat apart op de factuur).
export const invoiceName=(co:Company)=>{const legal=co.legalName.trim();return legal&&legal!==co.tradeName&&legal!==co.kvk&&!/^[\d\s.]+$/.test(legal)?`${co.tradeName} (${legal})`:co.tradeName};
