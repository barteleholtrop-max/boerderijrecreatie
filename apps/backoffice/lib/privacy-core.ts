// Privacy voor alle sites (wens eigenaar 15 november 2026: „een algemene privacypagina in de backoffice; alle websites die we
// gaan bouwen moeten deze regels hier ophalen”). Eén tekst, beheerd bij Marketing & website → Privacy · alle sites. Elke site
// leest hem via de vaste poort GET /api/public/v1/privacy (zie docs/PRIVACY-ALLE-SITES.md); geen eigen kopie op een site.
//
// Dit bestand rekent alleen (geen databasevragen); opslaan en lezen staat in lib/privacy.ts.
// Bedrijfsnaam, adres, KvK en e-mail staan niet in de tekst: die komen bij het lezen uit Bedrijfsgegevens, via {bedrijfsnaam},
// {adres}, {kvk} en {email}. Zo hoeft een verhuizing of nieuw mailadres maar op één plek te worden aangepast.
import {blocks,type Block} from './text-blocks';

export class PrivacyError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

export type Section={heading:string;text:string};
export type Policy={title:string;intro:string;effectiveFrom:string;sections:Section[]};
export type Controller={name:string;street:string;postalCode:string;city:string;kvk:string;email:string};

export const PLACEHOLDERS={bedrijfsnaam:'Handelsnaam',adres:'Straat, postcode en plaats',kvk:'KvK-nummer',email:'E-mailadres'} as const;
export const LIMITS={title:120,intro:4000,heading:120,text:12000,sections:40} as const;

/** Beginwaarde zolang er nog niets is opgeslagen: het privacybeleid dat al op de website stond, algemeen gemaakt voor alle sites. */
export const DEFAULT_POLICY:Policy={
 title:'Privacybeleid',
 intro:'{bedrijfsnaam}, {adres} (KvK {kvk}) is verantwoordelijk voor de gegevens die je via onze websites, WhatsApp, Messenger en Instagram met ons deelt. Dit privacybeleid geldt voor al onze websites.',
 effectiveFrom:'2026-11-15',
 sections:[
  {heading:'Welke gegevens',text:'Als je een aanvraag doet, iets bestelt of je ergens voor aanmeldt, ontvangen we je naam, e-mailadres, telefoonnummer, de gewenste datum en wat je zelf in het bericht zet. Een allergie of dieetwens gebruiken we alleen om daar bij je bezoek rekening mee te houden.'},
  {heading:'Waarvoor',text:'We gebruiken deze gegevens alleen om je aanvraag te beantwoorden, je bestelling of reservering te regelen en je bezoek voor te bereiden. We verkopen niets door en sturen je geen nieuwsbrief zonder je toestemming.'},
  {heading:'Hoe lang',text:'We bewaren aanvragen via de website niet langer dan nodig, en uiterlijk een jaar na je bezoek. Gegevens die we volgens de wet langer moeten bewaren, zoals die op facturen, bewaren we zo lang als de wet dat vraagt.'},
  {heading:'Berichten via WhatsApp, Messenger en Instagram',text:'Stuur je ons een bericht via WhatsApp, Facebook Messenger of Instagram, dan ontvangen we je bericht, je naam of profielnaam zoals je die daar gebruikt, je telefoonnummer (bij WhatsApp) of een nummer waarmee Meta jouw account aanduidt (bij Messenger en Instagram), en de foto\'s, spraakberichten, video\'s en documenten die je meestuurt. Reacties onder onze berichten en openbare posts verwerken we hier niet.\n\nWe gebruiken deze berichten alleen om je vraag te beantwoorden, je bestelling, reservering of bezoek te regelen en je bij een volgend contact goed te kunnen helpen. Daarvoor bewaren we het gesprek in ons eigen klantensysteem, bij je klantgegevens. Alleen medewerkers die je vraag afhandelen kunnen het lezen. We sturen je via deze kanalen geen reclame en gebruiken de berichten niet voor advertenties.\n\nWhatsApp, Messenger en Instagram zijn diensten van Meta. Meta verwerkt je berichten ook zelf, volgens het privacybeleid van Meta.\n\nWe bewaren deze gesprekken zolang je klant of gast bij ons bent, zodat we eerdere afspraken en vragen kunnen terugzien. Wil je dat we een gesprek eerder verwijderen, laat het ons weten; dan verwijderen we het uit ons klantensysteem. Wat bij Meta zelf staat, verwijder je in je eigen app.'},
  {heading:'Waar je gegevens staan',text:'Ons klantensysteem draait op servers van Google Cloud en Supabase binnen de Europese Unie. Betaal je online, dan verloopt de betaling via Mollie; Mollie ontvangt daarvoor de gegevens die nodig zijn om de betaling af te handelen.'},
  {heading:'Cookies en filmpjes',text:'Onze websites plaatsen geen tracking- of advertentiecookies. Filmpjes op onze websites komen van YouTube (zonder volgcookies) of Vimeo en laden pas als je zelf op afspelen klikt.'},
  {heading:'Inzien of verwijderen',text:'Wil je weten welke gegevens we van je hebben, ook uit gesprekken via WhatsApp, Messenger of Instagram, of wil je ze laten verwijderen of verbeteren? Mail naar {email}. Ben je het niet eens met hoe we met je gegevens omgaan, dan kun je ook een klacht indienen bij de Autoriteit Persoonsgegevens.'},
 ],
};

const text=(v:unknown,max:number,label:string,required=true)=>{
 const s=String(v??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
 if(required&&!s)throw new PrivacyError(`Vul ${label} in.`);
 if(s.length>max)throw new PrivacyError(`${label[0].toUpperCase()+label.slice(1)} is te lang (hooguit ${max} tekens).`);
 return s;
};
const isDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;

/** Controleert wat de beheerder invult. Geen HTML: de sites zetten alles als gewone tekst neer. */
export function normalizePolicy(input:unknown):Policy{
 const b=(input&&typeof input==='object'?input:{}) as Record<string,unknown>;
 const title=text(b.title,LIMITS.title,'de titel'),intro=text(b.intro,LIMITS.intro,'de inleiding',false);
 const effectiveFrom=String(b.effectiveFrom??'').trim();
 if(!isDate(effectiveFrom))throw new PrivacyError('Vul een geldige datum in bij „Geldt vanaf”.');
 if(!Array.isArray(b.sections)||!b.sections.length)throw new PrivacyError('Het privacybeleid heeft minstens één onderdeel nodig.');
 if(b.sections.length>LIMITS.sections)throw new PrivacyError(`Hooguit ${LIMITS.sections} onderdelen.`);
 const sections=b.sections.map((s,i)=>{const o=(s&&typeof s==='object'?s:{}) as Record<string,unknown>;
  return {heading:text(o.heading,LIMITS.heading,`de kop van onderdeel ${i+1}`),text:text(o.text,LIMITS.text,`de tekst van onderdeel ${i+1}`)}});
 return {title,intro,effectiveFrom,sections};
}

/** Opgeslagen JSON terug naar een beleid; bij iets onleesbaars de beginwaarde, nooit een fout naar de gast. */
export function parsePolicy(json:string|null|undefined):Policy{
 try{return normalizePolicy(JSON.parse(String(json)))}catch{return DEFAULT_POLICY}
}

/** Vult {bedrijfsnaam}, {adres}, {kvk} en {email} in met de gegevens uit Bedrijfsgegevens. Onbekende woorden blijven staan. */
export function fill(s:string,c:Controller){
 const address=[c.street,[c.postalCode,c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 const values:Record<keyof typeof PLACEHOLDERS,string>={bedrijfsnaam:c.name,adres:address,kvk:c.kvk,email:c.email};
 return s.replace(/\{(bedrijfsnaam|adres|kvk|email)\}/g,(_,k:keyof typeof PLACEHOLDERS)=>values[k]);
}

export type PublicPolicy={versie:1;title:string;intro:Block[];effectiveFrom:string;updated:string;controller:Controller;sections:{heading:string;blocks:Block[]}[]};
/** Het antwoord van de poort, versie 1. Een contract: velden komen erbij, maar verdwijnen of veranderen niet. Wie het opsloeg,
 *  het versienummer en andere interne kenmerken gaan nooit naar buiten. */
export function publicPolicy(p:Policy,c:Controller,updated:string):PublicPolicy{
 return {versie:1,title:fill(p.title,c),intro:blocks(fill(p.intro,c)),effectiveFrom:p.effectiveFrom,updated:updated?updated.slice(0,10):p.effectiveFrom,controller:c,
  sections:p.sections.map(s=>({heading:fill(s.heading,c),blocks:blocks(fill(s.text,c))}))};
}
