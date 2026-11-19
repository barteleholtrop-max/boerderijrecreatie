'use client';
// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026): de telefoons die ingelogd blijven, en
// ontkoppelen. Een onthouden telefoon opent alleen de managerapp (Gesprekken, Assistent, Boodschappen, Agenda). Ontkoppelen
// werkt binnen een uur, ook als de app openstaat. Wie het vinkje Managerapp kwijtraakt of uit staat, ook.
import {useEffect,useState} from 'react';
import {Pill} from '../ui';
type Phone={id:string;email:string;name:string;created:string;lastSeen:string|null;revoked:string|null;revokedBy:string};
const when=(d:string|null)=>d?new Date(d).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'nog niet';
export function Telefoons(){
 const [list,setList]=useState<Phone[]|null>(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[old,setOld]=useState(false);
 useEffect(()=>{void (async()=>{try{const r=await fetch('/api/toegang/telefoons',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setList(d.telefoons)}catch(e){setMsg((e as Error).message)}})()},[]);
 async function revoke(t:Phone){
  if(!confirm(t.name+' van '+t.email+' ontkoppelen? Binnen een uur werkt de managerapp op die telefoon niet meer zonder opnieuw in te loggen.'))return;
  setBusy(true);setMsg('');
  try{const r=await fetch('/api/toegang/telefoons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ontkoppelen',id:t.id})}),d=await r.json();if(!r.ok)throw Error(d.error);setList(d.telefoons);setMsg(t.name+' van '+t.email+' is ontkoppeld.')}
  catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
 }
 const active=(list||[]).filter(t=>!t.revoked),gone=(list||[]).filter(t=>t.revoked);
 return <section className="card section-gap" data-bb-view="managerapp-telefoons"><h3 className="card-title">Telefoons met de managerapp</h3>
  <p className="small">Wie de managerapp mag openen, logt op de eigen telefoon één keer in en kiest <b>Ingelogd houden</b>. Daarna blijft de app op die telefoon ingelogd. Zo'n telefoon opent alleen de managerapp (gesprekken, assistent, boodschappen en agenda), niet de rest van de backoffice. Telefoon kwijt of iemand weg? Kies <b>Ontkoppelen</b>: binnen een uur werkt de app daar niet meer. Wie het vinkje Managerapp kwijtraakt of uit staat, kan ook niet meer verder.</p>
  {msg&&<p role="status" className="message">{msg}</p>}
  {!list?<p>Laden…</p>:!active.length?<p className="small section-gap">Nog geen telefoons die ingelogd blijven.</p>:<div className="table-wrap section-gap"><table><thead><tr><th>Wie</th><th>Telefoon</th><th>Sinds</th><th>Laatst gezien</th><th/></tr></thead><tbody>
   {active.map(t=><tr key={t.id}><td><strong>{t.email}</strong></td><td>{t.name}</td><td className="small">{when(t.created)}</td><td className="small">{when(t.lastSeen)}</td>
    <td><button className="btn sm red" disabled={busy} onClick={()=>revoke(t)}>Ontkoppelen</button></td></tr>)}
  </tbody></table></div>}
  {gone.length>0&&<p className="small section-gap"><button type="button" className="login-link" onClick={()=>setOld(!old)}>{old?'Verberg':'Toon'} ontkoppelde telefoons ({gone.length})</button></p>}
  {old&&<ul className="small">{gone.map(t=><li key={t.id}>{t.name} van {t.email} <Pill color="orange">ontkoppeld</Pill> {when(t.revoked)}{t.revokedBy?' door '+t.revokedBy:''}</li>)}</ul>}
 </section>;
}
