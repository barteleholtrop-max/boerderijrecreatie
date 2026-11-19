'use client';
// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026: „Bij de telefoonberichten-app moet nieuw
// inloggen niet nodig zijn. Die app moet altijd bij die telefoon passen.”).
// - Nog niet onthouden: bovenaan de vraag „Deze telefoon ingelogd houden?”. Eén tik (vlak na het inloggen, anders eerst de
//   code uit de Authenticator-app) en de app blijft op deze telefoon ingelogd.
// - Onthouden: de telefoonpas geldt 60 minuten. Zolang de app openstaat, haalt de telefoon elke 10 minuten (en als de app
//   weer zichtbaar wordt) een nieuwe pas op met zijn apparaatbewijs. Een ontkoppelde telefoon krijgt geen nieuwe pas meer.
import {useEffect,useState} from 'react';
type Stand='laden'|'niet'|'onthouden'|'verborgen';
const HIDE_KEY='bb-telefoon-niet-nu';
export function TelefoonIngelogd(){
 const [stand,setStand]=useState<Stand>('laden'),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 useEffect(()=>{let stop=false;
  void fetch('/api/telefoon',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(stop||!d)return;
   let hidden=false;try{hidden=sessionStorage.getItem(HIDE_KEY)==='1'}catch{}
   setStand(d.stand==='onthouden'?'onthouden':hidden?'verborgen':'niet');
  }).catch(()=>{});
  return()=>{stop=true};
 },[]);
 useEffect(()=>{if(stand!=='onthouden')return;let last=Date.now();
  const renew=()=>{if(Date.now()-last<60000)return;last=Date.now();void fetch('/auth/telefoon/vernieuw',{method:'POST',cache:'no-store'}).catch(()=>{})};
  const t=setInterval(renew,600000),vis=()=>{if(!document.hidden)renew()};document.addEventListener('visibilitychange',vis);
  return()=>{clearInterval(t);document.removeEventListener('visibilitychange',vis)};
 },[stand]);
 async function remember(){setBusy(true);setMsg('');
  try{const r=await fetch('/api/telefoon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'onthouden'})}),d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'Dat lukte niet. Probeer het opnieuw.');setStand('onthouden');setMsg('Deze telefoon blijft ingelogd in de app.');
  }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 if(stand==='niet')return <div className="notice info" role="region" aria-label="Ingelogd blijven" style={{margin:'8px 12px'}}><div>
  <strong>Deze telefoon ingelogd houden?</strong> Dan hoef je in deze app niet meer in te loggen, ook niet morgen. Alleen jouw eigen telefoon; telefoon kwijt? Een eigenaar ontkoppelt hem bij Toegang.
  <div className="action-row" style={{marginTop:8}}>
   <button className="btn sm" disabled={busy} onClick={remember}>Ingelogd houden</button>
   <button className="btn sm secondary" disabled={busy} onClick={()=>{try{sessionStorage.setItem(HIDE_KEY,'1')}catch{}setStand('verborgen')}}>Niet nu</button>
  </div>
  {msg&&<p role="status" className="small">{msg}</p>}
 </div></div>;
 if(msg)return <p role="status" className="small" style={{margin:'8px 12px'}}>{msg}</p>;
 return null;
}
