// Werkplek: totalen van alles wat nog gemaakt moet worden (wens eigenaar 5 november 2026: „als er meerdere friet in een bestelling
// staan … dat er in beeld 10 porties staan, zodat de kok dit niet zelf hoeft uit te rekenen. 14 pannenkoeken naturel enz.”).
// Zelfde gerecht met dezelfde keuzes telt samen; andere keuzes apart. Alleen rekenwerk, geen opslag.
export type TotalLine={name:string;quantity:number;choices:string[]};
export function lineTotals(orders:{lines:TotalLine[]}[]){
 const by=new Map<string,{name:string;choices:string[];quantity:number;orders:number}>();
 for(const o of orders){const seen=new Set<string>();
  for(const l of o.lines){const choices=[...(l.choices||[])].sort((a,b)=>a.localeCompare(b,'nl')),key=l.name.trim().toLowerCase()+'|'+choices.join('|').toLowerCase();
   const t=by.get(key)??{name:l.name.trim(),choices,quantity:0,orders:0};t.quantity+=l.quantity;if(!seen.has(key)){t.orders++;seen.add(key)}by.set(key,t)}}
 return [...by.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'nl'));
}
