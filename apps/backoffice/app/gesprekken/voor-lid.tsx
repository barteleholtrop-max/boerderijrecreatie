'use client';
// „Dit gesprek is voor …” (wens eigenaar 10 november 2026): kies een lid; die krijgt een melding en beantwoordt het gesprek zelf
// in de ledenapp (tabblad Gesprekken). Rianne en Bartele blijven alles zien. Regels: lib/gesprek-lid.ts.
import {useEffect,useState} from 'react';
type Choices={members:{id:string;name:string}[];assigned:Record<string,string>};
let cache:Promise<Choices>|null=null;
const load=(fresh=false)=>{if(fresh||!cache)cache=fetch('/api/gesprek-lid',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d as Choices}).catch(e=>{cache=null;throw e});return cache};
export function VoorLid({refId}:{refId:string}){
 const [c,setC]=useState<Choices|null>(null),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 useEffect(()=>{load().then(d=>{setC(d);setValue(d.assigned[refId]||'')}).catch(()=>{})},[refId]);
 if(!c||!c.members.length)return null;
 async function choose(id:string){
  setBusy(true);setNote('');
  try{const r=await fetch('/api/gesprek-lid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:refId,participantId:id||null})}),d=await r.json();if(!r.ok)throw Error(d.error);
   setValue(id);const name=c!.members.find(m=>m.id===id)?.name;setNote(id?name+' krijgt een melding en kan dit gesprek in de ledenapp beantwoorden.':'Niet meer voor een lid.');void load(true)}
  catch(e){setNote((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="voor-lid"><label>Voor lid<select value={value} disabled={busy} onChange={e=>choose(e.target.value)} aria-label="Dit gesprek is voor lid"><option value="">— niemand —</option>{c.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{note&&<span className="small" role="status">{note}</span>}</div>;
}
