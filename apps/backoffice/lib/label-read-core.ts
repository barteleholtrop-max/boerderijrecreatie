// Etiket lezen voor de zelfkassa (wens eigenaar 9 november 2026): pure regels zonder database of netwerk, zodat ze te testen zijn.
// Claude leest op een foto van een etiket (bijvoorbeeld runderlever, 0,690 kg × € 18,50/kg = € 12,77) de naam, het gewicht, de
// kiloprijs en het totaal, en kiest het winkelproduct uit de lijst. Hier controleren we wat terugkomt: een bekend product, een
// geldig bedrag, en of gewicht × kiloprijs bij het totaal past. De klant ziet het bedrag altijd nog en tikt zelf op OK.
export type LabelCandidate={id:string;name:string};
export type LabelAnswer={readable:boolean;productId:string|null;labelName:string;totalCents:number|null;weightGrams:number|null;unitPriceCents:number|null};
export type LabelResult={ok:true;productId:string|null;newName?:string;labelName:string;totalCents:number;weightGrams:number|null;unitPriceCents:number|null;checked:boolean}|{ok:false;reason:string};
export const MAX_LABEL_CENTS=100000; // vangnet tegen tikfouten, gelijk aan de etiketprijs (lib/orders.ts)
export const MAX_IMAGE_BYTES=1_500_000;

/** Het JSON-schema dat Claude moet volgen (gestructureerde uitvoer). */
export function labelSchema(candidates:LabelCandidate[]){
 return {type:'object',additionalProperties:false,required:['readable','productId','labelName','totalCents','weightGrams','unitPriceCents'],properties:{
  readable:{type:'boolean',description:'false als er geen leesbaar prijsetiket op de foto staat'},
  productId:{anyOf:[{type:'string',enum:candidates.map(c=>c.id)},{type:'null'}],description:'het winkelproduct dat bij het etiket hoort, of null als geen enkel product uit de lijst hetzelfde product is'},
  labelName:{type:'string',description:'de productnaam zoals die op het etiket staat'},
  totalCents:{anyOf:[{type:'integer'},{type:'null'}],description:'het totaalbedrag (te betalen) in centen'},
  weightGrams:{anyOf:[{type:'integer'},{type:'null'}],description:'het gewicht in grammen'},
  unitPriceCents:{anyOf:[{type:'integer'},{type:'null'}],description:'de prijs per kilo in centen'}}};
}
export function labelPrompt(candidates:LabelCandidate[]){
 return 'Dit is een foto van een prijsetiket in de boerderijwinkel van Boer Bart. Lees de productnaam, het gewicht, de prijs per kilo en het totaalbedrag. '
  +'Kies het winkelproduct dat bij het etiket hoort uit deze lijst (id: naam):\n'+candidates.map(c=>`${c.id}: ${c.name}`).join('\n')
  +'\nKies alleen een product als het echt hetzelfde is (runderlever is geen rundergehakt); past er geen, zet productId op null. '
  +'Bedragen in centen (12,77 € = 1277), gewicht in grammen (0,690 kg = 690). Staat er geen leesbaar prijsetiket op de foto, zet readable op false. '
  +'Raad niet: laat een waarde die je niet zeker kunt lezen op null.';
}
/** Een nette productnaam uit de tekst op het etiket („runderlever” → „Runderlever”); null als het geen bruikbare naam is. */
export function productName(v:unknown){
 if(typeof v!=='string')return null;
 const t=v.normalize('NFC').replace(/[^\p{L}\p{N} &'’().,%-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,60);
 if(t.replace(/[^\p{L}]/gu,'').length<3)return null;
 return t.charAt(0).toLocaleUpperCase('nl-NL')+t.slice(1);
}
export const sameName=(a:string,b:string)=>a.toLocaleLowerCase('nl-NL').replace(/\s+/g,' ').trim()===b.toLocaleLowerCase('nl-NL').replace(/\s+/g,' ').trim();
const int=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)?v:null;
/** Controleert het antwoord van Claude. Gewicht × kiloprijs mag hooguit 2 cent van het totaal afwijken (afronding op het etiket).
 *  Past geen product (wens eigenaar 9 november 2026: „als een product nog niet bestaat, voeg het toe aan de productlijst”), dan
 *  komt de naam van het etiket terug als newName; lib/label-products.ts maakt het product dan aan. */
export function checkLabel(raw:unknown,candidates:LabelCandidate[]):LabelResult{
 const a=(raw&&typeof raw==='object'?raw:{}) as Partial<LabelAnswer>;
 if(a.readable!==true)return {ok:false,reason:'Het etiket is niet goed te lezen. Houd het recht en dichtbij, zonder schittering, en probeer het opnieuw.'};
 const known=candidates.find(c=>c.id===a.productId),newName=known?null:productName(a.labelName);
 if(!known&&!newName)return {ok:false,reason:'We konden de naam op dit etiket niet lezen. Probeer het opnieuw of tik het product aan op het scherm.'};
 // Dezelfde naam als een bestaand product: dat product, ook als Claude het niet koos.
 const product=known??candidates.find(c=>sameName(c.name,newName!))??null;
 const total=int(a.totalCents),weight=int(a.weightGrams),unit=int(a.unitPriceCents);
 if(total===null||total<=0||total>MAX_LABEL_CENTS)return {ok:false,reason:'Het bedrag op het etiket is niet goed te lezen. Probeer het opnieuw of typ het bedrag zelf in.'};
 const checked=weight!==null&&unit!==null&&weight>0&&unit>0&&Math.abs(Math.round(weight*unit/1000)-total)<=2;
 return {ok:true,productId:product?.id??null,...(product?{}:{newName:newName!}),labelName:String(a.labelName||'').slice(0,80),totalCents:total,weightGrams:weight!==null&&weight>0?weight:null,unitPriceCents:unit!==null&&unit>0?unit:null,checked};
}
/** Een foto als data-URL (jpeg, png of webp), niet te groot. */
export function parseImage(v:unknown){
 if(typeof v!=='string')return null;
 const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
 if(!m||m[2].length*3/4>MAX_IMAGE_BYTES)return null;
 return {mediaType:m[1] as 'image/jpeg'|'image/png'|'image/webp',data:m[2]};
}
