'use client';
// Test of live in de schermen (wens eigenaar 9 november 2026). Eén keer per pagina opgehaald bij /api/omgeving.
import {useEffect,useState} from 'react';
export type Omgeving={betalen:'live'|'test'|'uit'|'onbekend';mail:boolean;via?:'bunq'|'mollie'|null;koppelingen?:{bunq:'live'|'sandbox'|null;snelstart:boolean}};
let cached:Promise<Omgeving>|null=null;
export function useOmgeving(enabled=true){
 const [o,setO]=useState<Omgeving|null>(null);
 useEffect(()=>{if(!enabled)return;let alive=true;cached??=fetch('/api/omgeving',{cache:'no-store'}).then(r=>r.ok?r.json():{betalen:'onbekend',mail:false}).catch(()=>{cached=null;return {betalen:'onbekend',mail:false} as Omgeving});
  void cached.then(v=>{if(alive)setO(v)});return()=>{alive=false}},[enabled]);
 return o;
}
/** Korte tekst voor de stand van online betalen. */
export const betaalStand=(o:Omgeving|null)=>!o?'':o.betalen==='live'?'Live · online betalen met echt geld':o.betalen==='test'?'Testmodus · online betalen zonder echt geld':o.betalen==='uit'?'Online betalen staat uit':'';
