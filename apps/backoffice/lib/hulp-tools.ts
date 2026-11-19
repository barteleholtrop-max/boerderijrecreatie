// Hulpmiddelen van de Backoffice-assistent (opdracht eigenaar 6 november 2026): een typbalk onderaan elk scherm die helpt met
// alles in de backoffice. Leeshulpmiddelen geven feiten; een schrijfhulpmiddel legt een ACTIE vast en die wordt meteen uitgevoerd
// (wens eigenaar 13 november 2026: „De assistent moet Rianne volledig helpen en heeft alle rechten”). lib/hulp-actions.ts voert hem
// uit via de bestaande backoffice-routes, met dezelfde controles als de knoppen op het scherm; de actie blijft als kaart in het gesprek.
// Ook gebruikt door de Weekassistent (lib/assistant-store.ts). Zonder hulpmiddel (en dus niet mogelijk): Bloei (saldo's, obligaties,
// participaties, tegoeden), betalingen, kassa, bestellingen, facturen, uitbetalingen, goedgekeurde of afgesloten weken, percentages en IBAN's.
// Bloei en betalingen (wens eigenaar 18 november 2026: „Bloei en betalingen ook voor de assistent”): Bloei inzien (de overgenomen
// administratie is ook op het scherm alleen-lezen), betalingen inzien, en dezelfde knoppen als bij Financiën → Bank en Rekeningen:
// uitbetalingen en rente klaarzetten, goedkeuren of afwijzen, en een factuur mailen. Goedkeuren maakt bij bunq alleen een
// conceptbetaling; de eigenaar bevestigt die zelf in de bunq-app. Kassa, IBAN's en percentages blijven zonder hulpmiddel.
import {z} from 'zod';
import type {RoleContractContext} from './role-contracts';

export const POT_IDS=['restaurant','ite','speelboerderij','groepen','boerderij'] as const;
export const WEEKDAYS=['maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'] as const;
export const UNIT_IDS=['winkel','restaurant','ite','speelboerderij','groepen','boerderij'] as const;

export type MemberLite={id:string;name:string;email:string;active:boolean;phone:string;address:string;memberSince:string;memberClass:string;units:string[];potRoles:Record<string,string[]>};
export type ProductLite={id:string;name:string;department:string;priceCents:number;vat:string;published:boolean;available:boolean;note:string;deleted:boolean;photo?:string};
/** Een beeld uit de beeldbibliotheek (alleen afbeeldingen). */
export type MediaLite={id:string;name:string};
export const FINANCE_PARTS=['overzicht','bankverdeling','maandagvraag','rente','open_rekeningen','achterstallig','facturen','dividend'] as const;
export type FinancePart=typeof FINANCE_PARTS[number];
/** Waar een foto in het gesprek te zien is: alleen de beeldbibliotheek of de oude Wix-foto's (app/chat-text.tsx toont niets anders). */
export function photoAddress(photo:unknown):string|null{
 const s=typeof photo==='string'?photo.trim():'';
 if(/^\/api\/media\/[a-f0-9-]{36}$/.test(s))return s;
 const pub=/^\/api\/public\/media\/([a-f0-9-]{36})$/.exec(s);if(pub)return '/api/media/'+pub[1];
 return /^https:\/\/static\.wixstatic\.com\/[^\s()]+$/.test(s)?s:null;
}
const showPhoto=(name:string,url:string)=>`![${name.replace(/[\[\]]/g,'')}](${url})`;
export type RoleCatalogue={pot:string;name:string;roles:{id:string;name:string}[]}[];
export type HoursView={weekly:{dag:string;open:boolean;van:string;tot:string}[];exceptions:{datum:string;open:boolean;van:string;tot:string;notitie:string}[]};

/** De acties die de assistent mag uitvoeren. Elke soort heeft een vaste uitvoering in lib/hulp-actions.ts. */
export const ACTION_TYPES=['dienst_inplannen','dienst_vrijgeven','bezetting_instellen','diensten_melden','lid_aanmaken','ledenkaart_wijzigen','product_aanmaken','product_tekst_wijzigen','openingstijden_wijzigen','afwijkende_dag','overleg_voorstel','contract_tekstvoorstel','rol_aanmaken','rol_wijzigen','rolcontract_voorstel','klant_aanmaken','klantgesprek_inplannen','optie_zetten','product_wijzigen','product_publiceren','groepsdag_instellen','boeking_bevestigen','uitbetaling_beslissen','uitbetalingen_klaarzetten','factuur_mailen'] as const;
export type ActionType=typeof ACTION_TYPES[number];
export type Action={type:ActionType;input:Record<string,unknown>;title:string;details:string[]};
export type ContractWritingContext={templateEditVersion:number;contracts:{id:string;key:string;name:string;assigned:boolean;memberName:string;revision:number;hash:string;status:string;data:{period:string;requestedFrom:string;supplierMode:string;clauses:{key:string;title:string;text:string}[];extras:string;protocols:string;roleText:string;business?:unknown;templateVersion:number}}[]};

// Gasten (wens eigenaar 9 november 2026): klanten, afspraken en opties. Alleen lezen hier; schrijven gaat via een actie.
export type GuestCustomer={id:string;name:string;email:string;phone:string;company:string;address:string;notes:string;bookings:number;conversations:number};
export type GuestAgendaDay={dag:string;open:boolean;openingstijden:string;notitie:string;feestdagen:string[];
 boekingen:{id?:string;soort:string;van:string;tot:string;naam:string;personen:number;status:string;optie_geldig_tot?:string;uitzondering?:string}[];
 groepsdag?:string;
 afspraken:{van:string;tot:string;onderwerp:string;klant:string}[];evenementen:{van:string;tot:string;titel:string}[];
 dagdelen:{naam:string;van:string;tot:string;groep:string;daggasten:string}[]};
export type OptionCheck={date:string;from:string;to:string;activity:'groep'|'bezoek';people:number;exception?:string;status?:'optie'|'bevestigd';id?:string};

export type HulpContext={
 today:string; // YYYY-MM-DD, Europe/Amsterdam
 roster(pot:string,from:string,days:number):Promise<unknown>;
 members():Promise<MemberLite[]>;
 roles():Promise<RoleCatalogue>;
 products():Promise<ProductLite[]>;
 /** Beeldbibliotheek (wens eigenaar 15 november 2026: „hij kan mij de foto's niet laten zien”). */
 media?():Promise<MediaLite[]>;
 /** Bloei, alleen lezen: overzicht en één houder (lib/bloei-real-store.ts realOverview). null = nog geen echte administratie. */
 bloei?(houderId:string):Promise<Record<string,unknown>|null>;
 /** Financiën → Bank en Rekeningen, alleen lezen. */
 finance?(onderdeel:FinancePart,week:string,year:number):Promise<unknown>;
 hours():Promise<HoursView>;
 signals():Promise<{pot:string;potName:string;day:string;reason:string;text:string;items:string[]}[]>;
 /** Overleg (wens eigenaar 6 november 2026): afspraken en voorstellen opzoeken, alleen lezen. */
 afspraken(zoekterm:string):Promise<unknown>;
 contracts(memberId:string):Promise<ContractWritingContext>;
 roleContract(pot:string,id:string):Promise<RoleContractContext>;
 /** Rollen per pot (wens eigenaar 6 november 2026): de rollenlijst met soort, aan/uit en punten uit de afspraak. */
 rollenlijst():Promise<{pot:string;name:string;roles:{id:string;name:string;kind:string;active:boolean;points:number;inAgreement:boolean}[]}[]>;
 /** Klantenkaarten (Gesprekken & klanten), zonder gesprekteksten. */
 customers():Promise<GuestCustomer[]>;
 /** Agenda per dag: boekingen, geldige opties, aanvragen, afspraken, evenementen en de bezetting per dagdeel. */
 agenda(from:string,days:number):Promise<GuestAgendaDay[]>;
 /** Past een optie nog binnen openingstijden en capaciteit? null = ja, anders de reden van de planning. */
 checkOption(o:OptionCheck):Promise<string|null>;
 /** Legt de actie vast en voert hem meteen uit. status/result: uitkomst van de backoffice (zonder status: alleen klaargezet). */
 propose(a:Action):Promise<{id:string;status?:string;result?:string}>;
};
export type ToolOutcome={content:string;isError:boolean;source:string};

const DAY=/^\d{4}-\d{2}-\d{2}$/,TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const validDay=(v:string)=>DAY.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const day=z.string().refine(validDay,'gebruik een datum als JJJJ-MM-DD');
const time=z.string().regex(TIME,'gebruik een tijd als UU:MM');
const nullableText=(max:number)=>z.string().max(max).nullable();
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
export const dutchDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const S=(description:string)=>({type:'string',description});
const NS=(description:string)=>({type:['string','null'],description});
const obj=(properties:Record<string,unknown>)=>({type:'object' as const,properties,required:Object.keys(properties),additionalProperties:false});
const pot={type:'string',enum:[...POT_IDS],description:'De pot (het onderdeel) van de planning.'};

// Geen strikte hulpmiddelen meer (8 november 2026): samen werden de strikte schema's te groot en weigerde Claude elk verzoek
// ("The compiled grammar is too large"). runTool controleert elke invoer met zod en geeft bij een fout de reden terug, zodat Claude
// het opnieuw probeert; een schrijfhulpmiddel gaat bovendien via dezelfde backoffice-route en controles als de knop op het scherm.
// tests/hulp.test.mjs bewaakt dat er geen strikte hulpmiddelen terugkomen.
export const TOOL_DEFINITIONS=[
 // ---- Lezen
 {name:'rooster_bekijken',description:'Bekijk de ledenplanning (diensten) van een pot: per dag de rollen, hoeveel mensen nodig zijn, wie er gepland of aanwezig is, en of de week al vastligt (goedgekeurd). Geeft ook de leden van de pot met hun id.',
  input_schema:obj({pot,van:S('Eerste dag, JJJJ-MM-DD.'),dagen:{type:'integer',description:'Aantal dagen, 1 tot 14.'}})},
 {name:'leden_zoeken',description:'Zoek werkende leden en deelnemers op naam of e-mail. Geeft id, naam, e-mail, telefoon, adres, afdelingen, lid sinds en de rollen per pot waarvoor iemand is aangenomen. Geen bankgegevens en geen kapitaalgegevens (die staan in Bloei).',
  input_schema:obj({zoekterm:S('Deel van de naam of het e-mailadres. Leeg voor iedereen.')})},
 {name:'rollen_bekijken',description:'Bekijk per pot welke rollen er bestaan (id en naam), en de rollenlijst: soort (dag = dagdienst, week = weektaak), aan of uit, en de punten uit de pot-afspraak (0 = nog niet in de afspraak). Nodig om iemand in te plannen, een rol op de ledenkaart te zetten of een rol aan te maken.',
  input_schema:obj({})},
 {name:'bloei_bekijken',description:'Bloei inzien (alleen lezen): de houders met hun obligaties en het tegoed dat ze bij Boer Bart kunnen besteden, en per houder de obligaties (bedrag, rente, looptijd), de geschiedenis, het tegoed en de gekoppelde ledenkaart. Leeg = overzicht van alle houders.',
  input_schema:obj({houder:S('Naam (of deel ervan) of id van de houder; leeg voor het overzicht.')})},
 {name:'betalingen_bekijken',description:'Financiën inzien (alleen lezen). overzicht = bankrekeningen, verdelingen per week en uitbetalingen van BB-tegoed (met id en versie); bankverdeling = de verdeling van één week; maandagvraag = keuzes van de leden voor hun tegoed in een week; rente = rente op obligaties van een jaar (met id en versie); open_rekeningen, achterstallig en facturen = rekeningen van gasten; dividend = wat leden dit jaar met dividend betaalden.',
  input_schema:obj({onderdeel:{type:'string',enum:['overzicht','bankverdeling','maandagvraag','rente','open_rekeningen','achterstallig','facturen','dividend']},week:S('Maandag van de week als JJJJ-MM-DD, of leeg.'),jaar:{type:'integer',description:'Jaar voor rente, of 0.'}})},
 {name:'uitbetaling_beslissen',description:'Voert direct uit, net als de knop bij Financiën → Bank: een uitbetaling van BB-tegoed of een rentebetaling goedkeuren of afwijzen. Goedkeuren maakt bij bunq een conceptbetaling; de eigenaar bevestigt die zelf in de bunq-app. Lees eerst id en versie met betalingen_bekijken (overzicht of rente).',
  input_schema:obj({soort:{type:'string',enum:['bb','rente']},id:S('Id van de uitbetaling of renteregel.'),versie:{type:'integer',description:'Versie uit betalingen_bekijken.'},besluit:{type:'string',enum:['goedkeuren','afwijzen']},reden:S('Bij afwijzen: de reden. Anders leeg.'),jaar:{type:'integer',description:'Bij rente: het jaar. Anders 0.'}})},
 {name:'uitbetalingen_klaarzetten',description:'Voert direct uit, net als de knop bij Financiën → Bank: uit de maandagvraag van een week de aanvragen voor uitbetaling van BB-tegoed maken, of de rente van een jaar klaarzetten. Daarna nog per regel goedkeuren.',
  input_schema:obj({soort:{type:'string',enum:['maandagvraag','rente']},week:S('Bij maandagvraag: maandag als JJJJ-MM-DD. Anders leeg.'),jaar:{type:'integer',description:'Bij rente: het jaar. Anders 0.'}})},
 {name:'factuur_mailen',description:'Voert direct uit: de factuur of rekening (opnieuw) mailen aan de rekeninghouder, vanaf de mailbox van Gesprekken. Id uit betalingen_bekijken (open_rekeningen, achterstallig of facturen).',
  input_schema:obj({rekening_id:S('Id van de rekening.')})},
 {name:'fotos_zoeken',description:'Zoek foto\'s om te laten zien: productfoto\'s en beelden uit de beeldbibliotheek (Producten → Beelden). Geeft per foto een regel „toon” die je letterlijk op een eigen regel in je antwoord zet; dan ziet de beheerder de foto in het gesprek.',
  input_schema:obj({zoekterm:S('Deel van de naam van het product of de foto, bijvoorbeeld "boerenkool" of "kippen". Leeg voor de nieuwste foto\'s.')})},
 {name:'producten_zoeken',description:'Zoek producten en gerechten in de centrale productlijst: id, naam, afdeling, prijs, btw, gepubliceerd, beschikbaar en de foto (regel „toon” om hem te laten zien).',
  input_schema:obj({zoekterm:S('Deel van de naam. Leeg voor de eerste resultaten.'),afdeling:S('Leeg voor alle afdelingen, of bijvoorbeeld "Restaurant" of "Winkel".')})},
 {name:'personeel_signalen',description:'Bekijk de signalen van de ledenplanning: dagen die extra open gaan, en groepen, evenementen of offertes op een dag zonder diensten (tot zes weken vooruit). Vraag de beheerder dan of er diensten bij moeten, welke rollen en hoeveel.',
  input_schema:obj({})},
 {name:'openingstijden_bekijken',description:'Bekijk de vaste openingstijden per weekdag en de afwijkende dagen (gesloten of andere tijden) vanaf vandaag.',
  input_schema:obj({})},
 {name:'afspraken_zoeken',description:'Zoek afspraken en voorstellen uit het Overleg: titel, tekst, pot, stand (concept, bij de leden, beter voorstel gedaan, vastgesteld, ingetrokken), vanaf wanneer het geldt en hoeveel leden akkoord zijn, een beter voorstel deden of nog niet reageerden.',
  input_schema:obj({zoekterm:S('Woorden uit de titel of tekst, of de naam van de pot. Leeg voor de nieuwste.')})},
 {name:'contracten_bekijken',description:'Lees de coöperatieve functieafspraken en de vastgestelde bedrijfsafspraken bij één lid. Geeft de huidige teksten, versie, hash en id voor een nieuw tekstvoorstel. Geen bankgegevens, saldi of ondertekenidentiteiten.',input_schema:obj({lid_id:S('Bestaand lid-id uit leden_zoeken.')})},
 {name:'rolcontract_bekijken',description:'Lees de eigen conceptafspraak van een rol, ook als nog niemand is aangenomen. Geeft bestaande coöperatieve basisafspraken, de vastgestelde bedrijfsafspraken, ontbrekende rolvragen en de actuele hash. Vraag alleen door over ontbrekende taken, bevoegdheden, samenwerking, opening/afsluiting, protocollen en looptijd.',input_schema:obj({pot,rol_id:S('Bestaande rol-id uit rollen_bekijken.')})},
 // ---- Acties (worden direct uitgevoerd, wens eigenaar 13 november 2026)
 {name:'rolcontract_voorstel',description:'Zet na gerichte vragen en feedback een tekstvoorstel voor de basistekst van een rol klaar. Lees eerst rolcontract_bekijken. De bestaande algemene basis blijft staan. Na uitvoeren wordt alleen het rolconcept bewaard; groepsgoedkeuring, persoonlijke ondertekening en financiële besluiten gebeuren afzonderlijk.',input_schema:obj({pot,rol_id:S('Exacte rol-id uit rolcontract_bekijken.'),basis_hash:S('Actuele hash uit rolcontract_bekijken.'),roltekst:S('Concrete verantwoordelijkheden, bevoegdheden, samenwerking en overdracht op basis van de antwoorden.'),periode:{type:'string',enum:['maand','kwartaal','jaar']},protocollen:S('Bestaande protocollen en afgesproken aanvullingen, of leeg.'),reden:S('Wat is besproken en verbeterd?')})},
 {name:'contract_tekstvoorstel',description:'Zet na overleg met de beheerder een verbeterde tekst klaar als NIEUW CONCEPT: voor dit lid, of als basistekst voor toekomstige functieafspraken. Lees eerst contracten_bekijken, neem de gevraagde verbeteringen uit het gesprek mee en gebruik de exacte huidige id en hash. Geen ondertekening, groepsgoedkeuring, publicatie of wijziging van financiële brongegevens.',input_schema:obj({lid_id:S('Id van het lid.'),contract_id:S('Exacte huidige contract-id uit contracten_bekijken.'),basis_hash:S('Exacte huidige hash uit contracten_bekijken.'),doel:{type:'string',enum:['dit_contract','basistekst']},roltekst:NS('Verbeterde functietekst; null = behouden. Bij basistekst verplicht.'),aanvullingen:NS('Volledige aanvullende afspraken voor dit lid, of null om te behouden.'),protocollen:NS('Volledige protocoltekst voor dit lid, of null om te behouden.'),reden:S('Wat verbetert er op basis van het gesprek?')})},
 {name:'dienst_inplannen',description:'Voert direct uit: een lid inplannen voor een rol op een dag. Wordt direct uitgevoerd. Zoek lid-id en rol-id eerst op.',
  input_schema:obj({pot,dag:S('JJJJ-MM-DD'),rol_id:S('Id van de rol, uit rollen_bekijken of rooster_bekijken.'),lid_id:S('Id van het lid, uit leden_zoeken of rooster_bekijken.')})},
 {name:'dienst_vrijgeven',description:'Voert direct uit: een geplande dienst van een lid weghalen. Wordt direct uitgevoerd.',
  input_schema:obj({pot,dag:S('JJJJ-MM-DD'),rol_id:S('Id van de rol.'),lid_id:S('Id van het lid.')})},
 {name:'bezetting_instellen',description:'Voert direct uit: hoeveel mensen een rol nodig heeft, op één dag of als standaard voor elke dag. Zo maak je een extra dienst (plek) aan. Wordt direct uitgevoerd.',
  input_schema:obj({pot,dag:S('JJJJ-MM-DD, of leeg voor de standaard van elke dag.'),rol_id:S('Id van de rol.'),aantal:{type:'integer',description:'0 tot 10 mensen.'},omschrijving:NS('Omschrijving van de dienst, bijv. "schoonmaak + inrichting", of null om niet te wijzigen.')})},
 {name:'diensten_melden',description:'Voert direct uit: open diensten van één dag DIRECT als pushbericht melden aan de leden van de pot die voor die rollen zijn aangenomen. Vraag na het toevoegen van diensten eerst: direct versturen of meenemen in het weekbericht (vrijdag 12:00)? Kies dit alleen bij "direct"; voor het weekbericht hoeft niets. Wordt direct uitgevoerd.',
  input_schema:obj({pot,dag:S('JJJJ-MM-DD'),rol_ids:{type:'array',items:{type:'string'},description:'De rollen met nieuwe open plekken.'}})},
 {name:'lid_aanmaken',description:'Voert direct uit: een nieuw werkend lid of nieuwe deelnemer aanmaken, met contactgegevens en afdelingen. Geen IBAN, ledenklasse of Bloei-gegevens: die vult de beheerder zelf in. Wordt direct uitgevoerd.',
  input_schema:obj({naam:S('Volledige naam.'),email:S('E-mailadres, of leeg.'),telefoon:S('Telefoonnummer, of leeg.'),adres:S('Adres, of leeg.'),lid_sinds:S('JJJJ-MM-DD, of leeg.'),afdelingen:{type:'array',items:{type:'string',enum:[...UNIT_IDS]},description:'Afdelingen waar het lid werkt.'}})},
 {name:'ledenkaart_wijzigen',description:'Voert direct uit: contactgegevens, afdelingen of aangenomen rollen op de ledenkaart wijzigen. null = niet wijzigen. Ledenklasse, stemrecht, Bloei-koppeling en bankgegevens kun je niet wijzigen. Wordt direct uitgevoerd.',
  input_schema:obj({lid_id:S('Id van het lid.'),email:NS('Nieuw e-mailadres, of null.'),telefoon:NS('Nieuw telefoonnummer, of null.'),adres:NS('Nieuw adres, of null.'),afdelingen:{type:['array','null'],items:{type:'string',enum:[...UNIT_IDS]},description:'De volledige nieuwe lijst afdelingen, of null.'},
   rollen:{type:['array','null'],description:'Per pot de volledige nieuwe lijst rol-id\'s waarvoor het lid is aangenomen, of null. Pots die je niet noemt blijven gelijk.',items:{type:'object',properties:{pot,rol_ids:{type:'array',items:{type:'string'}}},required:['pot','rol_ids'],additionalProperties:false}}})},
 {name:'product_aanmaken',description:'Voert direct uit: een nieuw product aanmaken in de centrale productlijst. Met publiceren=true staat het meteen voor gasten online (btw-tarief verplicht); anders als concept. Zoek eerst of het product al bestaat. Wordt direct uitgevoerd.',
  input_schema:obj({naam:S('Naam van het product.'),afdeling:{type:'string',enum:['Restaurant','Winkel'],description:'Afdeling.'},prijs_cent:{type:'integer',description:'Voorgestelde verkoopprijs in centen, inclusief btw. Vraag de prijs na; verzin hem niet.'},btw:{type:'string',enum:['9','21',''],description:'Btw-tarief, of leeg als onbekend.'},notitie:S('Interne notitie, of leeg.'),publiceren:{type:'boolean',description:'true = meteen publiceren (zichtbaar voor gasten), false = concept.'}})},
 {name:'product_tekst_wijzigen',description:'Voert direct uit: de naam of interne notitie van een bestaand product wijzigen. Is het product gepubliceerd, dan wordt de nieuwe versie ook meteen gepubliceerd. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),naam:NS('Nieuwe naam, of null.'),notitie:NS('Nieuwe notitie, of null.')})},
 {name:'product_wijzigen',description:'Voert direct uit: verkoopprijs, btw-tarief of beschikbaarheid (uitverkocht of weer leverbaar) van een bestaand product wijzigen. null = niet wijzigen. Is het product gepubliceerd, dan geldt de wijziging meteen voor gasten. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),prijs_cent:{type:['integer','null'],description:'Nieuwe verkoopprijs in centen inclusief btw, of null.'},btw:{anyOf:[{type:'string',enum:['9','21']},{type:'null'}],description:'9 of 21, of null.'},beschikbaar:{type:['boolean','null'],description:'true = leverbaar, false = uitverkocht/niet beschikbaar, of null.'}})},
 {name:'product_publiceren',description:'Voert direct uit: een product publiceren (zichtbaar voor gasten, met de laatste conceptversie) of offline halen. Publiceren kan alleen met een btw-tarief. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),publiceren:{type:'boolean',description:'true = publiceren, false = offline halen.'}})},
 {name:'openingstijden_wijzigen',description:'Voert direct uit: de vaste openingstijden van één weekdag wijzigen. Wordt direct uitgevoerd; bestaande boekingen die niet meer passen houden de wijziging tegen.',
  input_schema:obj({weekdag:{type:'string',enum:[...WEEKDAYS]},open:{type:'boolean'},van:S('UU:MM'),tot:S('UU:MM')})},
 {name:'rol_aanmaken',description:'Voert direct uit: een nieuwe rol bij een pot (bijvoorbeeld Tuinonderhoud bij de speelboerderij), als dagdienst of weektaak. Punten kun je niet zetten: een nieuwe rol telt voor 0 punten tot de leden een voorstel met punten goedkeuren (Winstdeling & rollen). Wordt direct uitgevoerd.',
  input_schema:obj({pot,naam:S('De naam van de rol, 2 tot 40 tekens.'),soort:{type:'string',enum:['dag','week'],description:'dag = dagdienst, week = weektaak (één lid voor de hele week).'}})},
 {name:'rol_wijzigen',description:'Voert direct uit: een bestaande rol van een pot hernoemen, de soort wijzigen (dagdienst of weektaak) of aan- of uitzetten. null = niet wijzigen. Een uitgezette rol is niet meer te plannen; diensten die al gedraaid zijn houden hun punten. Wordt direct uitgevoerd.',
  input_schema:obj({pot,rol_id:S('Id van de rol, uit rollen_bekijken.'),naam:NS('Nieuwe naam, of null.'),soort:{anyOf:[{type:'string',enum:['dag','week']},{type:'null'}],description:'dag of week, of null.'},aan:{type:['boolean','null'],description:'true = aan, false = uit, of null.'}})},
 {name:'overleg_voorstel',description:'Voert direct uit: een CONCEPT-voorstel in het Overleg (een nieuwe afspraak of wijziging). Na uitvoeren staat het als concept bij Overleg; de beheerder verstuurt het zelf naar de leden en stelt het vast. Over de verdeling (percentage, rollen, punten) alleen bij een pot; de pot-afspraak verandert nooit vanzelf.',
  input_schema:obj({titel:S('Korte titel.'),tekst:S('Wat er wordt voorgesteld.'),pot:{type:'string',enum:['',...POT_IDS],description:'De pot, of leeg voor algemeen.'},soort:{type:'string',enum:['algemeen','verdeling'],description:'verdeling = over percentage, rollen of punten.'},geldt_vanaf:S('JJJJ-MM-DD, of leeg.')})},
 {name:'afwijkende_dag',description:'Voert direct uit: één datum gesloten of met andere openingstijden. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),open:{type:'boolean'},van:S('UU:MM (bij gesloten: 10:00)'),tot:S('UU:MM (bij gesloten: 18:00)'),notitie:S('Bijvoorbeeld "Kerst". Of leeg.')})},
 // ---- Gasten (wens eigenaar 9 november 2026): klanten, afspraken en opties. Nooit offertes versturen, boekingen bevestigen,
 // aanbetalingen of facturen maken, of prijzen noemen.
 {name:'klanten_zoeken',description:'Zoek klantenkaarten (Gesprekken & klanten) op naam, e-mail, telefoon of bedrijf. Geeft klant_id, naam, e-mail, telefoon, bedrijf, adres, notitie en hoeveel boekingen en gesprekken er bij de kaart horen. Zoek altijd eerst voordat je een klant aanmaakt.',
  input_schema:obj({zoekterm:S('Deel van naam, e-mail, telefoonnummer of bedrijf.')})},
 {name:'agenda_bekijken',description:'Bekijk de agenda van Planning per dag: openingstijden, boekingen (bevestigd, optie met geldig-tot, aanvraag), afspraken, evenementen en per dagdeel hoeveel plek er nog is voor groepen en daggasten. Gebruik dit om te zien of een datum vrij is.',
  input_schema:obj({van:S('Eerste dag, JJJJ-MM-DD.'),dagen:{type:'integer',description:'Aantal dagen, 1 tot 31.'}})},
 {name:'klant_aanmaken',description:'Voert direct uit: een nieuwe klantenkaart met naam, e-mail, telefoon, adres, bedrijf en notitie. Zoek eerst met klanten_zoeken; bestaat de klant al, maak dan geen tweede kaart. Wordt direct uitgevoerd.',
  input_schema:obj({naam:S('Naam van de klant.'),email:S('E-mailadres, of leeg.'),telefoon:S('Telefoonnummer, of leeg.'),adres:S('Adres, of leeg.'),bedrijf:S('Bedrijf of vereniging, of leeg.'),notitie:S('Korte notitie, of leeg.')})},
 {name:'klantgesprek_inplannen',description:'Voert direct uit: een afspraak in de agenda, zoals een kennismakingsgesprek. Geen boeking: houdt geen plaats vast. Kijk eerst met agenda_bekijken of het tijdstip past. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),van:S('Begintijd UU:MM'),duur_minuten:{type:'integer',description:'Duur in minuten, 15 tot 480.'},klant_id:S('klant_id uit klanten_zoeken, of leeg als er (nog) geen kaart is.'),onderwerp:S('Bijvoorbeeld "Kennismakingsgesprek bruiloft".'),notitie:S('Korte notitie, of leeg.')})},
 {name:'optie_zetten',description:'Voert direct uit: een OPTIE of meteen een BEVESTIGDE boeking voor een groep, feest of bezoek, gekoppeld aan een klantenkaart. Inboeken mag ALTIJD (wens eigenaar 13 november 2026), ook buiten de openingstijden, in een gesloten periode, buiten een tijdblok of boven de capaciteit: dan gaat het als boeking met voorrang, met de reden in de agenda, en krijg je terug welke regel er normaal tegenhield. De openingstijden voor daggasten en online reserveringen veranderen niet. Wordt direct uitgevoerd.',
  input_schema:obj({klant_id:S('klant_id uit klanten_zoeken (verplicht; maak zo nodig eerst een kaart).'),datum:S('JJJJ-MM-DD'),van:S('UU:MM'),tot:S('UU:MM'),soort:{type:'string',enum:['groep','bezoek'],description:'groep = groep of feest; bezoek = daggasten speelboerderij.'},soort_evenement:S('Bijvoorbeeld "kinderfeest", "bedrijfsuitje", "bruiloft".'),aantal_gasten:{type:['integer','null'],description:'Verwacht aantal gasten, of null als het nog niet bekend is.'},geldig_tot:S('Laatste dag dat de optie geldt, JJJJ-MM-DD (meestal 1 à 2 weken). Bij een bevestigde boeking: de datum zelf.'),notitie:S('Korte notitie, of leeg.'),status:{type:'string',enum:['optie','bevestigd'],description:'optie = voorlopig tot geldig_tot; bevestigd = definitieve boeking (alleen als de afspraak met de gast vaststaat).'},uitzondering_reden:S('Waarom dit buiten de gewone regels toch geboekt wordt (bijvoorbeeld "toegezegd door Rianne"). Staat in de agenda. Leeg = de assistent noteert zelf dat het op verzoek is ingeboekt.')})},
 {name:'groepsdag_instellen',description:'Voert direct uit: groepen welkom op één datum (van–tot) terwijl het onderdeel uit staat of de dag gesloten is. De dag blijft dicht voor daggasten en online reserveringen; de rest van de gesloten periode verandert niet. Met een reden die in de agenda staat. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),van:S('UU:MM'),tot:S('UU:MM'),notitie:S('Waarom groepen op deze dag welkom zijn, bijvoorbeeld "Besloten groep Erna: koffie, taart en borrel".')})},
 {name:'boeking_bevestigen',description:'Voert direct uit: een optie of aanvraag in Planning omzetten naar een bevestigde boeking, met dezelfde controles als de knop. Zoek de boeking-id op met agenda_bekijken. Geen offerte of factuur. Wordt direct uitgevoerd.',
  input_schema:obj({boeking_id:S('id van de boeking uit agenda_bekijken.'),notitie:S('Korte notitie bij het bevestigen, of leeg.')})},
];
export const TOOL_LABELS:Record<string,string>={bloei_bekijken:'Bloei',betalingen_bekijken:'Financiën',uitbetaling_beslissen:'actie uitgevoerd',uitbetalingen_klaarzetten:'actie uitgevoerd',factuur_mailen:'actie uitgevoerd',fotos_zoeken:'foto\'s',klanten_zoeken:'klantenkaarten',agenda_bekijken:'agenda van Planning',klant_aanmaken:'actie uitgevoerd',klantgesprek_inplannen:'actie uitgevoerd',optie_zetten:'actie uitgevoerd',groepsdag_instellen:'actie uitgevoerd',boeking_bevestigen:'actie uitgevoerd',rolcontract_bekijken:'rolafspraak en bestaande basisafspraken',rolcontract_voorstel:'voorstel voor de rolafspraak bewaard',contracten_bekijken:'functieafspraken en bedrijfsafspraken',contract_tekstvoorstel:'tekstvoorstel bewaard',rooster_bekijken:'ledenplanning',personeel_signalen:'signalen ledenplanning',diensten_melden:'actie uitgevoerd',leden_zoeken:'leden',rollen_bekijken:'rollen per pot',producten_zoeken:'productlijst',openingstijden_bekijken:'openingstijden',afspraken_zoeken:'overleg en afspraken',overleg_voorstel:'actie uitgevoerd',rol_aanmaken:'actie uitgevoerd',rol_wijzigen:'actie uitgevoerd',
 dienst_inplannen:'actie uitgevoerd',dienst_vrijgeven:'actie uitgevoerd',bezetting_instellen:'actie uitgevoerd',lid_aanmaken:'actie uitgevoerd',ledenkaart_wijzigen:'actie uitgevoerd',product_aanmaken:'actie uitgevoerd',product_tekst_wijzigen:'actie uitgevoerd',product_wijzigen:'actie uitgevoerd',product_publiceren:'actie uitgevoerd',openingstijden_wijzigen:'actie uitgevoerd',afwijkende_dag:'actie uitgevoerd'};

const shift=z.object({pot:z.enum(POT_IDS),dag:day,rol_id:z.string().min(1).max(100),lid_id:z.string().min(1).max(100)});
const email=z.string().max(200).refine(v=>v===''||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),'ongeldig e-mailadres');
export const inputs={
 rooster_bekijken:z.object({pot:z.enum(POT_IDS),van:day,dagen:z.number().int().min(1).max(14)}),
 leden_zoeken:z.object({zoekterm:z.string().max(100)}),
 rollen_bekijken:z.object({}),
 producten_zoeken:z.object({zoekterm:z.string().max(100),afdeling:z.string().max(100)}),
 fotos_zoeken:z.object({zoekterm:z.string().max(100)}),
 bloei_bekijken:z.object({houder:z.string().max(100)}),
 betalingen_bekijken:z.object({onderdeel:z.enum(FINANCE_PARTS),week:z.string().max(10),jaar:z.number().int().min(0).max(2100)}),
 uitbetaling_beslissen:z.object({soort:z.enum(['bb','rente']),id:z.string().min(1).max(100),versie:z.number().int().min(0),besluit:z.enum(['goedkeuren','afwijzen']),reden:z.string().max(500),jaar:z.number().int().min(0).max(2100)}),
 uitbetalingen_klaarzetten:z.object({soort:z.enum(['maandagvraag','rente']),week:z.string().max(10),jaar:z.number().int().min(0).max(2100)}),
 factuur_mailen:z.object({rekening_id:z.string().min(1).max(100)}),
 openingstijden_bekijken:z.object({}),
 personeel_signalen:z.object({}),
 diensten_melden:z.object({pot:z.enum(POT_IDS),dag:day,rol_ids:z.array(z.string().min(1).max(100)).min(1).max(10)}),
 afspraken_zoeken:z.object({zoekterm:z.string().max(100)}),
 contracten_bekijken:z.object({lid_id:z.string().min(1).max(100)}).strict(),
 rolcontract_bekijken:z.object({pot:z.enum(POT_IDS),rol_id:z.string().min(1).max(100)}).strict(),
 rolcontract_voorstel:z.object({pot:z.enum(POT_IDS),rol_id:z.string().min(1).max(100),basis_hash:z.string().regex(/^[a-f0-9]{64}$/),roltekst:z.string().trim().min(1).max(6000),periode:z.enum(['maand','kwartaal','jaar']),protocollen:z.string().max(6000),reden:z.string().trim().min(3).max(1000)}).strict(),
 contract_tekstvoorstel:z.object({lid_id:z.string().min(1).max(100),contract_id:z.string().min(1).max(100),basis_hash:z.string().regex(/^[a-f0-9]{64}$/),doel:z.enum(['dit_contract','basistekst']),roltekst:z.string().trim().min(1).max(6000).nullable(),aanvullingen:nullableText(12000),protocollen:nullableText(6000),reden:z.string().trim().min(3).max(1000)}).strict(),
 overleg_voorstel:z.object({titel:z.string().trim().min(3).max(120),tekst:z.string().trim().min(5).max(4000),pot:z.enum(['',...POT_IDS]),soort:z.enum(['algemeen','verdeling']),geldt_vanaf:z.union([z.literal(''),day])}).refine(v=>v.soort==='algemeen'||v.pot!=='','een voorstel over de verdeling hoort bij een pot'),
 rol_aanmaken:z.object({pot:z.enum(POT_IDS),naam:z.string().trim().min(2).max(40),soort:z.enum(['dag','week'])}),
 rol_wijzigen:z.object({pot:z.enum(POT_IDS),rol_id:z.string().min(1).max(100),naam:z.string().trim().min(2).max(40).nullable(),soort:z.enum(['dag','week']).nullable(),aan:z.boolean().nullable()}).refine(v=>v.naam!==null||v.soort!==null||v.aan!==null,'geef iets om te wijzigen'),
 dienst_inplannen:shift,
 dienst_vrijgeven:shift,
 bezetting_instellen:z.object({pot:z.enum(POT_IDS),dag:z.union([z.literal(''),day]),rol_id:z.string().min(1).max(100),aantal:z.number().int().min(0).max(10),omschrijving:z.string().max(200).nullable()}),
 lid_aanmaken:z.object({naam:z.string().trim().min(1).max(80),email,telefoon:z.string().max(40),adres:z.string().max(200),lid_sinds:z.union([z.literal(''),day]),afdelingen:z.array(z.enum(UNIT_IDS)).max(6)}),
 ledenkaart_wijzigen:z.object({lid_id:z.string().min(1).max(100),email:email.nullable(),telefoon:nullableText(40),adres:nullableText(200),afdelingen:z.array(z.enum(UNIT_IDS)).max(6).nullable(),rollen:z.array(z.object({pot:z.enum(POT_IDS),rol_ids:z.array(z.string().min(1).max(100)).max(20)})).max(5).nullable()}),
 product_aanmaken:z.object({naam:z.string().trim().min(1).max(180),afdeling:z.enum(['Restaurant','Winkel']),prijs_cent:z.number().int().min(0).max(10000000),btw:z.enum(['9','21','']),notitie:z.string().max(2000),publiceren:z.boolean().default(false)}).refine(v=>!v.publiceren||v.btw!=='','publiceren kan alleen met een btw-tarief'),
 product_tekst_wijzigen:z.object({product_id:z.string().min(1).max(100),naam:z.string().trim().min(1).max(180).nullable(),notitie:nullableText(2000)}),
 product_wijzigen:z.object({product_id:z.string().min(1).max(100),prijs_cent:z.number().int().min(0).max(10000000).nullable(),btw:z.enum(['9','21']).nullable(),beschikbaar:z.boolean().nullable()}).refine(v=>v.prijs_cent!==null||v.btw!==null||v.beschikbaar!==null,'geef minstens één wijziging'),
 product_publiceren:z.object({product_id:z.string().min(1).max(100),publiceren:z.boolean()}),
 openingstijden_wijzigen:z.object({weekdag:z.enum(WEEKDAYS),open:z.boolean(),van:time,tot:time}).refine(v=>!v.open||v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 afwijkende_dag:z.object({datum:day,open:z.boolean(),van:time,tot:time,notitie:z.string().max(300)}).refine(v=>!v.open||v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 klanten_zoeken:z.object({zoekterm:z.string().trim().min(2,'geef minstens twee tekens').max(100)}),
 agenda_bekijken:z.object({van:day,dagen:z.number().int().min(1).max(31)}),
 klant_aanmaken:z.object({naam:z.string().trim().min(1).max(300),email,telefoon:z.string().trim().max(100),adres:z.string().trim().max(1000),bedrijf:z.string().trim().max(300),notitie:z.string().max(2000)}),
 klantgesprek_inplannen:z.object({datum:day,van:time,duur_minuten:z.number().int().min(15).max(480),klant_id:z.string().max(400),onderwerp:z.string().trim().min(1).max(200),notitie:z.string().max(2000)}),
 optie_zetten:z.object({klant_id:z.string().min(1).max(400),datum:day,van:time,tot:time,soort:z.enum(['groep','bezoek']),soort_evenement:z.string().trim().min(1).max(100),aantal_gasten:z.number().int().min(1).max(1000).nullable(),geldig_tot:day,notitie:z.string().max(2000),status:z.enum(['optie','bevestigd']).default('optie'),uitzondering_reden:z.string().trim().max(500).default('')}).refine(v=>v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 groepsdag_instellen:z.object({datum:day,van:time,tot:time,notitie:z.string().trim().min(3,'schrijf erbij waarom').max(500)}).refine(v=>v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 boeking_bevestigen:z.object({boeking_id:z.string().min(1).max(100),notitie:z.string().max(500)}),
};
const digits=(v:string)=>v.replace(/\D/g,'');
const plusMinutes=(t:string,m:number)=>{const n=Number(t.slice(0,2))*60+Number(t.slice(3))+m;return n>=24*60?null:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};

class Refuse extends Error{}
const refuse=(m:string):never=>{throw new Refuse(m)};
const potName=(p:string)=>({restaurant:'Restaurant',ite:'Ite by Boer Bart',speelboerderij:'Speelboerderij',groepen:'Groepen & feesten',boerderij:'Boerderij'} as Record<string,string>)[p]||p;
async function memberOf(ctx:HulpContext,id:string){return (await ctx.members()).find(m=>m.id===id)||refuse(`Lid-id ${id} bestaat niet. Zoek het lid eerst op met leden_zoeken.`)}
async function roleOf(ctx:HulpContext,pot:string,id:string){const p=(await ctx.roles()).find(r=>r.pot===pot);return p?.roles.find(r=>r.id===id)||refuse(`Rol ${id} bestaat niet bij ${potName(pot)}. Bekijk de rollen met rollen_bekijken.`)}
/** Uitkomst voor Claude: uitgevoerd (met het antwoord van de backoffice), geweigerd (met de reden), of alleen vastgelegd. */
const ready=(a:Action,r:{id:string;status?:string;result?:string})=>r.status==='uitgevoerd'
 ?JSON.stringify({uitgevoerd:true,actie_id:r.id,titel:a.title,uitkomst:r.result||'',uitleg:'De wijziging is doorgevoerd in de backoffice. Zeg kort wat er is gedaan.'})
 :r.status==='mislukt'
 ?JSON.stringify({uitgevoerd:false,actie_id:r.id,titel:a.title,reden_van_de_backoffice:r.result||'onbekend',uitleg:'Er is NIETS gewijzigd. Leg de reden in gewone woorden uit en los het zo mogelijk op.'})
 :JSON.stringify({klaargezet:true,actie_id:r.id,titel:a.title,uitleg:'De actie staat in het gesprek met de knop Uitvoeren. Er is nog NIETS gewijzigd. Zeg dat de beheerder kan controleren en op Uitvoeren kan klikken.'});

export async function runTool(name:string,raw:unknown,ctx:HulpContext):Promise<ToolOutcome>{
 const schema=inputs[name as keyof typeof inputs],source=TOOL_LABELS[name]||name;
 if(!schema)return {content:'Onbekend hulpmiddel. Dit kan de assistent niet.',isError:true,source};
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return {content:'Ongeldige invoer: '+parsed.error.issues.map(i=>i.path.join('.')+' '+i.message).join('; '),isError:true,source};
 const v=parsed.data as Record<string,any>;
 const propose=async(a:Action)=>{const r=await ctx.propose(a);return {content:ready(a,r),isError:r.status==='mislukt',source}};
 try{
  switch(name){
  case 'rooster_bekijken':return ok(await ctx.roster(v.pot,v.van,v.dagen),source);
  case 'leden_zoeken':{
   const term=String(v.zoekterm).trim().toLowerCase(),all=await ctx.members();
   const found=all.filter(m=>!term||m.name.toLowerCase().includes(term)||m.email.toLowerCase().includes(term));
   return ok({aantal_gevonden:found.length,leden:found.slice(0,30).map(m=>({lid_id:m.id,naam:m.name,email:m.email,actief:m.active,telefoon:m.phone,adres:m.address,lid_sinds:m.memberSince||null,ledenklasse:m.memberClass||null,afdelingen:m.units,rollen_per_pot:m.potRoles}))},source);}
  case 'rollen_bekijken':{const lijst=await ctx.rollenlijst();
   return ok({pots:(await ctx.roles()).map(p=>({pot:p.pot,naam:p.name,rollen:p.roles,rollenlijst:(lijst.find(l=>l.pot===p.pot)?.roles||[]).map(r=>({rol_id:r.id,naam:r.name,soort:r.kind,aan:r.active,punten:r.points,in_afspraak:r.inAgreement}))}))},source);}
  case 'rol_aanmaken':{
   const p=(await ctx.rollenlijst()).find(l=>l.pot===v.pot),same=p?.roles.find(r=>r.name.toLowerCase()===v.naam.toLowerCase());
   if(same)refuse(`${potName(v.pot)} heeft al een rol ${same.name} (id ${same.id}${same.active?'':', staat uit'}). ${same.active?'':'Zet hem weer aan met rol_wijzigen.'}`);
   return await propose({type:name,input:{pot:v.pot,name:v.naam,kind:v.soort},title:`Nieuwe rol ${v.naam} bij ${potName(v.pot)}`,details:[v.soort==='week'?'weektaak (één lid voor de hele week)':'dagdienst','telt voor 0 punten tot de leden een voorstel met punten goedkeuren (Winstdeling & rollen)']});}
  case 'rol_wijzigen':{
   const p=(await ctx.rollenlijst()).find(l=>l.pot===v.pot),r=p?.roles.find(x=>x.id===v.rol_id)||refuse(`Rol ${v.rol_id} bestaat niet bij ${potName(v.pot)}. Bekijk de rollen met rollen_bekijken.`);
   if(v.naam!==null&&p!.roles.some(x=>x.id!==r.id&&x.name.toLowerCase()===v.naam!.toLowerCase()))refuse(`Er is al een rol ${v.naam} bij ${potName(v.pot)}.`);
   const details=[v.naam!==null&&`naam: ${r.name} → ${v.naam}`,v.soort!==null&&`soort: ${r.kind==='week'?'weektaak':'dagdienst'} → ${v.soort==='week'?'weektaak':'dagdienst'}`,v.aan!==null&&(v.aan?'aanzetten':'uitzetten (niet meer te plannen; gedraaide diensten houden hun punten)')].filter(Boolean) as string[];
   return await propose({type:name,input:{pot:v.pot,id:r.id,name:v.naam,kind:v.soort,active:v.aan},title:`Rol ${r.name} bij ${potName(v.pot)} wijzigen`,details});}
  case 'producten_zoeken':{
   const term=String(v.zoekterm).trim().toLowerCase(),dep=String(v.afdeling).trim().toLowerCase();
   const found=(await ctx.products()).filter(p=>!p.deleted&&(!term||p.name.toLowerCase().includes(term))&&(!dep||p.department.toLowerCase().includes(dep)));
   return ok({aantal_gevonden:found.length,producten:found.slice(0,25).map(p=>({product_id:p.id,naam:p.name,afdeling:p.department,prijs:euro(p.priceCents),btw:p.vat||'onbekend',gepubliceerd:p.published,beschikbaar:p.available,notitie:p.note,...(()=>{const u=photoAddress(p.photo);return u?{toon:showPhoto(p.name,u)}:{foto:'geen'}})()}))},source);}
  case 'bloei_bekijken':{
   if(!ctx.bloei)refuse('Bloei is hier niet beschikbaar.');
   const all=await ctx.bloei!('');if(!all)return ok({bloei:'Er is nog geen echte Bloei-administratie overgenomen; alleen de proefomgeving bestaat.'},source);
   const members=(all.members as {id:string;name:string}[])||[],sums=(all.memberSummaries as {memberId:string;bonds:number;spendable:number}[])||[];
   const term=String(v.houder).trim().toLowerCase(),found=term?members.filter(m=>m.id===v.houder||m.name.toLowerCase().includes(term)):members;
   const row=(m:{id:string;name:string})=>{const x=sums.find(s=>s.memberId===m.id);return {houder_id:m.id,naam:m.name,obligaties:euro(x?.bonds||0),tegoed_te_besteden:euro(x?.spendable||0)}};
   if(found.length!==1)return ok({alleen_lezen:true,overgenomen_op:all.importedAt,aantal_gevonden:found.length,houders:found.slice(0,40).map(row),uitleg:found.length?'Kies één houder voor de details.':'Niemand gevonden met die naam.'},source);
   const d=await ctx.bloei!(found[0].id);if(!d)refuse('Bloei is nu niet beschikbaar.');
   const h=(d!.holdings as {nominal:number;quantity:number;rate:number;anniversary:string;matures:string}[]||[]).map(p=>({bedrag:euro(p.nominal),aantal:p.quantity,rente_procent:p.rate,sinds:p.anniversary,looptijd_tot:p.matures}));
   return ok({alleen_lezen:true,...row(found[0]),obligaties_detail:h,tegoed:d!.sourceCredit,geschiedenis:(d!.sourceHistory as unknown[]||[]).slice(-25),gekoppelde_ledenkaart:d!.linkedCards,waarschuwingen:d!.warnings},source);}
  case 'betalingen_bekijken':{
   if(!ctx.finance)refuse('Financiën is hier niet beschikbaar.');
   if(['bankverdeling','maandagvraag'].includes(v.onderdeel)&&!validDay(v.week))refuse('Geef de maandag van de week als JJJJ-MM-DD.');
   const data=await ctx.finance!(v.onderdeel,v.week,v.jaar||Number(ctx.today.slice(0,4)));
   const text=JSON.stringify(data);return {content:text.length>14000?text.slice(0,14000)+' …(afgekapt; vraag een kleiner onderdeel of een andere week)':text,isError:false,source};}
  case 'uitbetaling_beslissen':{
   if(v.besluit==='afwijzen'&&!v.reden.trim())refuse('Geef bij afwijzen een reden.');
   if(v.soort==='rente'&&!v.jaar)refuse('Geef bij rente het jaar.');
   return await propose({type:name,input:{soort:v.soort,id:v.id,version:v.versie,besluit:v.besluit,note:v.reden.trim(),year:v.jaar},title:`${v.soort==='rente'?'Rentebetaling':'Uitbetaling BB-tegoed'} ${v.besluit==='goedkeuren'?'goedkeuren':'afwijzen'}`,
    details:[v.besluit==='goedkeuren'?'Bij bunq komt een conceptbetaling klaar te staan; bevestig hem in de bunq-app.':'Reden: '+v.reden.trim()]});}
  case 'uitbetalingen_klaarzetten':{
   if(v.soort==='maandagvraag'&&!validDay(v.week))refuse('Geef de maandag van de week als JJJJ-MM-DD.');
   if(v.soort==='rente'&&!v.jaar)refuse('Geef het jaar.');
   return await propose({type:name,input:{soort:v.soort,week:v.week,year:v.jaar},title:v.soort==='rente'?`Rente ${v.jaar} klaarzetten`:`Maandagvraag van ${dutchDate(v.week)} klaarzetten`,details:['Daarna per regel goedkeuren of afwijzen.']});}
  case 'factuur_mailen':return await propose({type:name,input:{id:v.rekening_id},title:'Factuur mailen aan de rekeninghouder',details:['Vanaf de mailbox van Gesprekken.']});
  case 'fotos_zoeken':{
   const term=String(v.zoekterm).trim().toLowerCase(),hit=(n:string)=>!term||n.toLowerCase().includes(term);
   const products=(await ctx.products()).filter(p=>!p.deleted&&hit(p.name)).map(p=>({p,u:photoAddress(p.photo)})).filter(x=>x.u);
   const used=new Set(products.map(x=>x.u));
   const media=(ctx.media?await ctx.media():[]).filter(m=>hit(m.name)&&!used.has('/api/media/'+m.id));
   const list=[...products.map(x=>({soort:'productfoto',naam:x.p.name,product_id:x.p.id,toon:showPhoto(x.p.name,x.u!)})),...media.map(m=>({soort:'beeldbibliotheek',naam:m.name,toon:showPhoto(m.name,'/api/media/'+m.id)}))];
   return ok({aantal_gevonden:list.length,uitleg:'Zet de regel „toon” van elke foto die je wilt laten zien letterlijk op een eigen regel in je antwoord. Hooguit 6 tegelijk.',fotos:list.slice(0,12)},source);}
  case 'personeel_signalen':{const list=await ctx.signals();return ok({aantal:list.length,toelichting:'Een signaal verdwijnt zodra er voor die dag een eigen bezetting is gezet (ook 0 = geen diensten nodig).',signalen:list.map(x=>({pot:x.pot,naam_pot:x.potName,dag:x.day,datum:dutchDate(x.day),reden:x.text,geboekt:x.items}))},source);}
  case 'afspraken_zoeken':return ok({afspraken:await ctx.afspraken(String(v.zoekterm))},source);
  case 'contracten_bekijken':await memberOf(ctx,v.lid_id);return ok(await ctx.contracts(v.lid_id),source);
  case 'rolcontract_bekijken':return ok(await ctx.roleContract(v.pot,v.rol_id),source);
  case 'rolcontract_voorstel':{
   const current=await ctx.roleContract(v.pot,v.rol_id);if(!current.active||current.hash!==v.basis_hash)refuse('De rol of de conceptafspraak is gewijzigd. Lees dit eerst opnieuw.');
   return await propose({type:name,input:{pot:v.pot,roleId:v.rol_id,hash:v.basis_hash,roleText:v.roltekst,period:v.periode,protocols:v.protocollen,reason:v.reden},title:'Conceptafspraak · '+current.name+' · '+current.potName,details:[v.reden,'Looptijd voor nieuwe afspraken: '+v.periode,v.roltekst,...(v.protocollen?['Protocollen: '+v.protocollen]:[]),'De bestaande basisafspraken blijven opgenomen. Alleen een concept; de groep stelt de basistekst vast.']});
  }
  case 'contract_tekstvoorstel':{
   const member=await memberOf(ctx,v.lid_id);if(!member.active||!['A','B','C','L'].includes(member.memberClass))refuse('Dit voorstel is voor een actief coöperatielid.');
   const context=await ctx.contracts(v.lid_id),contract=context.contracts.find(c=>c.id===v.contract_id);if(!contract||contract.hash!==v.basis_hash)refuse('Deze afspraak is gewijzigd of hoort niet bij dit lid. Lees het opnieuw.');
   if(v.doel==='basistekst'&&(!v.roltekst||v.aanvullingen!==null||v.protocollen!==null))refuse('Een basistekstvoorstel bevat alleen de nieuwe basistekst. Persoonlijke aanvullingen blijven apart.');
   if(v.doel==='dit_contract'&&contract!.key==='lidmaatschap'&&v.roltekst!==null)refuse('Wijzig de algemene basistekst via doel basistekst; persoonlijke aanvullingen kunnen bij deze afspraak.');
   if(v.roltekst===null&&v.aanvullingen===null&&v.protocollen===null)refuse('Er staat geen tekstverbetering in.');
   return await propose({type:name,input:{participantId:member.id,contractId:contract!.id,revision:contract!.revision,hash:contract!.hash,templateVersion:context.templateEditVersion,target:v.doel,roleText:v.roltekst,extras:v.aanvullingen,protocols:v.protocollen,reason:v.reden},title:(v.doel==='basistekst'?'Nieuw basistekstvoorstel':'Nieuw voorstel voor een afspraak')+' · '+member.name+' · '+contract!.name,details:[v.reden,...(v.roltekst?['Nieuwe functietekst: '+v.roltekst]:[]),...(v.aanvullingen!==null?['Aanvullingen: '+v.aanvullingen]:[]),...(v.protocollen!==null?['Protocollen: '+v.protocollen]:[]),'Alleen een concept; voorleggen, goedkeuren en ondertekenen blijven afzonderlijke stappen.']});
  }
  case 'overleg_voorstel':
   if(v.geldt_vanaf&&v.geldt_vanaf<ctx.today)refuse('Een afspraak geldt nooit met terugwerkende kracht. Kies een datum vanaf vandaag.');
   return await propose({type:name,input:{title:v.titel,text:v.tekst,pot:v.pot,topic:v.soort,validFrom:v.geldt_vanaf},title:`Concept-voorstel „${v.titel}”`,details:[v.pot?potName(v.pot):'Algemeen',v.soort==='verdeling'?'over de verdeling: de pot-afspraak pas je na vaststellen zelf aan':'',v.geldt_vanaf?`geldt vanaf ${dutchDate(v.geldt_vanaf)}`:'','na Uitvoeren: concept bij Overleg; versturen doe je daar zelf'].filter(Boolean)});
  case 'openingstijden_bekijken':{const h=await ctx.hours();return ok({vandaag:ctx.today,vast:h.weekly,afwijkend:h.exceptions.filter(e=>e.datum>=ctx.today)},source);}

  case 'dienst_inplannen':case 'dienst_vrijgeven':{
   if(name==='dienst_inplannen'&&v.dag<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   const m=await memberOf(ctx,v.lid_id),r=await roleOf(ctx,v.pot,v.rol_id);
   const verb=name==='dienst_inplannen'?'inplannen':'vrijgeven';
   return await propose({type:name,input:{pot:v.pot,day:v.dag,roleId:v.rol_id,participantId:v.lid_id},title:`${m.name} ${verb} als ${r.name}`,details:[`${potName(v.pot)}, ${dutchDate(v.dag)}`]});}
  case 'bezetting_instellen':{
   if(v.dag&&v.dag<ctx.today)refuse('Deze dag is al voorbij.');
   const r=await roleOf(ctx,v.pot,v.rol_id);
   return await propose({type:name,input:{pot:v.pot,day:v.dag,roleId:v.rol_id,count:v.aantal,note:v.omschrijving},title:`${r.name}: ${v.aantal} ${v.aantal===1?'persoon':'mensen'} nodig`,details:[`${potName(v.pot)}, ${v.dag?dutchDate(v.dag):'standaard voor elke dag'}`,...(v.omschrijving!==null?[`omschrijving: ${v.omschrijving||'(leeg)'}`]:[])]});}
  case 'diensten_melden':{
   if(v.dag<ctx.today)refuse('Deze dag is al voorbij.');
   const names:string[]=[];for(const id of v.rol_ids)names.push((await roleOf(ctx,v.pot,id)).name);
   return await propose({type:name,input:{pot:v.pot,day:v.dag,roleIds:v.rol_ids},title:`Nieuwe diensten melden aan de leden (direct)`,details:[`${potName(v.pot)}, ${dutchDate(v.dag)}: ${names.join(', ')}`,'Pushbericht alleen aan leden die voor die rol zijn aangenomen en nog niet ingepland staan.']});}
  case 'lid_aanmaken':{
   const same=(await ctx.members()).find(m=>m.name.trim().toLowerCase()===v.naam.toLowerCase()||(v.email&&m.email.trim().toLowerCase()===v.email.toLowerCase()));
   if(same)refuse(`Er bestaat al een lid ${same.name} (${same.email||'zonder e-mail'}), id ${same.id}. Vraag of het om dezelfde persoon gaat; wijzig dan de ledenkaart.`);
   return await propose({type:name,input:{name:v.naam,email:v.email,phone:v.telefoon,address:v.adres,memberSince:v.lid_sinds,units:v.afdelingen},title:`Nieuw lid ${v.naam} aanmaken`,
    details:[v.email&&`e-mail ${v.email}`,v.telefoon&&`telefoon ${v.telefoon}`,v.adres&&`adres ${v.adres}`,v.lid_sinds&&`lid sinds ${dutchDate(v.lid_sinds)}`,v.afdelingen.length?`afdelingen: ${v.afdelingen.join(', ')}`:''].filter(Boolean) as string[]});}
  case 'ledenkaart_wijzigen':{
   const m=await memberOf(ctx,v.lid_id),details:string[]=[];
   if(v.email!==null)details.push(`e-mail: ${m.email||'(leeg)'} → ${v.email||'(leeg)'}`);
   if(v.telefoon!==null)details.push(`telefoon: ${m.phone||'(leeg)'} → ${v.telefoon||'(leeg)'}`);
   if(v.adres!==null)details.push(`adres: ${m.address||'(leeg)'} → ${v.adres||'(leeg)'}`);
   if(v.afdelingen!==null)details.push(`afdelingen: ${m.units.join(', ')||'(geen)'} → ${v.afdelingen.join(', ')||'(geen)'}`);
   if(v.rollen!==null)for(const r of v.rollen){const names=[];for(const id of r.rol_ids)names.push((await roleOf(ctx,r.pot,id)).name);details.push(`rollen ${potName(r.pot)}: ${names.join(', ')||'(geen)'}`)}
   if(!details.length)refuse('Er staat geen wijziging in. Vul minstens één veld in (niet null).');
   return await propose({type:name,input:{participantId:m.id,email:v.email,phone:v.telefoon,address:v.adres,units:v.afdelingen,potRoles:v.rollen?Object.fromEntries(v.rollen.map((r:{pot:string;rol_ids:string[]})=>[r.pot,r.rol_ids])):null},title:`Ledenkaart van ${m.name} wijzigen`,details});}
  case 'product_aanmaken':{
   const same=(await ctx.products()).find(p=>!p.deleted&&p.name.trim().toLowerCase()===v.naam.toLowerCase());
   if(same)refuse(`Er bestaat al een product ${same.name} (id ${same.id}). Vraag of het om hetzelfde product gaat.`);
   return await propose({type:name,input:{name:v.naam,department:v.afdeling,priceCents:v.prijs_cent,vat:v.btw,note:v.notitie,publish:v.publiceren===true},title:`Nieuw product ${v.naam}${v.publiceren?'':' (concept)'}`,details:[`${v.afdeling}, ${euro(v.prijs_cent)}, btw ${v.btw?v.btw+'%':'nog invullen'}`,v.publiceren?'Meteen gepubliceerd: zichtbaar voor gasten.':'Concept: nog niet zichtbaar voor gasten.']});}
  case 'product_tekst_wijzigen':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   if(v.naam===null&&v.notitie===null)refuse('Er staat geen wijziging in.');
   return await propose({type:name,input:{productId:p.id,name:v.naam,note:v.notitie},title:`Product ${p.name} aanpassen`,details:[v.naam!==null&&`naam: ${p.name} → ${v.naam}`,v.notitie!==null&&`notitie: ${v.notitie||'(leeg)'}`,p.published&&'Ook meteen gepubliceerd.'].filter(Boolean) as string[]});}
  case 'product_wijzigen':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   return await propose({type:name,input:{productId:p.id,priceCents:v.prijs_cent,vat:v.btw,available:v.beschikbaar},title:`Product ${p.name} wijzigen`,details:[v.prijs_cent!==null&&`prijs: ${euro(p.priceCents)} → ${euro(v.prijs_cent)}`,v.btw!==null&&`btw: ${p.vat||'leeg'} → ${v.btw}%`,v.beschikbaar!==null&&(v.beschikbaar?'weer beschikbaar':'niet beschikbaar (uitverkocht)'),p.published&&'Geldt meteen voor gasten.'].filter(Boolean) as string[]});}
  case 'product_publiceren':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   if(v.publiceren&&!p.vat)refuse(`${p.name} heeft nog geen btw-tarief. Zet dat eerst met product_wijzigen.`);
   return await propose({type:name,input:{productId:p.id,publish:v.publiceren},title:`${p.name} ${v.publiceren?'publiceren':'offline halen'}`,details:[v.publiceren?'Zichtbaar voor gasten, met de laatste versie.':'Niet meer zichtbaar voor gasten; het concept blijft bewaard.']});}
  case 'klanten_zoeken':{
   const term=v.zoekterm.toLowerCase(),tel=digits(v.zoekterm),all=await ctx.customers();
   const found=all.filter(c=>[c.name,c.email,c.company].some(x=>x.toLowerCase().includes(term))||(tel.length>=6&&digits(c.phone).includes(tel)));
   return ok({aantal_gevonden:found.length,klanten:found.slice(0,20).map(c=>({klant_id:c.id,naam:c.name,email:c.email,telefoon:c.phone,bedrijf:c.company,adres:c.address,notitie:c.notes.slice(0,300),boekingen:c.bookings,gesprekken:c.conversations}))},source);}
  case 'agenda_bekijken':return ok({vandaag:ctx.today,dagen:await ctx.agenda(v.van,v.dagen)},source);
  case 'klant_aanmaken':{
   const all=await ctx.customers(),mail=v.email.toLowerCase(),tel=digits(v.telefoon);
   const same=all.find(c=>(mail&&c.email.toLowerCase()===mail)||(tel.length>=8&&digits(c.phone)===tel)||c.name.trim().toLowerCase()===v.naam.toLowerCase());
   if(same)refuse(`Er bestaat al een klantenkaart ${same.name} (${same.email||same.phone||'zonder contactgegevens'}), klant_id ${same.id}. Vraag of het om dezelfde klant gaat; maak dan geen tweede kaart.`);
   return await propose({type:name,input:{name:v.naam,email:mail,phone:v.telefoon,address:v.adres,company:v.bedrijf,notes:v.notitie},title:`Nieuwe klantenkaart ${v.naam}`,
    details:[v.bedrijf&&`bedrijf ${v.bedrijf}`,v.email&&`e-mail ${mail}`,v.telefoon&&`telefoon ${v.telefoon}`,v.adres&&`adres ${v.adres}`,v.notitie&&`notitie: ${v.notitie}`].filter(Boolean) as string[]});}
  case 'klantgesprek_inplannen':{
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   const tot=plusMinutes(v.van,v.duur_minuten)||refuse('De afspraak loopt over middernacht. Kies een eerder tijdstip of een kortere duur.');
   const klant=v.klant_id?((await ctx.customers()).find(c=>c.id===v.klant_id)||refuse(`klant_id ${v.klant_id} bestaat niet. Zoek de klant eerst op met klanten_zoeken.`)):null;
   const dag=(await ctx.agenda(v.datum,1))[0],overlap=dag?.afspraken.filter(a=>a.van<tot!&&v.van<a.tot)||[];
   return await propose({type:name,input:{date:v.datum,from:v.van,to:tot,subject:v.onderwerp,customerId:klant?.id||'',customerName:klant?.name||'',notes:v.notitie},title:`Afspraak: ${v.onderwerp}`,
    details:[`${dutchDate(v.datum)}, ${v.van}–${tot}`,klant?`met ${klant.name}`:'zonder klantenkaart',v.notitie,overlap.length?`Let op: tegelijk met ${overlap.map(a=>a.onderwerp+' ('+a.van+'–'+a.tot+')').join(', ')}`:'','Geen boeking: houdt geen plaats vast.'].filter(Boolean)});}
  case 'optie_zetten':{
   const confirmed=v.status==='bevestigd';
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   if(!confirmed&&v.geldig_tot<ctx.today)refuse('De optie moet tot vandaag of later gelden.');
   if(!confirmed&&v.geldig_tot>v.datum)refuse('Een optie kan niet langer gelden dan tot de dag zelf.');
   const klant=(await ctx.customers()).find(c=>c.id===v.klant_id)||refuse(`klant_id ${v.klant_id} bestaat niet. Zoek de klant op met klanten_zoeken of maak eerst een kaart met klant_aanmaken.`);
   const people=v.aantal_gasten??1,given=String(v.uitzondering_reden||'').trim();
   // Inboeken mag altijd (wens eigenaar 13 november 2026). Past het niet in de gewone regels, dan met voorrang en een reden.
   const why=await ctx.checkOption({date:v.datum,from:v.van,to:v.tot,activity:v.soort,people,status:v.status});
   const reden=why?(given||'Op verzoek ingeboekt via de assistent'):given;
   const notes=[v.soort_evenement,v.aantal_gasten===null?'Aantal gasten nog onbekend.':'',v.notitie].filter(Boolean).join('\n');
   const out=await propose({type:name,input:{customerId:klant.id,name:klant.name,email:klant.email,phone:klant.phone,activity:v.soort,date:v.datum,from:v.van,to:v.tot,people,expiresDay:v.geldig_tot,notes,status:v.status,exception:reden,override:!!why},title:`${confirmed?'Boeking':'Optie'} ${v.soort_evenement} · ${klant.name}`,
    details:[`${dutchDate(v.datum)}, ${v.van}–${v.tot}`,v.aantal_gasten===null?'aantal gasten nog onbekend (telt als 1 tot het bekend is)':`${v.aantal_gasten} gasten`,confirmed?'bevestigde boeking':`optie geldig tot en met ${dutchDate(v.geldig_tot)}`,why&&`met voorrang, buiten de gewone regels: ${why}`,reden&&`reden in de agenda: ${reden}`,v.notitie,'Geen offerte en geen factuur.'].filter(Boolean) as string[]});
   if(out.isError)return out;
   const extra={...(why?{buiten_de_gewone_regels:why,uitleg_voorrang:'Toch ingeboekt met voorrang (de agenda toont de reden). Zeg dit kort, zodat de beheerder het weet. Daggasten en online reserveringen zijn NIET opengezet.'}:{}),
    vervolgvragen:'Stel nu kort ondersteunende vragen, één of twee tegelijk: Moet ik diensten in de ledenplanning zetten (welke rol, hoeveel mensen; bezetting_instellen) en de leden direct laten weten? Zijn er wensen voor eten en drinken (bijvoorbeeld op de boodschappenlijst of als product)? Moet de gast een bevestiging of offerte krijgen?'};
   return {...out,content:JSON.stringify({...JSON.parse(out.content),...extra})};}
  case 'groepsdag_instellen':{
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   return await propose({type:name,input:{date:v.datum,from:v.van,to:v.tot,note:v.notitie},title:`Groepsdag ${dutchDate(v.datum)}`,details:[`groepen welkom van ${v.van} tot ${v.tot}`,v.notitie,'Dicht voor daggasten en online reserveringen; de gesloten periode verandert niet.']});}
  case 'boeking_bevestigen':
   return await propose({type:name,input:{reservationId:v.boeking_id,note:v.notitie},title:'Boeking bevestigen',details:[v.notitie||'optie of aanvraag wordt een bevestigde boeking']});
  case 'openingstijden_wijzigen':
   return await propose({type:name,input:{weekday:v.weekdag,open:v.open,from:v.van,to:v.tot},title:`Openingstijden op ${v.weekdag}`,details:[v.open?`elke ${v.weekdag} open van ${v.van} tot ${v.tot}`:`elke ${v.weekdag} gesloten`]});
  case 'afwijkende_dag':
   if(v.datum<ctx.today)refuse('Deze datum is al voorbij.');
   return await propose({type:name,input:{date:v.datum,open:v.open,from:v.van,to:v.tot,note:v.notitie.trim()},title:`Afwijkende dag ${dutchDate(v.datum)}`,details:[v.open?`open van ${v.van} tot ${v.tot}`:'gesloten',v.notitie.trim()].filter(Boolean)});
  }
  return {content:'Onbekend hulpmiddel.',isError:true,source};
 }catch(e){
  if(e instanceof Refuse)return {content:e.message,isError:true,source};
  return {content:'Het ophalen lukte niet: '+(e instanceof Error?e.message:'onbekende fout')+'. Zeg eerlijk dat deze gegevens nu niet beschikbaar zijn.',isError:true,source};
 }
}
function ok(v:unknown,source:string):ToolOutcome{return {content:JSON.stringify(v),isError:false,source}}
