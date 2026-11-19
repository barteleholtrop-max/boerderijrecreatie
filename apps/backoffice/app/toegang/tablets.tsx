'use client';
// Werkplektablets (besluit eigenaar 6 november 2026): een tablet koppelen met een QR-code (één keer, 10 minuten geldig) en
// weer ontkoppelen. Een gekoppelde tablet opent alleen de werkplekschermen (kok, barista, winkel, opnemen, kassa, voorraad,
// team en dagplanning), nooit de backoffice. Ontkoppelen werkt binnen een uur, ook als de tablet blijft aanstaan.
import {useEffect,useState} from 'react';
import {Pill} from '../ui';
type Tablet={id:string;name:string;created:string;createdBy:string;lastSeen:string|null;revoked:string|null;revokedBy:string};
type Pair={name:string;qr:string;url:string;expires:string;code?:string;site?:string};
const when=(d:string|null)=>d?new Date(d).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'nog niet';
export function Tablets(){
 const [list,setList]=useState<Tablet[]|null>(null),[name,setName]=useState(''),[pair,setPair]=useState<Pair|null>(null),[left,setLeft]=useState(0),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[old,setOld]=useState(false);
 async function load(){try{const r=await fetch('/api/toegang/tablets',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setList(d.tablets)}catch(e){setMsg((e as Error).message)}}
 useEffect(()=>{void load()},[]);
 // Aftellen; daarna verdwijnt de QR-code en kijken we of de tablet erbij is gekomen.
 useEffect(()=>{if(!pair)return;const tick=()=>{const s=Math.max(0,Math.round((Date.parse(pair.expires)-Date.now())/1000));setLeft(s);if(!s){setPair(null);void load()}};tick();const t=setInterval(tick,1000);return()=>clearInterval(t)},[pair]);
 // Terwijl de QR-code openstaat: elke 3 seconden kijken of de tablet gekoppeld is.
 useEffect(()=>{if(!pair)return;const t=setInterval(async()=>{try{const r=await fetch('/api/toegang/tablets',{cache:'no-store'}),d=await r.json();if(!r.ok)return;setList(d.tablets);
  if((d.tablets as Tablet[]).some(x=>x.name===pair.name&&!x.revoked&&Date.parse(x.created)>Date.parse(pair.expires)-130000)){setPair(null);setMsg(pair.name+' is gekoppeld.')}}catch{}},3000);return()=>clearInterval(t)},[pair]);
 async function post(body:object){setBusy(true);setMsg('');try{const r=await fetch('/api/toegang/tablets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);return d}catch(e){setMsg((e as Error).message);return null}finally{setBusy(false)}}
 const active=(list||[]).filter(t=>!t.revoked),gone=(list||[]).filter(t=>t.revoked);
 return <section className="card section-gap" data-bb-view="werkplektablets"><h3 className="card-title">Werkplektablets</h3>
  <p className="small">Koppel een tablet met een QR-code. De tablet opent daarna de werkplekschermen (kassa, kok, barista, winkel, opnemen, voorraad en team) zonder dat iemand inlogt. De backoffice zelf, leden, financiën en deze lijst blijven dicht op de tablet. Raakt een tablet kwijt, kies dan <b>Ontkoppelen</b>: binnen een uur werkt hij niet meer.</p>
  <form className="action-row" style={{flexWrap:'wrap',alignItems:'flex-end'}} onSubmit={async e=>{e.preventDefault();const d=await post({action:'koppelen',name});if(d){setPair(d);setName('')}}}>
   <label>Naam van de tablet<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} minLength={2} required placeholder="bijv. Kassa koffiebar"/></label>
   <button className="btn" disabled={busy||!!pair}>Tablet koppelen</button>
  </form>
  {pair&&<div className="notice info section-gap" role="dialog" aria-label={'QR-code voor '+pair.name}><div>
   <p><strong>Scan deze QR-code met de camera van de tablet „{pair.name}”.</strong> Druk daarna op de tablet op „Deze tablet koppelen”. De code werkt één keer en nog <b>{left} seconden</b>.</p>
   <img src={pair.qr} alt={'QR-code om '+pair.name+' te koppelen'} width={260} height={260} style={{background:'#fff',padding:8,borderRadius:8}}/>
   {pair.code&&<div className="tablet-code"><p><strong>Geen camera?</strong> Open op het scherm <b>{(pair.site||'').replace(/^https?:\/\//,'')}/tablet/koppelen</b> en typ deze code:</p>
    <p className="tablet-code-value" aria-label={'Koppelcode '+pair.code.split('').join(' ')}>{pair.code}</p></div>}
   <button type="button" className="btn sm secondary" onClick={()=>setPair(null)}>Sluiten</button>
  </div></div>}
  {msg&&<p role="status" className="message">{msg}</p>}
  {!list?<p>Laden…</p>:!active.length?<p className="small section-gap">Nog geen tablets gekoppeld.</p>:<div className="table-wrap section-gap"><table><thead><tr><th>Tablet</th><th>Gekoppeld</th><th>Laatst gezien</th><th/></tr></thead><tbody>
   {active.map(t=><tr key={t.id}><td><strong>{t.name}</strong></td><td className="small">{when(t.created)}{t.createdBy?' · '+t.createdBy:''}</td><td className="small">{when(t.lastSeen)}</td>
    <td><button className="btn sm red" disabled={busy} onClick={async()=>{if(confirm(t.name+' ontkoppelen? Binnen een uur werkt deze tablet niet meer; daarna moet je hem opnieuw koppelen.')){const d=await post({action:'ontkoppelen',id:t.id});if(d){setList(d.tablets);setMsg(t.name+' is ontkoppeld.')}}}}>Ontkoppelen</button></td></tr>)}
  </tbody></table></div>}
  {gone.length>0&&<p className="small section-gap"><button type="button" className="login-link" onClick={()=>setOld(!old)}>{old?'Verberg':'Toon'} ontkoppelde tablets ({gone.length})</button></p>}
  {old&&<ul className="small">{gone.map(t=><li key={t.id}>{t.name} <Pill color="orange">ontkoppeld</Pill> {when(t.revoked)}{t.revokedBy?' door '+t.revokedBy:''}</li>)}</ul>}
 </section>;
}
