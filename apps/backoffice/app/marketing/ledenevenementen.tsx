'use client';
// Marketing → evenementen van leden (besluit eigenaar 8 november 2026): bij goedkeuring staat hier een kant-en-klare tekst voor
// Instagram, Facebook en de nieuwsbrief. Niets gaat vanzelf de deur uit: kopiëren, plaatsen en afvinken.
import {useCallback,useEffect,useState} from 'react';
import {Pill} from '../ui';
type Item={id:string;drafts:Record<string,string>;updated:string};
const LABEL:Record<string,string>={instagram:'Instagram',facebook:'Facebook',nieuwsbrief:'Nieuwsbrief'};
export function LedenEvenementenMarketing(){
 const [items,setItems]=useState<Item[]|null>(null),[canDecide,setCanDecide]=useState(false),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/ledenevenementen',{cache:'no-store'});if(!r.ok)return;const d=await r.json();setItems(d.marketing||[]);setCanDecide(!!d.canDecide)}catch{}},[]);
 useEffect(()=>{void load()},[load]);
 if(!items)return null;
 async function done(id:string){try{const r=await fetch('/api/ledenevenementen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketing-gedaan',id})});const d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.marketing||[])}catch(e){setMsg((e as Error).message||'Dat lukte niet.')}}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setMsg('Gekopieerd.')}catch{setMsg('Kopiëren lukte niet; selecteer de tekst zelf.')}}
 return <div className="card section-gap" data-bb-view="marketing-ledenevenementen"><div className="card-head"><h3 className="card-title">Evenementen van leden: klaar om te delen</h3><Pill color={items.length?'orange':'green'}>{items.length}</Pill></div>
  {msg&&<div className="message" role="status">{msg}</div>}
  {!items.length&&<p className="small">Geen open concepten. Zodra de coördinator een evenement van een lid goedkeurt, staat hier de tekst klaar.</p>}
  {items.map(i=><details key={i.id} className="section-gap" style={{borderTop:"1px solid var(--border)",paddingTop:12}}><summary><strong>{(i.drafts.nieuwsbrief||'').split('\n')[0]}</strong></summary>
   {Object.entries(i.drafts).map(([k,v])=><div key={k} className="section-gap"><div className="row between"><b>{LABEL[k]||k}</b><button type="button" className="btn secondary sm" onClick={()=>void copy(v)}>Kopiëren</button></div><pre className="small" style={{whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{v}</pre></div>)}
   {canDecide&&<div className="action-row"><button type="button" className="btn sm" onClick={()=>void done(i.id)}>Geplaatst, afvinken</button></div>}
  </details>)}
 </div>;
}
