'use client';
// Website & uitstraling → „Onderdelen van de hoofdsite” (wens eigenaar 15 november 2026): per onderdeel open of in ontwikkeling.
import {useState} from 'react';
type Option={id:string;label:string;description:string};
type Stand='open'|'ontwikkeling';
export function OnderdelenKiezen({options,current,version,site}:{options:Option[];current:Record<string,Stand>;version:number;site:string|null}){
 const [keuze,setKeuze]=useState(current),[saved,setSaved]=useState({keuze:current,version}),[busy,setBusy]=useState(false),[message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
 const changed=options.some(o=>keuze[o.id]!==saved.keuze[o.id]);
 async function save(){
  setBusy(true);setMessage(null);
  try{
   const r=await fetch('/api/website-onderdelen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({onderdelen:keuze,version:saved.version})});
   const d=await r.json().catch(()=>({})) as {error?:string;version?:number};
   if(!r.ok||typeof d.version!=='number')throw Error(d.error||'Opslaan is niet gelukt. Ververs en probeer opnieuw.');
   setSaved({keuze,version:d.version});
   setMessage({ok:true,text:'Opgeslagen. De hoofdsite past zich binnen ongeveer twee minuten aan, zonder dat bezoekers hoeven te herladen.'});
  }catch(e){setMessage({ok:false,text:(e as Error).message})}finally{setBusy(false)}
 }
 return <div className="stack">
  <p className="small">Wat in ontwikkeling is, toont op zijn eigen adres een pagina „in ontwikkeling” en staat niet in het menu. Open betekent: de gewone pagina, met menu-item.</p>
  <div className="onderdelen-lijst" role="group" aria-label="Onderdelen van de hoofdsite">
   {options.map(o=><div key={o.id} className="onderdeel-rij">
    <span><strong>{o.label}</strong><span className="small" style={{display:'block'}}>{o.description}</span></span>
    <span className="row" role="radiogroup" aria-label={o.label}>
     {(['open','ontwikkeling'] as const).map(s=><label key={s} className={'btn sm '+(keuze[o.id]===s?'':'secondary')}>
      <input type="radio" className="sr-only" name={'onderdeel-'+o.id} value={s} checked={keuze[o.id]===s} onChange={()=>setKeuze({...keuze,[o.id]:s})}/>
      {s==='open'?'Open':'In ontwikkeling'}
     </label>)}
    </span>
   </div>)}
  </div>
  <div className="row"><button type="button" className="btn" onClick={save} disabled={busy||!changed}>{busy?'Opslaan…':'Opslaan'}</button>
   {site&&<a className="btn sm secondary" href={site} target="_blank" rel="noopener">Bekijk de hoofdsite ↗</a>}</div>
  {message&&<p className="small" role={message.ok?'status':'alert'} style={{color:message.ok?'var(--green)':'var(--red)'}}>{message.text}</p>}
 </div>;
}
