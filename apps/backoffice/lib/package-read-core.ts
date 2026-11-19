// Verpakte producten herkennen (wens eigenaar 10 november 2026): „Kan het fotograferen ook streepjescodes herkennen? Als we
// bijvoorbeeld vla inkopen van Zuivelrijck is het super handig als hij dat automatisch herkent en een prijsvoorstel doet. Dan
// hoeven we nooit meer zelf producten toe te voegen aan de kassa.” En: „Als een prijsvariant nog niet bestaat dan 20% marge.”
// Pure regels zonder database of netwerk (te testen): streepjescode controleren, de inkoopregel uit de facturen koppelen en het
// prijsvoorstel uitrekenen. Het lezen zelf staat in lib/label-read.ts, het aanmaken in lib/label-products.ts.
import {labelSchema,labelPrompt,productName,sameName,type LabelCandidate} from './label-read-core';

/** Marge voor een nieuw product zonder eigen doelmarge (besluit eigenaar 10 november 2026). Marge zoals in lib/costing.ts:
 *  (verkoopprijs excl. btw − inkoopprijs) / verkoopprijs excl. btw. */
export const NEW_PRODUCT_MARGIN_PCT=20;
export const ROUND_UP_CENTS=10;
export const MAX_PIECES_PER_UNIT=500;

/** Streepjescode (EAN-8, UPC-A, EAN-13, GTIN-14) met geldig controlecijfer, alleen cijfers; anders null. */
export function normalizeEan(v:unknown):string|null{
 if(typeof v!=='string'&&typeof v!=='number')return null;
 const d=String(v).replace(/[\s-]/g,'');
 if(!/^\d+$/.test(d)||![8,12,13,14].includes(d.length))return null;
 const digits=[...d].map(Number),check=digits.pop()!;
 const sum=digits.reverse().reduce((s,n,i)=>s+n*(i%2===0?3:1),0);
 return (10-sum%10)%10===check?d:null;
}
/** Dezelfde code, ook met voorloopnullen (UPC-A 12 cijfers = EAN-13 met een 0 ervoor). */
export const sameEan=(a:string,b:string)=>a.replace(/^0+/,'')===b.replace(/^0+/,'');

/** Verkoopprijs incl. btw bij een inkoopprijs excl. btw en een marge, naar boven afgerond op 10 cent (nooit onder de marge). */
export function proposalCents(unitCostCents:number,vatPct:number,marginPct=NEW_PRODUCT_MARGIN_PCT){
 if(!(unitCostCents>0)||!(marginPct>=0&&marginPct<100)||!(vatPct>=0))throw Error('Ongeldige invoer voor het prijsvoorstel.');
 const incl=unitCostCents/(1-marginPct/100)*(1+vatPct/100);
 return Math.ceil(Math.round(incl*1000)/1000/ROUND_UP_CENTS)*ROUND_UP_CENTS;
}

/** Een regel van een inkoopfactuur (uit de mail gelezen, Inkoop & voorraad). id is kort en alleen voor het lezen ('r1', 'r2', …). */
export type PurchaseLine={id:string;supplier:string;date:string;article:string;description:string;quantity:number;unit:string;netCents:number};

export type PackageAnswer={readable:boolean;productId:string|null;labelName:string;productName:string|null;barcode:string|null;invoiceLineId:string|null;piecesPerUnit:number|null;totalCents:number|null};
export type PackageCost={supplier:string;date:string;description:string;unitCostCents:number};
export type PackageResult={ok:true;productId:string|null;newName:string|null;labelName:string;barcode:string|null;cost:PackageCost|null}|{ok:false;reason:string};

/** Het schema van het etiket-lezen, uitgebreid met verpakking, streepjescode en inkoopregel. */
export function readSchema(candidates:LabelCandidate[],lines:PurchaseLine[]){
 const base=labelSchema(candidates);
 return {...base,required:[...base.required,'productName','barcode','invoiceLineId','piecesPerUnit'],properties:{...base.properties,
  readable:{type:'boolean',description:'false als er geen prijsetiket en geen herkenbare productverpakking op de foto staat'},
  productName:{anyOf:[{type:'string'},{type:'null'}],description:'bij een verpakt product: merk, product en inhoud zoals op de verpakking, bijvoorbeeld „Zuivelrijck vanillevla 1 liter”'},
  barcode:{anyOf:[{type:'string'},{type:'null'}],description:'de cijfers onder de streepjescode, zonder spaties, als ze leesbaar zijn'},
  // Geen enum: zo blijft het schema gelijk als de facturen veranderen (een nieuw schema moet eerst worden opgebouwd); checkPackage controleert de id.
  invoiceLineId:{anyOf:[{type:'string'},{type:'null'}],description:'de id van de inkoopregel die bij dit product hoort (bijvoorbeeld r12), of null'},
  piecesPerUnit:{anyOf:[{type:'integer'},{type:'null'}],description:'hoeveel van deze verpakkingen in één eenheid van de gekozen inkoopregel zitten (een doos van 6 = 6), anders 1'}}};
}
export function readPrompt(candidates:LabelCandidate[],lines:PurchaseLine[]){
 return labelPrompt(candidates)
  +'\n\nHet kan ook een verpakt product zonder prijsetiket zijn (bijvoorbeeld een pak vla van Zuivelrijck). Lees dan merk, product en '
  +'inhoud in productName, de cijfers van de streepjescode in barcode, en zet totalCents, weightGrams en unitPriceCents op null. '
  +'Zet readable op true als het product herkenbaar is. Kies het winkelproduct uit de lijst alleen als het echt hetzelfde product en dezelfde inhoud is.'
  +(lines.length?'\nKies uit deze inkoopregels de regel die bij dit product hoort (zelfde product en inhoud), en hoeveel verpakkingen er in één eenheid van die regel zitten (id: leverancier, omschrijving, aantal × eenheid):\n'
   +lines.map(l=>`${l.id}: ${l.supplier}, ${l.description}${l.article?` (art. ${l.article})`:''}, ${l.quantity} × ${l.unit}`).join('\n')
   +'\nPast er geen inkoopregel, zet invoiceLineId op null.':'\nEr zijn geen inkoopregels; zet invoiceLineId op null.');
}
const int=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)?v:null;
/** Inkoopprijs per verpakking (excl. btw, in centen) uit een factuurregel, of null als die niet uit te rekenen is. */
export function unitCost(line:PurchaseLine,pieces:number|null){
 const n=pieces&&pieces>=1&&pieces<=MAX_PIECES_PER_UNIT?pieces:1;
 if(!(line.quantity>0)||!(line.netCents>0))return null;
 const c=Math.round(line.netCents/line.quantity/n);
 return c>0?c:null;
}
/** Controleert het antwoord voor een verpakt product (zonder etiketbedrag). */
export function checkPackage(raw:unknown,candidates:LabelCandidate[],lines:PurchaseLine[]):PackageResult{
 const a=(raw&&typeof raw==='object'?raw:{}) as Partial<PackageAnswer>;
 if(a.readable!==true)return {ok:false,reason:'Het product is niet goed te herkennen. Houd de verpakking of het etiket recht en dichtbij en probeer het opnieuw.'};
 const known=candidates.find(c=>c.id===a.productId);
 const name=known?null:productName(a.productName)??productName(a.labelName);
 const product=known??(name?candidates.find(c=>sameName(c.name,name)):undefined)??null;
 if(!product&&!name)return {ok:false,reason:'We konden niet lezen welk product dit is. Probeer het opnieuw of tik het product aan.'};
 const line=lines.find(l=>l.id===a.invoiceLineId),cost=line?unitCost(line,int(a.piecesPerUnit)):null;
 return {ok:true,productId:product?.id??null,newName:product?null:name,labelName:String(a.productName||a.labelName||'').slice(0,80),
  barcode:normalizeEan(a.barcode),cost:line&&cost?{supplier:line.supplier,date:line.date,description:line.description.slice(0,120),unitCostCents:cost}:null};
}
