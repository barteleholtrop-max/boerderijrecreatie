// Tellen met foto's (wens eigenaar 17 november 2026: „met het voorraad opnemen foto's maken van de producten die er zijn, en dan een
// plusje en een minnetje of het aantal ingeven, zodat je niet alle producten opnieuw hoeft in te voeren … voor de eerste keer als er
// een nieuw product bij moet”). Pure regels zonder database of netwerk, zodat ze te testen zijn.
// Claude kijkt op de foto welke producten er staan, kiest ze uit de voorraadlijst en telt wat hij ziet (een voorstel). Staat een
// product nog niet in de lijst, dan komt de naam terug als nieuw ingrediënt. De medewerker zet het aantal goed met − en + en slaat de
// telling op zoals altijd (Werkplek Voorraad → Voorraad tellen).
import {cleanName} from './costing';
import type {Ingredient,Unit} from './operations-core';

export type CountCandidate={id:string;name:string;unit:Unit};
export type SeenItem={ingredientId:string|null;name:string;unit:Unit;seen:number|null};
export const MAX_SEEN=8;
const UNITS:Unit[]=['kg','l','st'];

export function countPhotoSchema(candidates:CountCandidate[]){
 const ids=candidates.map(c=>c.id);
 return {type:'object',additionalProperties:false,required:['readable','items'],properties:{
  readable:{type:'boolean',description:'false als er geen herkenbaar product op de foto staat'},
  items:{type:'array',items:{type:'object',additionalProperties:false,required:['ingredientId','name','unit','seen'],properties:{
   ingredientId:ids.length?{anyOf:[{type:'string',enum:ids},{type:'null'}],description:'het product uit de lijst, of null als het er niet in staat'}:{type:'null'},
   name:{type:'string',description:'een korte, duidelijke productnaam, zoals op de verpakking (bijvoorbeeld Coca-Cola 33 cl blik)'},
   unit:{type:'string',enum:UNITS,description:'st voor stuks (blikjes, flessen, pakken), kg of l voor los gewicht of volume'},
   seen:{anyOf:[{type:'number'},{type:'null'}],description:'hoeveel je er op de foto ziet, alleen als je ze echt kunt tellen; anders null'}}}}}};
}
export function countPhotoPrompt(candidates:CountCandidate[]){
 return 'Dit is een foto uit de voorraad (koelkast, schap of magazijn) van Boerderijrecreatie, een boerderij met restaurant, koffiebar en winkel. '
  +'Welke producten staan er op de foto? Noem elk soort product één keer (hooguit '+MAX_SEEN+'), het duidelijkst zichtbare eerst. '
  +(candidates.length?'Kies per product het product uit deze voorraadlijst (id: naam · eenheid):\n'+candidates.map(c=>`${c.id}: ${c.name} · ${c.unit}`).join('\n')
   +'\nKies alleen als het echt hetzelfde product is (cola zero is geen gewone cola); anders null met een duidelijke naam. ':'Zet ingredientId steeds op null. ')
  +'Tel hoeveel stuks je ziet als dat kan (verborgen achter elkaar telt niet mee: liever null dan raden). Staat er geen product op, zet readable op false.';
}
/** Controleert het antwoord van Claude: bekende producten uit de lijst, nieuwe met een nette naam; elk product één keer. */
export function checkCountPhoto(raw:unknown,ingredients:Pick<Ingredient,'id'|'name'|'unit'|'origin'>[]):{ok:true;items:SeenItem[]}|{ok:false;reason:string}{
 const a=(raw&&typeof raw==='object'?raw:{}) as {readable?:unknown;items?:unknown};
 if(a.readable!==true)return {ok:false,reason:'Op deze foto zien we geen product. Fotografeer het etiket of de voorkant, dichtbij en scherp.'};
 const byId=new Map(ingredients.map(i=>[i.id,i])),items:SeenItem[]=[],seen=new Set<string>();
 for(const r of Array.isArray(a.items)?a.items.slice(0,MAX_SEEN):[]){
  const l=(r&&typeof r==='object'?r:{}) as Record<string,unknown>;
  const known=typeof l.ingredientId==='string'?byId.get(l.ingredientId):undefined;
  const raw=typeof l.name==='string'?l.name.normalize('NFC').replace(/\s+/g,' ').trim().slice(0,120):'';
  const unit=known?known.unit:UNITS.includes(l.unit as Unit)?l.unit as Unit:'st';
  // Zelfde naam als een bestaand product: dat product, ook als Claude het niet koos.
  const same=known??ingredients.find(i=>i.name.trim().toLocaleLowerCase('nl-NL')===raw.toLocaleLowerCase('nl-NL'));
  const name=same?same.name:raw?cleanName(raw):'';
  if(!name)continue;const key=same?same.id:'new:'+name.toLocaleLowerCase('nl-NL');if(seen.has(key))continue;seen.add(key);
  const count=typeof l.seen==='number'&&Number.isFinite(l.seen)&&l.seen>=0&&l.seen<=10000?Math.round(l.seen*1000)/1000:null;
  items.push({ingredientId:same?.id??null,name,unit:same?same.unit:unit,seen:count});
 }
 if(!items.length)return {ok:false,reason:'We herkenden geen product op deze foto. Probeer het dichterbij, met het etiket naar voren.'};
 return {ok:true,items};
}
