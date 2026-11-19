'use client';
// Voorspelling daggasten (wens eigenaar 6 november 2026). Sinds 16 november 2026 (nieuwe indeling stap 3) het tabblad Bezoekersverwachting
// in Agenda & reserveringen; /planning/voorspelling stuurt daarheen door. De basis rekent met vergelijkbare dagen uit de twee meest recente open jaren (2026 was dicht) en het
// weer. Daarop: zelf bijstellen op het werkelijke bezoek van de afgelopen periode (verkochte entree), een algemene correctie in procenten,
// en per dag een eigen getal. Dezelfde voorspelling staat in de personeelsplanning en het dagoverzicht. Regels: lib/forecast-core.ts.
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {PageHead,Notice,Pill} from '../ui';
type Day={date:string;base:number|null;samples:number;reason:string;expected:number|null;how:string;override:{visitors:number;note:string;by:string}|null;weather:{temperature:number;rain:number}|null};
type View={settings:{auto:boolean;periodDays:number;manualPct:number;closedYears:number[];version:number};compareYears?:number[];calibration:{factor:number|null;days:number;reason:string};period:{date:string;predicted:number;actual:number}[];weatherError:string;days:Day[]};
const label=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const nl=(n:number)=>String(n).replace('.',',');

export function VoorspellingBeheer({embedded=false}:{embedded?:boolean}){
 const [v,setV]=useState<View|null>(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState({auto:true,periodDays:'28',manualPct:'0',closedYears:'2026'}),[own,setOwn]=useState<Record<string,{n:string;note:string}>>({}),[lijst,setLijst]=useState(''),[importMsg,setImportMsg]=useState('');
 const apply=(d:View)=>{setV(d);setForm({auto:d.settings.auto,periodDays:String(d.settings.periodDays),manualPct:String(d.settings.manualPct),closedYears:(d.settings.closedYears||[]).join(', ')})};
 const load=useCallback(async()=>{const r=await fetch('/api/voorspelling',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setMsg(d.error||'Laden mislukt.');return}apply(d)},[]);
 useEffect(()=>{void load()},[load]);
 async function post(body:object,ok:string){setBusy(true);setMsg('');try{const r=await fetch('/api/voorspelling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Opslaan lukte niet.');apply(d);setMsg(ok)}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 return <div data-bb-view="voorspelling">{!embedded&&<><PageHead eyebrow="PLANNING" title="Voorspelling daggasten" sub="Hoeveel daggasten we verwachten, zelf aan te passen en vanzelf bijgesteld op het werkelijke bezoek."/>
  <p><Link href="/planning">← Terug naar Planning</Link></p></>}
  {msg&&<div className="message" role="status">{msg}</div>}
  {!v?<p className="small">Laden…</p>:<>
   {v.weatherError&&<Notice kind="warn" title="Geen weersverwachting">{v.weatherError} Zonder weer is er geen basisvoorspelling; een eigen getal per dag kan wel. Stel de weerlocatie in bij <Link href="/koppeling">Systeem &amp; koppelingen → Weer</Link>.</Notice>}
   <section className="card section-gap" data-bb-view="voorspelling-instellingen"><h3 className="card-title">Bijstellen</h3>
    <p className="small">De basis gebruikt vergelijkbare dagen uit de twee meest recente jaren dat we open waren{v.compareYears?.length?` (${v.compareYears.join(" en ")})`:""}: zelfde weekdag, ±6 weken, vergelijkbaar weer. Werkelijk bezoek = de verkochte entree van de speelboerderij, of een bezoekdag die je met de hand registreerde.</p>
    <div className="form-grid"><label className="checkline"><input type="checkbox" checked={form.auto} onChange={e=>setForm({...form,auto:e.target.checked})}/> Zelf bijstellen op het werkelijke bezoek</label>
     <div className="field"><label>Over de afgelopen … dagen</label><input type="number" min={7} max={365} value={form.periodDays} onChange={e=>setForm({...form,periodDays:e.target.value})}/></div>
     <div className="field"><label>Algemene correctie in % (bijvoorbeeld +10 bij reclame)</label><input type="number" min={-90} max={300} value={form.manualPct} onChange={e=>setForm({...form,manualPct:e.target.value})}/></div>
     <div className="field"><label>Jaren dat we dicht waren (tellen niet mee)</label><input value={form.closedYears} placeholder="2026" onChange={e=>setForm({...form,closedYears:e.target.value})}/><small className="small">De voorspelling vergelijkt met de twee meest recente jaren dat we open waren{v.compareYears?.length?`: nu ${v.compareYears.join(' en ')}`:''}.</small></div></div>
    <button className="btn section-gap" disabled={busy} onClick={()=>void post({action:'instellingen',version:v.settings.version,settings:{auto:form.auto,periodDays:Number(form.periodDays),manualPct:Number(form.manualPct),closedYears:form.closedYears}},'Opgeslagen.')}>Opslaan</button>
    <p className="small section-gap">Correctiefactor nu: <b>{v.calibration.factor!==null?'× '+nl(v.calibration.factor):'geen'}</b> · {v.calibration.reason}</p>
   </section>
   <section className="card section-gap" data-bb-view="voorspelling-dagen"><h3 className="card-title">Komende dagen</h3>
    <div className="table-wrap"><table><thead><tr><th>Dag</th><th>Weer</th><th>Basis</th><th>Voorspelling</th><th>Eigen getal</th></tr></thead><tbody>
     {v.days.map(d=>{const o=own[d.date]??{n:d.override?String(d.override.visitors):'',note:d.override?.note||''};
      return <tr key={d.date}><td>{label(d.date)}</td><td className="small">{d.weather?`${Math.round(d.weather.temperature)}°, ${nl(Math.round(d.weather.rain*10)/10)} mm`:'–'}</td>
       <td>{d.base??'–'}<div className="small">{d.base===null?d.reason:`${d.samples} vergelijkbare dagen`}</div></td>
       <td><b>{d.expected??'–'}</b> {d.how==='eigen getal'?<Pill color="blue">eigen getal</Pill>:d.how==='bijgesteld'?<Pill color="green">bijgesteld</Pill>:null}</td>
       <td><div className="row" style={{gap:6}}><input style={{width:80}} type="number" min={0} aria-label={`Eigen getal ${label(d.date)}`} value={o.n} onChange={e=>setOwn({...own,[d.date]:{...o,n:e.target.value}})}/>
        <input aria-label={`Waarom ${label(d.date)}`} placeholder="waarom (mag leeg)" value={o.note} onChange={e=>setOwn({...own,[d.date]:{...o,note:e.target.value}})}/>
        <button className="btn secondary sm" disabled={busy} onClick={()=>void post({action:'eigen-getal',date:d.date,visitors:o.n===''?null:Number(o.n),note:o.note},o.n===''?'Eigen getal weggehaald.':'Eigen getal opgeslagen.')}>{o.n===''&&d.override?'Weghalen':'Opslaan'}</button></div></td></tr>})}
    </tbody></table></div></section>
   <section className="card section-gap" data-bb-view="voorspelling-periode"><h3 className="card-title">Voorspeld en werkelijk (afgelopen {v.settings.periodDays} dagen)</h3>
    {!v.period.length?<p className="small">Nog geen dagen om te vergelijken. Vanaf nu wordt elke voorspelling bewaard en na de dag vergeleken met de verkochte entree.</p>
     :<div className="table-wrap"><table><thead><tr><th>Dag</th><th>Voorspeld (basis)</th><th>Werkelijk</th><th>Verschil</th></tr></thead><tbody>
      {v.period.map(p=><tr key={p.date}><td>{label(p.date)}</td><td>{p.predicted}</td><td>{p.actual}</td><td>{p.actual-p.predicted>0?'+':''}{p.actual-p.predicted}</td></tr>)}</tbody></table></div>}
   </section>
   {/* Historische bezoekdagen (wens eigenaar 9 november 2026): bijvoorbeeld uit de oude kassa (2024 en 2025). Het weer haalt de backoffice
       zelf uit het weerarchief; zonder bezoekdagen uit die jaren geeft de basis geen getal. */}
   <section className="card section-gap" data-bb-view="voorspelling-bezoekdagen"><h3 className="card-title">Bezoekdagen uit eerdere jaren inlezen</h3>
    <p className="small">Per regel een datum en het aantal daggasten, bijvoorbeeld <code>2025-06-14;120</code>. Het weer van die dag haalt de backoffice zelf op. Een dag die al bestaat, wordt vervangen.</p>
    <input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={busy} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f)setLijst(await f.text())}}/>
    <textarea rows={5} value={lijst} onChange={e=>setLijst(e.target.value)} placeholder={'2025-06-14;120\n2025-06-15;180'} style={{width:'100%'}}/>
    <button className="btn section-gap" disabled={busy||!lijst.trim()} onClick={async()=>{setBusy(true);setMsg('');setImportMsg('Bezig met inlezen en het weer ophalen…');try{const r=await fetch('/api/voorspelling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bezoekdagen',text:lijst})});const d=await r.json().catch(()=>({error:`De server gaf geen antwoord (${r.status}).`}));if(!r.ok)throw Error(d.error||'Inlezen lukte niet.');apply(d);setLijst('');setImportMsg(`${d.imported.imported} bezoekdagen ingelezen (${d.imported.from} t/m ${d.imported.to})${d.imported.skipped?`; ${d.imported.skipped} zonder weer in het archief overgeslagen`:''}.`)}catch(err){setImportMsg('Niet gelukt: '+(err as Error).message)}finally{setBusy(false)}}}>Inlezen</button>
    {importMsg&&<p className={importMsg.startsWith('Niet gelukt')?'mail-error':'small'} role="status">{importMsg}</p>}
   </section>
  </>}
 </div>;
}
