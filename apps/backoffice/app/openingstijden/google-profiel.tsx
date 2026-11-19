'use client';
// Google Bedrijfsprofiel (besluit eigenaar 4 november 2026, stap 2). Openingstijden, afwijkende dagen en evenementen uit
// deze backoffice gaan vanzelf naar het profiel op Google Zoeken en Maps. Koppelen met het account dat het profiel beheert.
import {useEffect,useState} from 'react';

type Loc={account:string;location:string;title:string;address:string};
type Status={oauthConfigured:boolean;connected:boolean;accountEmail:string;accountHint:string;location:string;locationTitle:string;syncHours:boolean;syncEvents:boolean;
 lastSync:string|null;lastError:string|null;website:string;posts:number;locations:Loc[];locationsError:string|null};
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'nog niet';

export function GoogleProfiel(){
 const [data,setData]=useState<Status|null>(null),[msg,setMsg]=useState(''),[working,setWorking]=useState(false),[pick,setPick]=useState('');
 async function load(){try{const r=await fetch('/api/google-profiel',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Laden mislukt.');setData(d)}catch(e){setMsg((e as Error).message)}}
 useEffect(()=>{load();const q=new URLSearchParams(window.location.search),r=q.get('googleprofiel');
  if(r==='gekoppeld')setMsg('Gekoppeld met Google. Kies hieronder het bedrijfsprofiel van Boer Bart.');
  else if(r==='fout')setMsg(q.get('melding')||'Koppelen is niet gelukt.');},[]);
 async function act(body:object){setWorking(true);setMsg('');
  try{const r=await fetch('/api/google-profiel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as {error?:string;message?:string};if(!r.ok)throw Error(d.error||'Er ging iets mis.');setMsg(d.message||'');await load()}
  catch(e){setMsg((e as Error).message)}finally{setWorking(false)}}
 const chosen=data?.locations.find(l=>l.location===data.location);
 return <section className="card section-gap" aria-labelledby="google-profiel-titel">
  <h2 id="google-profiel-titel">Google Bedrijfsprofiel</h2>
  <p className="ops-note">De openingstijden, afwijkende dagen (gesloten of andere tijden) en evenementen van hierboven komen vanzelf op Google Zoeken en Maps. Je past ze dus alleen hier aan. Werkt pas nadat Google de toegang tot de Business Profile API&apos;s heeft goedgekeurd.</p>
  {!data?<p>Laden…</p>:!data.connected?<>
   <p>Koppel met het Google-account dat het profiel beheert: <b>{data.accountHint}</b>. De backoffice vraagt alleen het recht om het bedrijfsprofiel te beheren.</p>
   {data.oauthConfigured?<a className="btn" href="/api/google-profiel/koppelen">Koppel met Google</a>:<p className="ops-warning">Vul eerst de Google client-ID en het clientgeheim in bij Systeem &amp; koppelingen → Gmail.</p>}
  </>:<>
   <p className="ops-note">Gekoppeld met <b>{data.accountEmail||'Google'}</b> · laatst bijgewerkt {when(data.lastSync)}{data.posts?` · ${data.posts} evenement${data.posts===1?'':'en'} op Google`:''}. Wijzigingen gaan meteen naar Google, en elk half uur wordt nagekeken of alles nog klopt.</p>
   {data.lastError&&<p className="ops-warning">{data.lastError}</p>}
   {data.locationsError?<p className="ops-warning">{data.locationsError}</p>:
   <div className="ops-inline">
    <label>Profiel <select value={pick||data.location} disabled={working} onChange={e=>setPick(e.target.value)}>
     {!data.location&&<option value="">Kies het profiel…</option>}
     {data.location&&!chosen&&<option value={data.location}>{data.locationTitle||data.location}</option>}
     {data.locations.map(l=><option key={l.location} value={l.location}>{l.title}{l.address?' · '+l.address:''}</option>)}
    </select></label>
    {pick&&pick!==data.location&&<button type="button" className="btn" disabled={working} onClick={()=>{const l=data.locations.find(x=>x.location===pick);if(l)act({action:'kies-profiel',account:l.account,location:l.location,title:l.title}).then(()=>setPick(''))}}>Dit profiel gebruiken</button>}
   </div>}
   {data.location&&<>
    <div className="ops-inline">
     <label><input type="checkbox" checked={data.syncHours} disabled={working} onChange={e=>act({action:'instellingen',syncHours:e.target.checked,syncEvents:data.syncEvents})}/> Openingstijden en afwijkende dagen</label>
     <label><input type="checkbox" checked={data.syncEvents} disabled={working} onChange={e=>act({action:'instellingen',syncHours:data.syncHours,syncEvents:e.target.checked})}/> Evenementen als bericht</label>
    </div>
    <p className="ops-hint">Evenementen: alleen eigen, toekomstige evenementen (geen feestdagen of voorbeelden), hooguit 20.{data.website?` De knop „Meer informatie” gaat naar ${data.website}.`:' Vul bij Koppelingen & printers → Google Bedrijfsprofiel het adres van de website in voor een knop „Meer informatie”.'}</p>
    <button type="button" className="btn secondary" disabled={working} onClick={()=>act({action:'nu-bijwerken'})}>Nu bijwerken naar Google</button>
   </>}
   <p><button type="button" className="text-button" disabled={working} onClick={()=>act({action:'ontkoppelen'})}>Ontkoppelen</button></p>
  </>}
  {msg&&<p role="status" className="ops-note">{msg}</p>}
 </section>;
}
