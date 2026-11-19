'use client';
// Tablet koppelen (besluit eigenaar 6 november 2026). Een eigenaar maakt in Toegang → Werkplektablets een QR-code; de tablet
// scant hem en komt hier. De code staat achter het #-teken, zodat hij nooit in een serverlogboek komt, en wordt pas
// ingewisseld als iemand op de knop drukt. Daarna opent de tablet alleen de werkplekschermen, nooit de backoffice.
import {useEffect,useState} from 'react';
import {Brand} from '../../inloggen/brand';
export default function TabletKoppelen(){
 const [code,setCode]=useState(''),[typed,setTyped]=useState(''),[gone,setGone]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const c=location.hash.slice(1);if(/^[A-Za-z0-9_-]{43}$/.test(c)||/^[A-Z0-9]{8}$/.test(c))setCode(c);setGone(new URLSearchParams(location.search).has('ontkoppeld'));
  // De code uit de adresbalk halen: wie later meekijkt of de geschiedenis opent, ziet hem niet meer.
  if(location.hash)history.replaceState(null,'',location.pathname+location.search)},[]);
 async function pair(value=code){setBusy(true);setError('');
  try{const r=await fetch('/auth/werkplek/koppelen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:value})}),d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||'Koppelen lukte niet. Maak in de backoffice een nieuwe QR-code.');return}
   location.assign(typeof d.naar==='string'?d.naar:'/werkplek/kassa');
  }catch{setError('Geen verbinding. Probeer het opnieuw.')}finally{setBusy(false)}}
 return <main className="login-page"><section className="login-card" aria-labelledby="tablet-titel"><Brand/>
  <h1 id="tablet-titel">Tablet koppelen</h1>
  {gone&&!code&&<p className="login-msg fout" role="alert">Deze tablet is niet (meer) gekoppeld. Vraag een eigenaar om hem opnieuw te koppelen.</p>}
  {error&&<p className="login-msg fout" role="alert">{error}</p>}
  {code?<><p className="login-sub">Koppel deze tablet als werkplek. Daarna opent hij de kassa en de andere werkplekschermen zonder in te loggen. De backoffice zelf blijft dicht op deze tablet.</p>
   <button type="button" className="login-google" disabled={busy} onClick={()=>pair()}>{busy?'Koppelen…':'Deze tablet koppelen'}</button></>
  :<><p className="login-sub">Een eigenaar opent in de backoffice <b>Systeem → Toegang → Werkplektablets</b> en kiest „Tablet koppelen”. Scan de QR-code met de camera van dit scherm, of typ hieronder de koppelcode als dit scherm geen camera heeft. De code werkt één keer en 10 minuten.</p>
   <form onSubmit={e=>{e.preventDefault();void pair(typed)}} className="tablet-code-form">
    <label htmlFor="koppelcode">Koppelcode</label>
    <input id="koppelcode" className="login-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9} placeholder="ABCD-EFGH" value={typed} onChange={e=>setTyped(e.target.value.toUpperCase())}/>
    <button type="submit" className="login-google" disabled={busy||typed.replace(/[\s-]/g,'').length!==8}>{busy?'Koppelen…':'Dit scherm koppelen'}</button>
   </form></>}
  <p className="login-foot">Werk je zelf in de backoffice? <a href="/inloggen">Gewoon inloggen</a>.</p>
 </section></main>;
}
