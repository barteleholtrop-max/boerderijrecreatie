// Gedeelde keuzegroepen (wens eigenaar 5 november 2026): één keuzevraag, zoals „Soort melk: van de boerderij / haver”,
// bij meerdere producten (cappuccino, latte, …). Een gedeelde groep heeft een kenmerk dat met „kg-” begint en staat,
// net als een gewone keuzevraag, in elk product zelf (optionGroups). Kassa, opnemen, bestelapp en bestellingen blijven
// daardoor hetzelfde werken. Besluit eigenaar: wie een gedeelde groep aanpast, past hem overal meteen aan, ook in de
// gepubliceerde versie van de andere producten. Pure regels, zonder database.
export type Choice={id:string;label:string;extraCents:number};
export type Group={id:string;title:string;required:boolean;choices:Choice[]};
export const SHARED='kg-';
export const isShared=(g:{id?:unknown}|null|undefined)=>typeof g?.id==='string'&&g.id.startsWith(SHARED);
const groupsOf=(p:unknown):Group[]=>{const g=(p as {optionGroups?:unknown}|null)?.optionGroups;return Array.isArray(g)?g as Group[]:[]};

/** De gedeelde groepen van één product, op kenmerk. */
export function sharedGroups(p:unknown){return new Map(groupsOf(p).filter(isShared).map(g=>[g.id,g]))}

/**
 * Zet de nieuwste inhoud van gedeelde groepen in een product. Alleen groepen die het product al heeft, worden vervangen;
 * er wordt niets toegevoegd of weggehaald. Geeft null als er niets verandert.
 */
export function withShared<T extends Record<string,unknown>>(p:T,groups:Map<string,Group>):T|null{
 const list=groupsOf(p);let changed=false;
 const next=list.map(g=>{const n=isShared(g)?groups.get(g.id):undefined;if(!n||JSON.stringify(n)===JSON.stringify(g))return g;changed=true;return n});
 return changed?{...p,optionGroups:next}:null;
}

/** Bibliotheek voor het productvenster en de werkplek: elke gedeelde groep één keer, met de producten die hem gebruiken. */
export function library(rows:{id:string;draft:unknown;published?:unknown}[]){
 const out=new Map<string,{group:Group;usedBy:{id:string;name:string}[]}>();
 for(const r of rows){const p=(r.draft??r.published) as {name?:unknown}|null;
  for(const g of groupsOf(p).filter(isShared)){const e=out.get(g.id)??{group:g,usedBy:[]};e.usedBy.push({id:r.id,name:String(p?.name||'')});out.set(g.id,e)}}
 return [...out.values()].sort((a,b)=>a.group.title.localeCompare(b.group.title,'nl'));
}

/**
 * Nieuwe keuzevraag vanaf de werkplek (wens eigenaar 5 november 2026): een vraag en de keuzes met komma's, bijvoorbeeld
 * „Soort melk” met „Koe, Haver”. Wordt een gedeelde groep (kg-), zodat hij daarna ook bij andere producten te kiezen is.
 * Geen meerprijs; die kan Rianne later in Gerechten & prijzen zetten. Geeft null als de vraag of de keuzes ontbreken.
 */
export function quickGroup(title:string,choicesText:string,required:boolean,id=()=>crypto.randomUUID()):Group|null{
 const t=title.trim().slice(0,100);
 const labels=[...new Set(choicesText.split(/[,;\n]/).map(s=>s.trim().slice(0,100)).filter(Boolean))].slice(0,30);
 if(!t||labels.length<2)return null;
 return {id:SHARED+id(),title:t,required,choices:labels.map(label=>({id:id(),label,extraCents:0}))};
}
