'use client';
// Google Drive als beeldbank (akkoord eigenaar 3 november 2026): foto's in de Drive-map komen vanzelf in de
// beeldbibliotheek. Alleen lezen via het account van de factuurmail (administratie@). Zie lib/drive.ts.
import {useCallback,useEffect,useState} from 'react';
import {Pill} from '../ui';
type Overview={mailbox:string;connected:boolean;expired:boolean;driveAllowed:boolean;folderSet:boolean;folderValid:boolean;lastOk:string|null;lastAttempt:string|null;lastError:string|null;
 summary:{found?:number;imported?:number;skipped?:number;waiting?:number;folders?:number;restored?:number;notRestored?:number};totals:{imported:number;skipped:number};syncing:boolean;skipped:{name:string;reason:string;updated:string}[]};
const when=(v:string|null)=>v?new Date(v).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'nog niet';

export function DriveSync(){
 const [data,setData]=useState<Overview|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch('/api/drive',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Laden mislukt.');setData(d)}catch(e){setMessage((e as Error).message)}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{const t=setInterval(()=>{void load()},data?.syncing?4000:60000);return()=>clearInterval(t)},[load,data?.syncing]);
 useEffect(()=>{
  const q=new URLSearchParams(location.search),g=q.get('drive');
  if(g){setMessage(g==='gekoppeld'?'Google Drive is gekoppeld (alleen lezen). De foto\'s uit de map worden nu opgehaald.':q.get('melding')||'Koppelen is niet gelukt.');history.replaceState(null,'','/koppeling#drive');document.getElementById('drive')?.scrollIntoView()}
 },[]);
 async function sync(){
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/drive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync'})});const d=await r.json();if(!r.ok)throw Error(d.error||'Ophalen kon niet starten.');setMessage(d.message);setTimeout(()=>void load(),2000)}
  catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 const ready=!!data&&data.connected&&data.driveAllowed&&data.folderValid,s=data?.summary||{};
 return <section className="section-gap" id="drive" aria-labelledby="drive-title">
  <h2 id="drive-title" style={{marginTop:32}}>Google Drive · foto&apos;s naar de beeldbibliotheek</h2>
  <p className="sub">Zet foto&apos;s in de Drive-map; elk uur komen nieuwe foto&apos;s vanzelf in de beeldbibliotheek. De backoffice leest alleen: in Drive wordt nooit iets veranderd of verwijderd.</p>
  {message&&<div role="status" className="message">{message} <button onClick={()=>setMessage('')} aria-label="Melding sluiten">×</button></div>}
  {!data?<p className="small">Laden…</p>:<div className="card">
   <div className="card-head"><h3 className="card-title">Beeldbank</h3><Pill color={ready?'green':'orange'}>{ready?'Gekoppeld':'Nog niet klaar'}</Pill></div>
   <ol className="small" style={{paddingLeft:18,lineHeight:1.8}}>
    <li>Drive-map: {data.folderValid?<b>ingevuld</b>:data.folderSet?<b style={{color:'#9b4e45'}}>dit is geen geldige Drive-link of map-ID</b>:<>vul hierboven bij <b>Google Drive</b> de link van de map in</>}.</li>
    <li>Google-account <b>{data.mailbox}</b>: {data.connected&&data.driveAllowed?<b>gekoppeld met Drive (alleen lezen)</b>:data.expired?<b style={{color:'#9b4e45'}}>toegang verlopen, koppel opnieuw</b>:data.connected?<>gekoppeld voor de factuurmail, <b>Drive nog niet toegestaan</b></>:'nog niet gekoppeld'}.</li>
   </ol>
   <div className="action-row" style={{marginTop:10}}>
    {!(data.connected&&data.driveAllowed)&&<a className="btn" href="/api/drive/koppelen">Koppel {data.mailbox} met Drive</a>}
    {ready&&<button className="btn" disabled={busy||data.syncing} onClick={sync}>{data.syncing?'Bezig met ophalen…':'Nu ophalen uit Drive'}</button>}
   </div>
   {ready&&<p className="small" style={{marginTop:12}}>Laatst opgehaald: {when(data.lastOk)}{s.found!==undefined?` · ${s.found} foto's in de map${s.folders&&s.folders>1?` (${s.folders} mappen)`:''} · ${data.totals.imported} in de beeldbibliotheek${s.imported?` (${s.imported} nieuw bij de laatste ronde)`:''} · ${data.totals.skipped} niet overgenomen${s.waiting?` · ${s.waiting} volgen bij de volgende ronde`:''}${s.restored?` · ${s.restored} ontbrekende foto’s opnieuw uit Drive gehaald`:''}${s.notRestored?` · ${s.notRestored} ontbrekende foto’s niet te herstellen`:''}`:''}.</p>}
   {data.lastError&&<p className="notice warn" style={{marginTop:10}}>{data.lastError}</p>}
   {data.skipped.length>0&&<details style={{marginTop:10}}><summary className="small">Niet overgenomen ({data.skipped.length})</summary><ul className="small">{data.skipped.map((f,i)=><li key={i}><b>{f.name}</b>: {f.reason}</li>)}</ul></details>}
  </div>}
 </section>;
}
