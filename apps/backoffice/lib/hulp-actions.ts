// Uitvoeren van een actie van de Backoffice-assistent (en de Weekassistent). Sinds 13 november 2026 direct (wens eigenaar: de
// assistent heeft alle rechten); een oude klaargezette actie kan nog met de knop Uitvoeren.
// Elke actie gaat via dezelfde backoffice-route als de knop op het scherm (zelfde controles, sloten, versiecontrole en
// vervolgacties zoals de Google-profielsynchronisatie). Vlak voor het uitvoeren worden de actuele gegevens opnieuw gelezen, zodat
// een wijziging van een collega intussen nooit wordt overschreven. Alleen de routes in ALLOWED_ROUTES zijn bereikbaar, en per
// route alleen de hier uitgeschreven acties. Sinds 18 november 2026 ook Bank en Rekeningen (uitbetalingen, rente, factuurmail; wens
// eigenaar). Bloei (alleen lezen, ook op het scherm), de kassa en weekafsluitingen zitten er niet bij.
import type {Action} from './hulp-tools';

export const ALLOWED_ROUTES=['pot-planning','cooperatie','leden','products','gasten','overleg','leden/afspraken','rollen','bank','rekeningen'] as const;
export type Route=typeof ALLOWED_ROUTES[number];
export type RouteResult={ok:boolean;status:number;data:Record<string,unknown>};
export type Hours={open:boolean;from:string;to:string};
export type ActionDeps={
 post(route:Route,body:Record<string,unknown>):Promise<RouteResult>;
 participant(id:string):Promise<{id:string;name:string;holder:string;email:string;vatInclusive:boolean;active:boolean;version:number}|null>;
 card(id:string):Promise<{version:number;memberClass:string;memberSince:string;voting:string;phone:string;address:string;units:string[];bloeiMemberId:string;potRoles:Record<string,string[]>}|null>;
 product(id:string):Promise<{version:number;draft:Record<string,unknown>;published?:boolean}|null>;
 guest():Promise<{version:number;hours:Hours[];exceptions:{date:string;hours:Hours;note:string}[];reservations?:Record<string,unknown>[]}>;
 contract(memberId:string,contractId:string):Promise<{revision:number;hash:string;templateEditVersion:number;data:{period:string;requestedFrom:string;supplierMode:string;roleText:string;extras:string;protocols:string}}|null>;
 roleContract(pot:string,id:string):Promise<{hash:string}>;
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
 case 'rolcontract_voorstel':{
  const current=await deps.roleContract(s(i.pot),s(i.roleId));if(current.hash!==i.hash)throw new ActionError('De rol of basisafspraken zijn intussen gewijzigd. Lees het concept eerst opnieuw.');
  await call(deps,'rollen',{action:'rolcontract-bewaren',pot:i.pot,id:i.roleId,hash:i.hash,contract:{roleText:i.roleText,period:i.period,protocols:i.protocols,reason:i.reason}});return 'Rolafspraak als concept bewaard. De coöperatieve basis blijft staan. Leg de tekst bij Rollen per pot aan de groep voor; pas daarna wordt dit de standaard voor nieuwe functieafspraken.';
 }
 case 'contract_tekstvoorstel':{
  const current=await deps.contract(s(i.participantId),s(i.contractId));if(!current||current.hash!==i.hash||current.revision!==i.revision)throw new ActionError('Deze afspraak is intussen gewijzigd. Vraag de assistent een nieuw voorstel te maken.');
  if(i.target==='basistekst'){
   if(current.templateEditVersion!==i.templateVersion)throw new ActionError('Er is al een ander basistekstvoorstel. Lees dat eerst opnieuw.');
   await call(deps,'leden/afspraken',{action:'basistekst-rolvoorstel',id:i.contractId,hash:i.hash,version:i.templateVersion,roleText:i.roleText});return 'Nieuw basistekstvoorstel bewaard. De groep moet dit nog goedkeuren; nieuwe leden krijgen tot dan de vastgestelde versie.';
  }
  if(i.target!=='dit_contract')throw new ActionError('Kies de persoonlijke afspraak of de basistekst.');
  await call(deps,'leden/afspraken',{action:'wijzigen',id:i.contractId,revision:i.revision,agreement:{period:current.data.period,requestedFrom:current.data.requestedFrom,supplierMode:current.data.supplierMode,roleText:i.roleText===null?current.data.roleText:i.roleText,extras:i.extras===null?current.data.extras:i.extras,protocols:i.protocols===null?current.data.protocols:i.protocols,reason:i.reason}});return 'Nieuwe versie van de afspraak als concept bewaard. De huidige afspraak blijft gelden tot groepsgoedkeuring, eigen ondertekening en de ingangsdatum.';
 }
 // Rollen per pot (wens eigenaar 6 november 2026): rollen aanmaken of wijzigen; nooit punten (die gaan via een voorstel aan de leden).
 case 'rol_aanmaken':await call(deps,'rollen',{action:'nieuw',pot:i.pot,name:i.name,kind:i.kind});return 'Rol en eigen conceptafspraak aangemaakt. Werk de afspraak bij Rollen per pot uit met gerichte vragen over verantwoordelijkheden. De rol telt voor 0 punten tot de leden een voorstel met punten goedkeuren.';
 case 'rol_wijzigen':await call(deps,'rollen',{action:'wijzig',pot:i.pot,id:i.id,...(typeof i.name==='string'?{name:i.name}:{}),...(typeof i.kind==='string'?{kind:i.kind}:{}),...(typeof i.active==='boolean'?{active:i.active}:{})});return 'Rol gewijzigd.';
 case 'dienst_inplannen':await call(deps,'pot-planning',{action:'inplannen',pot:i.pot,day:i.day,roleId:i.roleId,participantId:i.participantId});return 'Ingepland.';
 case 'dienst_vrijgeven':await call(deps,'pot-planning',{action:'vrijgeven',pot:i.pot,day:i.day,roleId:i.roleId,participantId:i.participantId});return 'Dienst vrijgegeven.';
 case 'bezetting_instellen':await call(deps,'pot-planning',{action:'nodig',pot:i.pot,day:i.day,roleId:i.roleId,count:i.count,...(typeof i.note==='string'?{note:i.note}:{})});return 'Bezetting ingesteld.';
 case 'uitbetaling_beslissen':{
  const rente=i.soort==='rente',ok=i.besluit==='goedkeuren';
  const r=await call(deps,'bank',{action:(rente?'rente-':'uitbetaling-')+(ok?'goedkeuren':'afwijzen'),id:i.id,version:i.version,note:i.note,year:i.year});
  return ok?String(r.message||'De conceptbetaling staat klaar. Bevestig hem in je bunq-app.'):'Afgewezen.';}
 case 'uitbetalingen_klaarzetten':{
  const r=await call(deps,'bank',i.soort==='rente'?{action:'rente-klaarzetten',year:i.year}:{action:'maandagvraag',week:i.week});
  return String(r.message||'Klaargezet.');}
 case 'factuur_mailen':{const r=await call(deps,'rekeningen',{action:'mail',id:i.id});return r.kind==='voldaan'?'Bevestiging van betaling verstuurd.':'Factuur verstuurd.';}
 case 'diensten_melden':{const r=await call(deps,'pot-planning',{action:'melden',pot:i.pot,day:i.day,roleIds:i.roleIds});const m=(r.melding||{}) as {members?:number;sent?:number};return `Gemeld aan ${m.members??0} ${m.members===1?'lid':'leden'} (${m.sent??0} ${m.sent===1?'telefoon':'telefoons'}).`}
 case 'lid_aanmaken':{
  const name=s(i.name).trim();
  // Zelfde aanvraag als „Lid toevoegen” bij Leden & winstdeling: zonder IBAN, niet btw-inclusief, actief.
  const created=await call(deps,'cooperatie',{action:'deelnemer',participant:{name,holder:name,email:s(i.email).trim(),vatInclusive:false,active:true}});
  const id=s(created.id),units=Array.isArray(i.units)?i.units:[];
  if(id&&(s(i.phone)||s(i.address)||s(i.memberSince)||units.length)){
   const c=await deps.card(id);if(!c)return 'Lid aangemaakt, maar de ledenkaart kon niet worden aangevuld. Vul die zelf aan bij Leden & winstdeling.';
   try{await call(deps,'leden',{action:'lid',id,version:c.version,member:{...c,phone:s(i.phone),address:s(i.address),memberSince:s(i.memberSince),units}})}
   catch(e){return `Lid aangemaakt. De ledenkaart is niet aangevuld: ${(e as Error).message}`}
  }
  return 'Lid aangemaakt. Soort lid, IBAN en persoonlijke link stel je zelf in bij Leden & winstdeling.';
 }
 case 'ledenkaart_wijzigen':{
  const id=s(i.participantId);
  if(typeof i.email==='string'){
   const p=await deps.participant(id);if(!p)throw new ActionError('Lid niet gevonden.');
   // Zonder iban-veld: het opgeslagen IBAN blijft ongewijzigd.
   await call(deps,'cooperatie',{action:'deelnemer',participant:{id:p.id,version:p.version,name:p.name,holder:p.holder,email:i.email.trim(),vatInclusive:p.vatInclusive,active:p.active}});
  }
  if(i.phone!==null||i.address!==null||i.units!==null||i.potRoles!==null){
   const c=await deps.card(id);if(!c)throw new ActionError('Lid niet gevonden.');
   // Ledenklasse, stemrecht en Bloei-koppeling blijven precies zoals ze waren.
   const member={memberClass:c.memberClass,memberSince:c.memberSince,voting:c.voting,bloeiMemberId:c.bloeiMemberId,
    phone:i.phone===null?c.phone:s(i.phone),address:i.address===null?c.address:s(i.address),units:i.units===null?c.units:i.units,
    potRoles:i.potRoles===null?c.potRoles:{...c.potRoles,...(i.potRoles as Record<string,string[]>)}};
   await call(deps,'leden',{action:'lid',id,version:c.version,member});
  }
  return 'Ledenkaart bijgewerkt.';
 }
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
 // Overleg: alleen als concept; versturen naar de leden en vaststellen doet de beheerder zelf op het scherm Overleg.
 case 'overleg_voorstel':await call(deps,'overleg',{action:'voorstel',proposal:{title:i.title,text:i.text,pot:i.pot,topic:i.topic,validFrom:i.validFrom},send:null});return 'Concept staat bij Overleg. Verstuur het daar naar de leden.';
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
