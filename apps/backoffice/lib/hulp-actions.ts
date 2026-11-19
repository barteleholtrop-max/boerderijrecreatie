// Uitvoeren van een actie van de Backoffice-assistent (en de Weekassistent). Sinds 13 november 2026 direct (wens eigenaar: de
// assistent heeft alle rechten); een oude klaargezette actie kan nog met de knop Uitvoeren.
// Elke actie gaat via dezelfde backoffice-route als de knop op het scherm (zelfde controles, sloten, versiecontrole en
// vervolgacties zoals de Google-profielsynchronisatie). Vlak voor het uitvoeren worden de actuele gegevens opnieuw gelezen, zodat
// een wijziging van een collega intussen nooit wordt overschreven. Alleen de routes in ALLOWED_ROUTES zijn bereikbaar, en per
// route alleen de hier uitgeschreven acties: producten, openingstijden, gasten en de factuurmail van een rekening.
// De kassa en betalingen zitten er niet bij.
import type {Action} from './hulp-tools';

export const ALLOWED_ROUTES=['products','gasten','rekeningen'] as const;
export type Route=typeof ALLOWED_ROUTES[number];
export type RouteResult={ok:boolean;status:number;data:Record<string,unknown>};
export type Hours={open:boolean;from:string;to:string};
export type ActionDeps={
 post(route:Route,body:Record<string,unknown>):Promise<RouteResult>;
 product(id:string):Promise<{version:number;draft:Record<string,unknown>;published?:boolean}|null>;
 guest():Promise<{version:number;hours:Hours[];exceptions:{date:string;hours:Hours;note:string}[];reservations?:Record<string,unknown>[]}>;
 uuid():string;
};
export class ActionError extends Error{}
const JS_WEEKDAY:Record<string,number>={zondag:0,maandag:1,dinsdag:2,woensdag:3,donderdag:4,vrijdag:5,zaterdag:6};

async function call(deps:ActionDeps,route:Route,body:Record<string,unknown>){
 if(!ALLOWED_ROUTES.includes(route))throw new ActionError('Deze route is niet toegestaan voor de assistent.');
 const r=await deps.post(route,body);
 if(!r.ok||r.data.error)throw new ActionError(String(r.data.error||'De backoffice weigerde deze wijziging ('+r.status+').'));
 return r.data;
}
const s=(v:unknown)=>typeof v==='string'?v:'';

/** Voert één actie uit. Geeft een korte Nederlandse uitkomst, of gooit ActionError met de reden van de backoffice. */
export async function executeAction(a:Pick<Action,'type'|'input'>,deps:ActionDeps):Promise<string>{
 const i=a.input;
 switch(a.type){
 case 'factuur_mailen':{const r=await call(deps,'rekeningen',{action:'mail',id:i.id});return r.kind==='voldaan'?'Bevestiging van betaling verstuurd.':'Factuur verstuurd.';}
 case 'product_aanmaken':{
  const product={name:s(i.name).trim(),department:s(i.department),priceCents:i.priceCents,vat:s(i.vat),station:'',available:true,photo:'',note:s(i.note),check:'',sourceId:''};
  if(i.publish===true){await call(deps,'products',{action:'create-publish',product});return 'Product aangemaakt en gepubliceerd: het staat online voor gasten.'}
  await call(deps,'products',{action:'create',product});return 'Product als concept aangemaakt (nog niet zichtbaar voor gasten).';
 }
 case 'product_tekst_wijzigen':
 case 'product_wijzigen':{
  const p=await deps.product(s(i.productId));if(!p)throw new ActionError('Product niet gevonden.');
  const product={...p.draft,...(typeof i.name==='string'?{name:i.name.trim()}:{}),...(typeof i.note==='string'?{note:i.note}:{}),
   ...(typeof i.priceCents==='number'?{priceCents:i.priceCents}:{}),...(typeof i.vat==='string'?{vat:i.vat}:{}),...(typeof i.available==='boolean'?{available:i.available}:{})};
  // Een gepubliceerd product meteen opnieuw publiceren, zodat de wijziging ook voor gasten geldt.
  if(p.published){await call(deps,'products',{action:'publish',id:i.productId,version:p.version,product});return 'Product gewijzigd en meteen gepubliceerd.'}
  await call(deps,'products',{action:'save',id:i.productId,version:p.version,product});return 'Product gewijzigd (concept, niet gepubliceerd).';
 }
 case 'product_publiceren':{
  const p=await deps.product(s(i.productId));if(!p)throw new ActionError('Product niet gevonden.');
  if(i.publish===true){await call(deps,'products',{action:'publish',id:i.productId,version:p.version,product:p.draft});return 'Product gepubliceerd: het staat online voor gasten.'}
  await call(deps,'products',{action:'unpublish',id:i.productId,version:p.version});return 'Product offline gehaald. Het concept blijft bewaard.';
 }
 case 'openingstijden_wijzigen':{
  const g=await deps.guest(),day=JS_WEEKDAY[s(i.weekday)];if(day===undefined)throw new ActionError('Onbekende weekdag.');
  const hours=g.hours.map((h,n)=>n===day?{open:i.open===true,from:s(i.from),to:s(i.to)}:h);
  await call(deps,'gasten',{action:'hours',hours,version:g.version,requestId:deps.uuid()});return 'Openingstijden aangepast.';
 }
 // Gasten (wens eigenaar 9 november 2026): klantenkaart, afspraak en optie, via dezelfde route als de knoppen in Gesprekken
 // en Planning. Nooit een bevestigde boeking, offerte, aanbetaling of factuur.
 case 'klant_aanmaken':{const g=await deps.guest();
  await call(deps,'gasten',{action:'customer',customer:{id:deps.uuid(),name:s(i.name),email:s(i.email),phone:s(i.phone),company:s(i.company),address:s(i.address),notes:s(i.notes)},version:g.version,requestId:deps.uuid()});return 'Klantenkaart aangemaakt. Je vindt hem bij Gesprekken & klanten → Klanten.'}
 case 'klantgesprek_inplannen':{const g=await deps.guest();
  await call(deps,'gasten',{action:'appointment',appointment:{id:deps.uuid(),date:s(i.date),from:s(i.from),to:s(i.to),subject:s(i.subject),customerId:s(i.customerId),customerName:s(i.customerName),notes:s(i.notes),created:'',createdBy:''},version:g.version,requestId:deps.uuid()});return 'Afspraak staat in de weekagenda bij Planning (en in de Klanten-agenda als die gekoppeld is).'}
 case 'optie_zetten':{const g=await deps.guest(),confirmed=i.status==='bevestigd',exception=s(i.exception).trim();
  // Een optie vervalt aan het eind van de gekozen dag (Nederlandse tijd). Een uitzondering (besloten groep op een dag dat het
  // onderdeel uit staat) gaat met de reden mee en staat zo in de agenda; daggasten blijven dicht.
  await call(deps,'gasten',{action:'reservation',reservation:{id:deps.uuid(),name:s(i.name),email:s(i.email),phone:s(i.phone),activity:i.activity==='bezoek'?'bezoek':'groep',date:s(i.date),from:s(i.from),to:s(i.to),people:Number(i.people)||1,sharing:false,status:confirmed?'bevestigd':'optie',expires:confirmed?'':s(i.expiresDay)+'T22:00:00.000Z',notes:s(i.notes),threadId:'',tables:[],customerId:s(i.customerId),...(exception?{exception}:{}),...(exception&&i.override===true?{override:true}:{})},version:g.version,requestId:deps.uuid()});
  return (confirmed?'Bevestigde boeking':'Optie')+' staat in Planning, gekoppeld aan de klantenkaart.'+(i.override===true?' Met voorrang buiten de gewone regels, met de reden in de agenda; de openingstijden voor daggasten zijn niet veranderd.':exception?' Als uitzondering, met de reden in de agenda; de dag blijft dicht voor daggasten.':'')+' Geen offerte en geen factuur.'}
 case 'groepsdag_instellen':{const g=await deps.guest();
  await call(deps,'gasten',{action:'group-day',groupDay:{date:s(i.date),from:s(i.from),to:s(i.to),note:s(i.note)},version:g.version,requestId:deps.uuid()});
  return 'Groepsdag staat in Planning: groepen welkom, dicht voor daggasten en online reserveringen. De rest van de gesloten periode is ongewijzigd.'}
 case 'boeking_bevestigen':{const g=await deps.guest(),r=(g.reservations||[]).find(x=>x.id===i.reservationId);
  if(!r)throw new ActionError('Deze boeking bestaat niet (meer). Kijk opnieuw in de agenda.');
  if(r.status==='bevestigd')return 'Deze boeking was al bevestigd.';
  if(r.status==='geannuleerd')throw new ActionError('Deze boeking is geannuleerd. Zet eerst een nieuwe optie.');
  const note=s(i.note).trim();
  await call(deps,'gasten',{action:'reservation',reservation:{...r,status:'bevestigd',expires:'',...(note?{notes:[s(r.notes),'Bevestigd: '+note].filter(Boolean).join('\n')}:{})},version:g.version,requestId:deps.uuid()});
  return 'Boeking bevestigd in Planning.'}
 case 'afwijkende_dag':{
  const g=await deps.guest();
  await call(deps,'gasten',{action:'exception',exception:{date:i.date,hours:{open:i.open===true,from:s(i.from),to:s(i.to)},note:s(i.note)},version:g.version,requestId:deps.uuid()});return 'Afwijkende dag ingesteld.';
 }
 }
 throw new ActionError('Deze actie kan de assistent niet uitvoeren.');
}
