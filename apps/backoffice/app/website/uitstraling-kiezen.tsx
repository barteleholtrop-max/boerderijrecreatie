'use client';
import {useState} from 'react';
type Option={id:string;label:string;description:string};
export function UitstralingKiezen({options,current,version,site}:{options:Option[];current:string;version:number;site:string|null}){
 const [chosen,setChosen]=useState(current),[saved,setSaved]=useState({id:current,version}),[busy,setBusy]=useState(false),[message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
 async function save(){
  setBusy(true);setMessage(null);
  try{
   const r=await fetch('/api/website-uitstraling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uitstraling:chosen,version:saved.version})});
   const d=await r.json().catch(()=>({})) as {error?:string;version?:number};
   if(!r.ok||typeof d.version!=='number')throw Error(d.error||'Opslaan is niet gelukt. Ververs en probeer opnieuw.');
   setSaved({id:chosen,version:d.version});
   setMessage({ok:true,text:`Opgeslagen. Gasten zien nu „${options.find(o=>o.id===chosen)?.label}”; een open bestelapp past zich aan bij de volgende keer laden.`});
  }catch(e){setMessage({ok:false,text:(e as Error).message})}finally{setBusy(false)}
 }
 return <div className="stack">
  <fieldset className="uitstraling-keuze"><legend className="small" style={{marginBottom:8}}>Kies hoe de bestelapp eruitziet. „Bekijk” opent hem in die uitstraling, zonder iets te wijzigen.</legend>
   {options.map(o=><label key={o.id} className={'uitstraling-optie'+(chosen===o.id?' gekozen':'')}>
    <input type="radio" name="uitstraling" value={o.id} checked={chosen===o.id} onChange={()=>setChosen(o.id)}/>
    <span><strong>{o.label}{saved.id===o.id?' · nu actief':''}</strong><span className="small">{o.description}</span></span>
    {site&&<a className="btn sm secondary" href={`${site}/bestellen.html?uitstraling=${o.id}`} target="_blank" rel="noopener">Bekijk ↗</a>}
   </label>)}
  </fieldset>
  <div className="row"><button type="button" className="btn" onClick={save} disabled={busy||chosen===saved.id}>{busy?'Opslaan…':'Opslaan'}</button>
   {!site&&<span className="small">„Bekijk” verschijnt zodra het adres van de huidige website bekend is (WEBSITE_URL).</span>}</div>
  {message&&<p className="small" role={message.ok?'status':'alert'} style={{color:message.ok?'var(--green)':'var(--red)'}}>{message.text}</p>}
 </div>;
}
