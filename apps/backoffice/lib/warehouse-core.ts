// Magazijnvoorraad (wens eigenaar 8 november 2026): toiletpapier, schoonmaakmiddel, servetten, afwasmiddel en andere spullen
// die we zelf gebruiken en nooit aan gasten verkopen. Ze staan in dezelfde voorraadlijst als de rest (Inkoop & voorraad),
// met soort „magazijn”. Ze worden nooit een product, dus gasten zien ze niet.
// Op de tablet (Werkplek Voorraad → Magazijn) tikt iemand „Bijna op” of „Op”. Dat is een gewone voorraadbeweging in stock_moves
// met reden „Bestelverzoek”; wie, wat en de stand staan in de referentie. Sanne ziet het als „bijbestellen” bij Vandaag & taken,
// zet het op „Besteld” en het verdwijnt vanzelf zodra er weer voorraad bij komt (levering of telling hoger). Hier alleen regels.

export const KINDS=['keuken','magazijn'] as const;
export type IngredientKind=typeof KINDS[number];
export const isKind=(v:unknown):v is IngredientKind=>typeof v==='string'&&(KINDS as readonly string[]).includes(v);
export const isWarehouse=(i:{kind?:string}|undefined)=>i?.kind==='magazijn';

export const REQUEST_REASON='Bestelverzoek';
export const REQUEST_PREFIX='Magazijn';
export const REQUEST_STATUS={'bijna-op':'Bijna op',op:'Op',besteld:'Besteld',afgehandeld:'Afgehandeld'} as const;
export type RequestStatus=keyof typeof REQUEST_STATUS;
export const isRequestStatus=(v:unknown):v is RequestStatus=>typeof v==='string'&&Object.hasOwn(REQUEST_STATUS,v);
/** Wat het personeel op de tablet mag melden; besteld en afgehandeld zijn voor inkoop. */
export const STAFF_STATUS:RequestStatus[]=['bijna-op','op'];

const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f·]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';

/** „Magazijn · Bijna op · door Sanne” of „Magazijn · Op · door Sanne · bovenste plank leeg” */
export function requestReference(r:{status:RequestStatus;by:string;note?:string}){
 const parts=[REQUEST_PREFIX,REQUEST_STATUS[r.status],'door '+(clean(r.by,60)||'onbekend')],note=clean(r.note,200);
 if(note)parts.push(note);
 return parts.join(' · ');
}
export function parseRequestReference(ref:string):{status:RequestStatus;by:string;note:string}|null{
 const parts=ref.split(' · ');if(parts[0]!==REQUEST_PREFIX)return null;
 const status=(Object.keys(REQUEST_STATUS) as RequestStatus[]).find(k=>REQUEST_STATUS[k]===parts[1]);if(!status)return null;
 const by=parts[2]?.startsWith('door ')?parts[2].slice(5):'';
 return {status,by,note:parts.slice(3).join(' · ')};
}

/** Controleert een melding. Personeel meldt alleen bijna op of op; inkoop (staff=false) mag ook besteld of afgehandeld. */
export function checkRequest(input:unknown,staff:boolean){
 const b=(input&&typeof input==='object'?input:{}) as Record<string,unknown>;
 if(typeof b.ingredientId!=='string'||!b.ingredientId||b.ingredientId.length>100)throw Error('Kies een magazijnartikel.');
 if(!isRequestStatus(b.status)||staff&&!STAFF_STATUS.includes(b.status))throw Error(staff?'Kies: bijna op of op.':'Kies: bijna op, op, besteld of afgehandeld.');
 const by=clean(b.by,60);if(!by)throw Error('Vul in wie dit meldt.');
 return {ingredientId:b.ingredientId,status:b.status,by,note:clean(b.note,200)};
}

type Move={ingredientId:string;quantity:number;date:string;reason:string;reference:string;seq?:number};
export type OpenRequest={ingredientId:string;name:string;unit:string;stock:number;known:boolean;min:number;supplier:string;
 status:'bijna-op'|'op'|'besteld';reportedStatus:'bijna-op'|'op';reportedBy:string;reportedDate:string;note:string;orderedBy:string;orderedDate:string};
/**
 * Open bestelverzoeken per magazijnartikel. Een melding blijft open tot er weer voorraad bij komt (een beweging met een
 * positieve hoeveelheid die geen bestelverzoek is: levering, telling hoger) of tot inkoop hem afhandelt. „Op” na „Bijna op”
 * maakt hem dringender; „Besteld” houdt hem open, zodat zichtbaar blijft dat er iets onderweg is.
 */
export function openRequests(moves:Move[],ingredients:{id:string;name:string;unit:string;stock:number;known:boolean;min:number;supplier:string;kind?:string}[]):OpenRequest[]{
 const items=new Map(ingredients.filter(isWarehouse).map(i=>[i.id,i]));
 const open=new Map<string,OpenRequest>();
 const sorted=[...moves].sort((a,b)=>(a.seq??0)-(b.seq??0)||a.date.localeCompare(b.date));
 for(const m of sorted){const i=items.get(m.ingredientId);if(!i)continue;
  if(m.reason!==REQUEST_REASON){if(m.quantity>0)open.delete(i.id);continue}
  const p=parseRequestReference(m.reference);if(!p)continue;const cur=open.get(i.id);
  if(p.status==='afgehandeld'){open.delete(i.id);continue}
  if(p.status==='besteld'){if(cur)open.set(i.id,{...cur,status:'besteld',orderedBy:p.by,orderedDate:m.date});
   else open.set(i.id,{ingredientId:i.id,name:i.name,unit:i.unit,stock:i.stock,known:i.known,min:i.min,supplier:i.supplier,status:'besteld',reportedStatus:'bijna-op',reportedBy:p.by,reportedDate:m.date,note:p.note,orderedBy:p.by,orderedDate:m.date});continue}
  // Bijna op of op. Een nieuwe melding na „Besteld” houdt de bestelling vast; „op” gaat altijd voor „bijna op”.
  const reported=cur?.reportedStatus==='op'&&p.status==='bijna-op'?'op':p.status;
  open.set(i.id,{ingredientId:i.id,name:i.name,unit:i.unit,stock:i.stock,known:i.known,min:i.min,supplier:i.supplier,
   status:cur?.status==='besteld'?'besteld':reported,reportedStatus:reported,reportedBy:p.by,reportedDate:m.date,note:p.note||cur?.note||'',orderedBy:cur?.orderedBy||'',orderedDate:cur?.orderedDate||''});
 }
 // Het dringendst eerst: op, dan bijna op, dan besteld; daarbinnen de oudste melding eerst.
 const rank={op:0,'bijna-op':1,besteld:2};
 return [...open.values()].sort((a,b)=>rank[a.status]-rank[b.status]||a.reportedDate.localeCompare(b.reportedDate)||a.name.localeCompare(b.name,'nl'));
}
