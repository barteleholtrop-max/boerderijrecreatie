'use client';
import {useEffect,useState} from 'react';
import {call} from '../gesprekken/mail';
import type {KnowledgeExample} from '@/lib/group-advice';
export function GroupKnowledge(){
 const [examples,setExamples]=useState<KnowledgeExample[]>([]),[manage,setManage]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const d=await call<{state:{groupKnowledge?:KnowledgeExample[]};permissions:{manage:boolean}}>('/api/gasten');setExamples(d.state.groupKnowledge||[]);setManage(d.permissions.manage)}
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 async function save(form:HTMLFormElement){setBusy(true);setError('');const f=new FormData(form),get=(k:string)=>String(f.get(k)||''),lines=(k:string)=>get(k).split('\n').map(v=>v.trim()).filter(Boolean);
  try{await call('/api/gasten',{action:'knowledge-add',example:{id:get('id'),source:get('source'),informationDate:get('informationDate'),consultedAt:new Date().toISOString(),wishes:get('wishes'),solution:get('solution'),included:lines('included'),unknown:lines('unknown'),historicalPrices:lines('historicalPrices'),evidence:get('evidence'),status:get('status')}});form.reset();await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="card section-gap"><h3 className="card-title">Eerdere oplossingen en prijsbronnen</h3>
  <p className="small">Bewaar alleen noodzakelijke gegevens en gecontroleerde broninformatie. Oude prijzen blijven historische voorbeelden. Een uitzondering wordt geen algemene regel. Trello wordt hier niet gewijzigd of automatisch geraadpleegd.</p>
  {error&&<p className="message error" role="alert">{error}</p>}
  {examples.length?<><a className="btn secondary sm" download="groepskennis.json" href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(examples,null,2))}>Bronvoorbeelden downloaden</a>{examples.map(e=><details key={e.id}><summary>{e.id} · {e.informationDate} · {e.status}</summary><p>{e.wishes}</p><p>{e.solution}</p><p>{e.historicalPrices.join('; ')}</p><p>Inbegrepen: {e.included.join('; ')} · Onbekend: {e.unknown.join('; ')} · {e.evidence}</p><a href={e.source} target="_blank" rel="noreferrer">Bron</a><p className="small">Vastgelegd op {e.consultedAt}</p></details>)}</>:<p className="small">Nog geen bronvoorbeelden vastgelegd. AI kan geen Trello-historie of regionale raadpleging claimen.</p>}
  {manage&&<details><summary>Gecontroleerd bronvoorbeeld toevoegen</summary><form className="guest-form guest-form-grouped" onSubmit={e=>{e.preventDefault();void save(e.currentTarget)}}>
   <fieldset className="guest-fieldgroup"><legend>Herkomst</legend>
    <label>Dossiernummer (nieuwe versie = nieuw nummer)<input name="id" required maxLength={100}/></label>
    <label>Bronlink<input name="source" type="url" required/></label>
    <label>Informatiedatum<input name="informationDate" type="date" required/></label>
    <label>Bewijsstatus<select name="evidence"><option value="feit">Vastgelegd feit</option><option value="interpretatie">Interpretatie</option><option value="onbekend">Onbekend</option></select></label>
    <label>Prijsstatus<select name="status"><option value="onbekend">Onbekend</option><option value="aangeboden">Aangeboden</option><option value="geaccepteerd">Aantoonbaar geaccepteerd</option></select></label>
   </fieldset>
   <fieldset className="guest-fieldgroup"><legend>Voorbeeld</legend>{[['wishes','Wensen / groepssamenstelling / gelegenheid'],['solution','Invulling en duur'],['historicalPrices','Historische of regionale prijzen met datum, eenheid en btw'],['included','Inbegrepen: eten, drinken, entree, exclusiviteit'],['unknown','Onbekende onderdelen en vergelijkingsverschillen']].map(([name,label])=><label key={name}>{label}<textarea name={name} rows={3} maxLength={12000} required={name==='wishes'||name==='solution'}/></label>)}</fieldset>
   <div className="guest-form-actions"><button className="btn secondary" disabled={busy}>Bronvoorbeeld bewaren</button></div>
  </form></details>}
 </section>
}
