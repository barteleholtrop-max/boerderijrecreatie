// Pakbon fotograferen (wens eigenaar 17 november 2026: „pakbon fotograferen, zodat hij vanuit de pakbon de voorraad automatisch
// voorstel kan doen … uit de factuur de prijs haalt”). Pure regels zonder database of netwerk, zodat ze te testen zijn.
// 1. Claude leest de foto('s) van de pakbon: leverancier, pakbonnummer, datum en per regel artikelnummer, omschrijving, aantal en eenheid.
// 2. Elke regel krijgt een voorstel: een bestaand ingrediënt (eerst op leverancier + artikelnummer, dan op naam, dan Claudes keuze)
//    of een nieuw ingrediënt met de leverancier en het artikelnummer van de pakbon.
// 3. De medewerker controleert en tikt op „Voorraad bijwerken”: per regel een gewone voorraadbeweging „Levering (pakbon)”.
// Kassabon (wens eigenaar 17 november 2026: „en als we zelf inkopen doen bij de Lidl of Jumbo”): dezelfde stappen, maar de bon heeft
// ook de prijzen. Bij het boeken komt de bon meteen als inkoopbon bij Inkoop (prijs zonder btw per ingrediënt), met de regels al
// ontvangen, zodat de voorraad niet dubbel telt. Een bon heeft geen artikelnummers: de tekst van de bon geldt als artikel, zodat
// dezelfde regel van dezelfde winkel de volgende keer vanzelf wordt herkend.
// Factuur uploaden (wens eigenaar 17 november 2026: „ook de optie pakbon of factuur uploaden”): een foto of PDF van een factuur. Zelfde
// stappen met de prijs per regel zonder btw. Staat de levering al met de pakbon in de voorraad, dan alleen de prijzen (geen voorraad erbij).
// Prijs: de pakbon heeft er geen. Omdat het ingrediënt de leverancier en het artikelnummer van de pakbon draagt, koppelt de factuur
// van dezelfde leverancier zich er bij het inlezen vanzelf aan (lib/costing.ts suggestIngredient) en komt de prijs uit de factuur.
import {suggestIngredient,cleanName} from './costing';
import type {Ingredient,Invoice,Ops,Unit} from './operations-core';

export type SlipCandidate={id:string;name:string;unit:Unit;supplier:string;article:string};
export type SlipLine={n:number;article:string;description:string;quantity:number;unit:Unit;packages:number|null;perPackage:number|null;
 ingredientId:string|null;match:'artikel'|'naam'|'claude'|null;amount:number;note:string;totalCents:number|null;vatPct:9|21|null};
export type SlipKind='pakbon'|'kassabon'|'factuur';
export const SLIP_KINDS:SlipKind[]=['pakbon','kassabon','factuur'];
/** true = kassabon (oud), false/leeg = pakbon. */
export const kindOf=(v:unknown):SlipKind=>v===true?'kassabon':typeof v==='string'&&SLIP_KINDS.includes(v as SlipKind)?v as SlipKind:'pakbon';
const NAME:Record<SlipKind,string>={pakbon:'pakbon',kassabon:'kassabon',factuur:'factuur'};
export type Slip={kind:SlipKind;receipt:boolean;supplier:string;number:string;date:string|null;lines:SlipLine[]};
export const MAX_SLIP_PAGES=4,MAX_SLIP_LINES=80;
export const SLIP_REASON='Levering (pakbon)',SLIP_START_REASON='Beginvoorraad (levering pakbon)';
export const RECEIPT_REASON='Eigen inkoop (kassabon)',RECEIPT_START_REASON='Beginvoorraad (kassabon)';
export const INVOICE_REASON='Levering (factuur)',INVOICE_START_REASON='Beginvoorraad (levering factuur)';
const REASONS:Record<SlipKind,[string,string]>={pakbon:[SLIP_REASON,SLIP_START_REASON],kassabon:[RECEIPT_REASON,RECEIPT_START_REASON],factuur:[INVOICE_REASON,INVOICE_START_REASON]};
export const BOOKED_REASONS=Object.values(REASONS).flat();
/** Prijs op de bon (met btw) → zonder btw, zoals inkoopfacturen (voorbelasting is geen kostprijs). */
export const netOf=(totalCents:number,vatPct:9|21)=>Math.round(totalCents*100/(100+vatPct));
const UNITS:Unit[]=['kg','l','st'];
const str=(v:unknown,max=200)=>typeof v==='string'?v.normalize('NFC').replace(/\s+/g,' ').trim().slice(0,max):'';
const pos=(v:unknown,max=100000)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max?Math.round(v*1000)/1000:null;
const unitOf=(v:unknown):Unit|null=>typeof v==='string'&&UNITS.includes(v as Unit)?v as Unit:null;

/** Het JSON-schema dat Claude moet volgen (gestructureerde uitvoer). */
export function slipSchema(candidates:SlipCandidate[],kindArg:SlipKind|boolean=false){
 const kind=kindOf(kindArg),receipt=kind==='kassabon',invoice=kind==='factuur';
 const ids=candidates.map(c=>c.id);
 const price=receipt||invoice?{totalCents:{anyOf:[{type:'integer'},{type:'null'}],description:invoice?'het nettobedrag van deze regel in centen, zonder btw en na korting':'het bedrag van deze regel op de bon in centen, met btw en na korting op deze regel'},
  vatPct:{anyOf:[{type:'integer',enum:[9,21]},{type:'null'}],description:'het btw-tarief van deze regel (9 of 21), volgens de btw-code op de bon'}}:{};
 return {type:'object',additionalProperties:false,required:['readable','supplier','number','date','lines'],properties:{
  readable:{type:'boolean',description:receipt?'false als er geen leesbare kassabon op de foto staat':invoice?'false als er geen leesbare inkoopfactuur in staat':'false als er geen leesbare pakbon of leverbon op de foto staat'},
  supplier:{type:'string',description:receipt?'de winkel, bijvoorbeeld Lidl of Jumbo (zonder vestiging)':'de naam van de leverancier, zoals op de pakbon'},
  number:{type:'string',description:receipt?'de tijd en het bon- of transactienummer, bijvoorbeeld 14:32 bon 0457; leeg als ze er niet staan':invoice?'het factuurnummer':'het pakbon-, leverbon- of ordernummer; leeg als het er niet staat'},
  date:{anyOf:[{type:'string',description:'leverdatum als JJJJ-MM-DD'},{type:'null'}]},
  lines:{type:'array',items:{type:'object',additionalProperties:false,required:['article','description','packages','perPackage','quantity','unit','ingredientId',...(receipt||invoice?['totalCents','vatPct']:[])],properties:{...price,
   article:{type:'string',description:'het artikelnummer van de leverancier; leeg als het er niet staat'},
   description:{type:'string',description:'de omschrijving zoals op de pakbon'},
   packages:{anyOf:[{type:'number'},{type:'null'}],description:'het aantal geleverde verpakkingen (dozen, zakken, flessen, kratten)'},
   perPackage:{anyOf:[{type:'number'},{type:'null'}],description:'de inhoud van één verpakking in de eenheid hieronder (6 bij een doos van 6 stuks, 5 bij een zak van 5 kg)'},
   quantity:{type:'number',description:'de totale geleverde hoeveelheid in de eenheid hieronder'},
   unit:{type:'string',enum:UNITS,description:'kg, l (liter) of st (stuks)'},
   ingredientId:ids.length?{anyOf:[{type:'string',enum:ids},{type:'null'}],description:'het ingrediënt uit de lijst dat hetzelfde product is, of null'}:{type:'null'}}}}}};
}
export function slipPrompt(candidates:SlipCandidate[],kindArg:SlipKind|boolean=false){
 const kind=kindOf(kindArg),receipt=kind==='kassabon';
 return (kind==='factuur'
  ?'Dit is één inkoopfactuur (foto’s of PDF) van een leverancier van Boer Bart, een boerderij met restaurant, koffiebar en winkel. '
   +'Lees de leverancier, het factuurnummer, de factuurdatum en elke productregel met het nettobedrag zonder btw (na korting). Sla regels over die geen product zijn (statiegeld, emballage, bezorgkosten, toeslagen, subtotalen, btw, totaal). '
   +'Neem per regel het btw-tarief (9 of 21) over van de factuur. '
  :receipt
  ?'Dit zijn foto’s van één kassabon van een eigen inkoop door Boer Bart (een boerderij met restaurant, koffiebar en winkel) in een supermarkt zoals Lidl of Jumbo. '
   +'Lees de winkel, de datum, de tijd en het bonnummer, en elke gekochte productregel met het bedrag. Sla regels over die geen product zijn (statiegeld, emballage, tasjes, subtotalen, totaal, betaling, spaarpunten). '
   +'Een korting of bonus hoort bij het product erboven: trek die af van het bedrag van dat product. Neem als artikel de tekst van de regel zoals op de bon. '
   +'Het btw-tarief per regel staat meestal als code (bijvoorbeeld A of B) met onderaan de uitleg; levensmiddelen zijn meestal 9%, andere spullen 21%. '
  :'Dit zijn foto’s van één pakbon (leverbon) van een levering aan Boer Bart, een boerderij met restaurant, koffiebar en winkel. '
   +'Lees de leverancier, het pakbonnummer, de leverdatum en elke geleverde productregel. Sla regels over die geen product zijn (statiegeld, emballage, kratten retour, bezorgkosten, totalen). ')
  +'Per regel: het artikelnummer, de omschrijving, het aantal verpakkingen, de inhoud per verpakking en de totale hoeveelheid in kg, liter (l) of stuks (st). '
  +'Voorbeelden: „2 ds Tomaten 5 kg” = 2 verpakkingen × 5 kg = 10 kg; „3 × melk 1 L” = 3 l; „1 doos eieren 30 st” = 30 st. Grammen en milliliters omrekenen naar kg en l. '
  +'Is de inhoud per verpakking onbekend, tel dan de verpakkingen als stuks. '
  +(candidates.length?'Kies per regel het ingrediënt dat hetzelfde product is uit deze lijst (id: naam · eenheid · leverancier · artikelnummer):\n'
   +candidates.map(c=>`${c.id}: ${c.name} · ${c.unit} · ${c.supplier||'-'} · ${c.article||'-'}`).join('\n')
   +'\nKies alleen een ingrediënt als het echt hetzelfde product is (volle melk is geen karnemelk); anders null. ':'Zet ingredientId steeds op null. ')
  +'Raad niet: wat je niet zeker kunt lezen laat je leeg of null. Staat er geen '+NAME[kind]+' in, zet readable op false.';
}

/** De voorgestelde hoeveelheid in de eenheid van het ingrediënt. Andere eenheid en het ingrediënt heeft een verpakkingsgrootte:
 *  verpakkingen × verpakking; anders de hoeveelheid van de pakbon, met een opmerking om te controleren. */
function amountFor(l:{quantity:number;unit:Unit;packages:number|null},i:Ingredient|null){
 if(!i||i.unit===l.unit)return {amount:l.quantity,note:''};
 if(l.unit==='st'&&i.pack>0){const n=l.packages??l.quantity;return {amount:Math.round(n*i.pack*1000)/1000,note:`${n} × ${i.pack} ${i.unit} per verpakking. Controleer de hoeveelheid.`}}
 return {amount:l.quantity,note:`Op de pakbon in ${l.unit}, het ingrediënt telt in ${i.unit}. Controleer de hoeveelheid.`};
}

/** Controleert het antwoord van Claude en maakt het voorstel per regel. */
export function checkSlip(raw:unknown,ingredients:Ingredient[],kindArg:SlipKind|boolean=false):{ok:true;slip:Slip}|{ok:false;reason:string}{
 const kind=kindOf(kindArg),receipt=kind==='kassabon',priced=kind!=='pakbon';
 const a=(raw&&typeof raw==='object'?raw:{}) as {readable?:unknown;supplier?:unknown;number?:unknown;date?:unknown;lines?:unknown};
 if(a.readable!==true)return {ok:false,reason:`We vonden geen leesbare ${NAME[kind]}. Leg hem plat, zonder schaduw of schittering, en probeer het opnieuw.`};
 const supplier=str(a.supplier),number=str(a.number,60),date=typeof a.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)?a.date:null;
 const lines:SlipLine[]=[];const byId=new Map(ingredients.map(i=>[i.id,i]));
 for(const r of Array.isArray(a.lines)?a.lines.slice(0,MAX_SLIP_LINES):[]){
  const l=(r&&typeof r==='object'?r:{}) as Record<string,unknown>;
  const description=str(l.description),unit=unitOf(l.unit),quantity=pos(l.quantity);
  // Een kassabon heeft geen artikelnummers: de tekst van de bon is het artikel (zelfde winkel, zelfde tekst = hetzelfde product).
  const article=str(l.article,60)||(receipt?description.slice(0,60):'');
  if(!description||!unit||quantity===null)continue;
  const packages=pos(l.packages),perPackage=pos(l.perPackage);
  // Eerst de vaste regels (zelfde leverancier en artikelnummer, of alle woorden van de naam), dan Claudes keuze.
  const rule=suggestIngredient({article,description,unit},supplier,ingredients);
  const own=typeof l.ingredientId==='string'?byId.get(l.ingredientId)??null:null;
  const picked=rule?byId.get(rule.ingredientId)??null:own&&own.origin!=='eigen'?own:null;
  const {amount,note}=amountFor({quantity,unit,packages},picked);
  const total=priced&&typeof l.totalCents==='number'&&Number.isSafeInteger(l.totalCents)&&l.totalCents>=0&&l.totalCents<=10000000?l.totalCents:null;
  const vatPct=priced?(l.vatPct===21?21:9):null;
  lines.push({n:lines.length+1,article,description,quantity,unit,packages,perPackage,ingredientId:picked?.id??null,match:rule?rule.reason:picked?'claude':null,amount,note,totalCents:total,vatPct});
 }
 if(!lines.length)return {ok:false,reason:`We vonden geen productregels op de ${NAME[kind]}. Fotografeer de hele bon, recht en dichtbij.`};
 return {ok:true,slip:{kind,receipt,supplier,number,date,lines}};
}

/** Een nieuw ingrediënt vanuit een pakbonregel, met de leverancier en het artikelnummer zodat de factuur er later aan koppelt. */
export function slipIngredient(l:{description:string;article:string;unit:Unit;perPackage:number|null;name?:string},supplier:string,id:string,today:string,kindArg:SlipKind|boolean=false):Ingredient{
 const kind=kindOf(kindArg);
 return {id,name:str(l.name)||cleanName(l.description),unit:l.unit,supplier:str(supplier),article:str(l.article,60),stock:0,known:false,countedAt:'',
  pack:l.perPackage&&l.perPackage>0?l.perPackage:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,
  notes:kind==='factuur'?`Aangemaakt vanuit een factuur (${today}): ${l.description.slice(0,300)}. Allergenen nog controleren; de prijs komt van de factuur.`:kind==='kassabon'?`Aangemaakt vanuit een kassabon (${today}): ${l.description.slice(0,300)}. Allergenen nog controleren; de prijs komt van de kassabon.`:`Aangemaakt vanuit een pakbon (${today}): ${l.description.slice(0,300)}. Allergenen en prijs nog controleren; de prijs komt uit de factuur.`,origin:'inkoop',ownCents:null};
}

type Price={totalCents:number;vatPct:9|21}|{totalCents?:undefined;vatPct?:undefined};
export type SlipBooking={kind:SlipKind;receipt:boolean;priced:boolean;stock:boolean;date:string|null;supplier:string;number:string;by:string;lines:((({ingredientId:string;quantity:number}|{newIngredient:{name:string;description:string;article:string;unit:Unit;perPackage:number|null};quantity:number}))&Price)[]};
/** Controleert wat de werkplek wil boeken. */
export function checkBooking(raw:unknown):SlipBooking{
 const b=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const by=str(b.by,60);if(!by)throw Error('Vul bovenaan in wie je bent.');
 const kind=kindOf(b.kind??b.receipt),receipt=kind==='kassabon',priced=kind!=='pakbon',supplier=str(b.supplier),number=str(b.number,60);if(!supplier)throw Error(receipt?'Vul de winkel in.':'Vul de leverancier in.');
 // Factuur van een levering die al met de pakbon in de voorraad staat: alleen de prijzen (stock:false).
 const stock=kind!=='factuur'||b.stock!==false;
 if(kind==='factuur'&&!number)throw Error('Vul het factuurnummer in.');
 const date=typeof b.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.date)?b.date:null;
 if(receipt&&!number)throw Error('Vul de tijd of het bonnummer van de kassabon in, zodat dezelfde bon niet twee keer wordt geboekt.');
 if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>MAX_SLIP_LINES)throw Error(`Kies 1 tot ${MAX_SLIP_LINES} regels.`);
 const lines:SlipBooking['lines']=[];const seen=new Set<string>();
 for(const r of b.lines as unknown[]){
  const l=(r&&typeof r==='object'?r:{}) as Record<string,unknown>;const quantity=pos(l.quantity);
  if(quantity===null)throw Error('Vul bij elke regel een hoeveelheid groter dan 0 in.');
  let price:Price={};
  if(priced){const t=l.totalCents;if(typeof t!=='number'||!Number.isSafeInteger(t)||t<0||t>10000000)throw Error(kind==='factuur'?'Vul bij elke regel het bedrag zonder btw in.':'Vul bij elke regel het bedrag van de bon in.');price={totalCents:t,vatPct:l.vatPct===21?21:9}}
  if(typeof l.ingredientId==='string'&&l.ingredientId){if(seen.has(l.ingredientId))throw Error('Hetzelfde ingrediënt staat er twee keer in. Tel die regels samen.');seen.add(l.ingredientId);lines.push({ingredientId:l.ingredientId,quantity,...price});continue}
  const n=(l.newIngredient&&typeof l.newIngredient==='object'?l.newIngredient:{}) as Record<string,unknown>;
  const unit=unitOf(n.unit),name=str(n.name),description=str(n.description);
  if(!unit||!(name||description))throw Error('Een nieuw ingrediënt heeft een naam en een eenheid nodig.');
  lines.push({newIngredient:{name,description:description||name,article:str(n.article,60),unit,perPackage:pos(n.perPackage)},quantity,...price});
 }
 return {kind,receipt,priced,stock,date,supplier,number,by,lines};
}
/** De referentie bij elke voorraadbeweging; ook de controle op een pakbon die al geboekt is. */
export const slipReference=(supplier:string,number:string,kindArg:SlipKind|boolean=false)=>{const k=kindOf(kindArg);return `${k==='kassabon'?'Kassabon':k==='factuur'?'Factuur':'Pakbon'} ${supplier}${number?' '+number:''}`.slice(0,200)};

/** Boekt de pakbon op een kopie van de voorraad: nieuwe ingrediënten aanmaken en per regel de voorraad ophogen.
 *  Nog nooit geteld: deze levering is de beginvoorraad (zoals bij een levering van een deelnemer). */
export function applySlip(s:Ops,b:SlipBooking,o:{today:string;newId:()=>string}){
 const ref=slipReference(b.supplier,b.number,b.kind)+' · '+b.by;let created=0;
 const invoiceLines:Invoice['lines']=[];
 for(const l of b.lines){
  let i:Ingredient|undefined;
  if('ingredientId' in l){i=s.ingredients.find(x=>x.id===l.ingredientId);if(!i)throw Error('Een ingrediënt bestaat niet meer. Lees de pakbon opnieuw in.')}
  else{
   const article=l.newIngredient.article,sup=b.supplier.trim().toLowerCase();
   i=article?s.ingredients.find(x=>x.article.trim()===article&&x.supplier.trim().toLowerCase()===sup):undefined;
   if(!i){i=slipIngredient(l.newIngredient,b.supplier,o.newId(),o.today,b.kind);s.ingredients.push(i);created++}
  }
  if(b.priced&&i.origin==='eigen')throw Error(i.name+' is van eigen boerderij en hoort niet op een '+NAME[b.kind]+'. Kies een ingekocht ingrediënt of maak er een nieuw aan.');
  if(b.stock){
   const reason=REASONS[b.kind][i.known?0:1];
   if(!i.known){i.known=true;i.countedAt=o.today;i.stock=0}
   i.stock=Math.round((i.stock+l.quantity)*1e6)/1e6;
   s.moves.push({id:o.newId(),ingredientId:i.id,quantity:l.quantity,date:o.today,reason,reference:ref});
  }
  // Kassabon: de regel met de prijs zonder btw, al ontvangen (de voorraad staat er net bij).
  if(b.priced&&l.totalCents!==undefined)invoiceLines.push({id:o.newId(),article:i.article||('newIngredient' in l?l.newIngredient.article:''),description:'newIngredient' in l?l.newIngredient.description:i.name,quantity:l.quantity,unit:i.unit,netCents:b.kind==='factuur'?l.totalCents:netOf(l.totalCents,l.vatPct),ingredientId:i.id,kind:'product',received:true});
 }
 if(b.priced){
  if(s.invoices.some(v=>v.supplier.trim().toLowerCase()===b.supplier.trim().toLowerCase()&&v.number.trim().toLowerCase()===b.number.trim().toLowerCase()))throw Error(`Deze ${NAME[b.kind]} is al verwerkt.`);
  s.invoices.push({id:o.newId(),supplier:b.supplier,number:b.number,date:b.date&&b.date<=o.today?b.date:o.today,source:(b.kind==='factuur'?'Factuur':'Kassabon')+', ingelezen op de werkplek door '+b.by+(b.kind==='factuur'&&!b.stock?' (levering al via de pakbon in de voorraad)':''),lines:invoiceLines,reviewed:true});
 }
 return {lines:b.lines.length,created};
}
