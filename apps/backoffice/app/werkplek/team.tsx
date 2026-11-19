'use client';
// Werkplek Barista → „Wie is er vandaag?” (personeelsplanning, besluit eigenaar 5 november 2026). Hier, op de tablet op de boerderij,
// meldt een lid zich aan voor de rol die het geclaimd heeft; dat kan niet op afstand. Pas dan telt de rol mee in de restaurantpot.
// Wie ter plekke bijspringt, kiest hier zelf een vrije rol. Regels in lib/pot-planning.ts.
import {useCallback,useEffect,useState} from 'react';
type Role={roleId:string;roleName:string;status:'gepland'|'aanwezig';week:boolean;half?:boolean};
type Person={id:string;name:string;roles:Role[];present:boolean;planned:boolean;weekTasks:boolean};
type Today={day:string;help:{at:string;sent:number}|null;open:boolean;hours:string;hasAgreement:boolean;expected:{sure:number;possible:number};slots:{roleId:string;roleName:string;points:number;week:boolean;need:number;open:number;count:number}[];people:Person[]};
const HELLO=['Fijn dat je er bent','Welkom, held','Goeiemorgen, topper','Daar ben je','Lekker dat je komt helpen','Samen maken we er een mooie dag van'];
export function TeamToday({onCount}:{onCount?:(present:number,planned:number)=>void}){
 const [t,setT]=useState<Today|null>(null),[error,setError]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[who,setWho]=useState(''),[role,setRole]=useState(''),[half,setHalf]=useState(false);
 const take=useCallback((d:Today)=>{setT(d);onCount?.(d.people.filter(p=>p.present).length,d.people.filter(p=>p.planned||p.present).length)},[onCount]);
 const load=useCallback(async()=>{const r=await fetch('/api/pot-planning?pot=restaurant&tablet=1',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Laden mislukt.');return}take(d)},[take]);
 useEffect(()=>{load();const i=setInterval(load,60000);return ()=>clearInterval(i)},[load]);
 // Halve dienst (wens eigenaar 5 november 2026): de helft van de punten, bijvoorbeeld als extra hulp op een drukke dag.
 async function checkIn(p:{id:string;name:string},roleId='',halfShift=false){setBusy(true);setError('');setMsg('');
  try{const r=await fetch('/api/pot-planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'aanwezig',pot:'restaurant',participantId:p.id,roleId,half:halfShift})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Aanmelden lukte niet.');
   take(d);setWho('');setRole('');setHalf(false);setMsg(`${HELLO[Math.floor(Math.random()*HELLO.length)]}, ${p.name.split(' ')[0]}! Je bent aangemeld${halfShift?' voor een halve dienst':''}. 🌱`)}
  catch(e){setError(e instanceof Error?e.message:'Aanmelden lukte niet.')}finally{setBusy(false)}}
 // Hulp vragen (wens eigenaar 5 november 2026): pushbericht aan de leden van het restaurant, hooguit één keer per twee uur.
 async function askHelp(){if(!confirm('Alle leden van het restaurant een bericht sturen: „Het is drukker dan verwacht, zou je een halve dienst mee willen helpen?”'))return;
  setBusy(true);setError('');setMsg('');
  try{const r=await fetch('/api/pot-planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'hulp',pot:'restaurant'})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Versturen lukte niet.');
   take(d);setMsg(d.asked.sent?`Bericht verstuurd naar ${d.asked.sent} ${d.asked.sent===1?'telefoon':'telefoons'}. Wie komt, meldt zich hier aan met „halve dienst”.`:`Niemand van de ${d.asked.members} leden heeft berichten aanstaan. Bellen of appen dan maar!`)}
  catch(e){setError(e instanceof Error?e.message:'Versturen lukte niet.')}finally{setBusy(false)}}
 if(!t)return <section className="kiosk-team">{error?<p className="kiosk-error">{error}</p>:<p className="kiosk-sub">Even laden…</p>}</section>;
 const planned=t.people.filter(p=>p.planned||p.present),others=t.people.filter(p=>!p.planned&&!p.present),free=t.slots.filter(s=>s.open>0||s.week||(half&&!s.week));
 return <section className="kiosk-team" aria-label="Wie is er vandaag">
  <div className="kiosk-team-head"><h2>🙋 Wie is er vandaag?</h2><span>👥 {t.expected.sure} gasten zeker{t.expected.possible?` · +${t.expected.possible} mogelijk`:''}</span></div>
  {msg&&<p className="kiosk-team-msg" role="status">{msg}</p>}{error&&<p className="kiosk-error" role="alert">{error}</p>}
  {!t.hasAgreement?<p className="kiosk-sub">Er geldt vandaag nog geen afspraak voor de restaurantpot.</p>:<>
  <ul className="kiosk-team-list">{planned.map(p=><li key={p.id} className={p.present&&!p.planned?'here':''}>
   <div><b>{p.name}</b><span>{p.roles.map(r=>r.roleName+(r.half?' (halve dienst)':'')+(r.status==='aanwezig'?' ✓':'')).join(' · ')}</span></div>
   {p.planned?<span className="kiosk-actions"><button type="button" className="kiosk-btn" disabled={busy} onClick={()=>checkIn(p)}>Ik ben er!</button><button type="button" className="kiosk-btn soft" disabled={busy} onClick={()=>checkIn(p,'',true)}>Halve dienst</button></span>:<em>aangemeld ✓</em>}
  </li>)}{!planned.length&&<li><span className="kiosk-sub">Nog niemand ingepland voor vandaag.</span></li>}</ul>
  <details className="kiosk-team-extra"><summary>Ik spring vandaag bij / ik doe er een rol bij</summary>
   <div className="kiosk-team-form"><label>Wie ben je?<select className="kiosk-input" value={who} onChange={e=>setWho(e.target.value)}><option value="">Kies je naam</option>{[...planned,...others].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Welke rol?<select className="kiosk-input" value={role} onChange={e=>setRole(e.target.value)}><option value="">Kies een rol</option>{free.map(s=><option key={s.roleId} value={s.roleId}>{s.roleName} ({s.points} {s.points===1?'punt':'punten'}{s.week?', weektaak':''})</option>)}</select></label>
    <label className="kiosk-check"><input type="checkbox" checked={half} onChange={e=>setHalf(e.target.checked)}/> Halve dienst (helft van de punten; mag ook als de rol al vol is)</label>
    <button type="button" className="kiosk-btn" disabled={busy||!who||!role} onClick={()=>{const p=t.people.find(x=>x.id===who);if(p)checkIn(p,role,half)}}>Aanmelden</button></div>
   <p className="kiosk-sub">Is een rol vol? Vraag Rianne of Bartele om er een plek bij te zetten (Planning en reserveringen).</p>
  </details>
  <div className="kiosk-help"><button type="button" className="kiosk-btn soft" disabled={busy} onClick={askHelp}>📣 Drukker dan verwacht? Vraag hulp</button>
   <span className="kiosk-sub">{t.help?`Vandaag om ${new Date(t.help.at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})} gevraagd, naar ${t.help.sent} ${t.help.sent===1?'telefoon':'telefoons'}.`:'Stuurt de leden een bericht: help je een halve dienst mee?'}</span></div></>}
 </section>;
}
