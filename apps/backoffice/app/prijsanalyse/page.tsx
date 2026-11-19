'use client';
// Prijzen & verkoopklaar (owner request, 2 November 2026).
// One overview of every product: what still blocks selling it, how its price compares with the region
// (30 km around Rotstergaast) and a careful proposal. The owner ticks what to adopt; nothing changes by itself.
import {useEffect,useMemo,useState} from 'react';
import {PageHead,Kpi,Notice,Pill,money,SubTabs} from '../ui';
import {PRODUCT_TABS} from '../producten/tabs';
import {adviseAll,type Advice,type ProductLike} from '@/lib/price-advice';
import {BENCHMARKS,BENCHMARKS_COLLECTED,BENCHMARK_ORIGIN,BENCHMARK_RADIUS_KM} from '@/lib/price-benchmarks';
import {WinkelAdvies} from './winkel-advies';

type Filter='alles'|'voorstel'|'niet-klaar'|'klaar'|'boven'|'afwijkend'|'kopie'|'nakijken';
const FILTERS:[Filter,string][]=[
 ['niet-klaar','Nog niet verkoopklaar'],['voorstel','Met prijsvoorstel'],['boven','Boven de regio'],
 ['afwijkend','Afwijkend op eigen kaart'],['kopie','Kopieën'],['nakijken','Even nakijken (boven regio, afwijkend of kopie)'],['klaar','Verkoopklaar'],['alles','Alle producten'],
];
type Choice={selected:boolean;priceCents:number;vat:string;station:string};
const STATIONS:[string,string][]=[['kok','Keuken'],['barista','Bar'],['winkel','Winkel']];

const ready=(a:Advice)=>a.blockers.length===0;
function matches(a:Advice,f:Filter){
 if(f==='alles')return true;
 if(f==='voorstel')return a.proposedCents!==null;
 if(f==='niet-klaar')return !ready(a);
 if(f==='klaar')return ready(a);
 if(f==='boven')return a.position==='boven';
 if(f==='afwijkend')return a.ownFlag!==null;
 if(f==='nakijken')return a.position==='boven'||a.ownFlag!==null||a.duplicate;
 return a.duplicate;
}
// The default choice for a product: the proposal where there is one, otherwise what is already set.
function defaultChoice(a:Advice):Choice{
 return {selected:false,priceCents:a.proposedCents??a.priceCents,vat:a.vat||a.vatSuggestion,station:['kok','barista','winkel'].includes(a.station)?a.station:(a.stationSuggestion??'')};
}

export default function Prijsanalyse(){
 const [rows,setRows]=useState<ProductLike[]|null>(null);
 const [choices,setChoices]=useState<Record<string,Choice>>({});
 const [filter,setFilter]=useState<Filter>('niet-klaar');
 const [query,setQuery]=useState('');
 const [dept,setDept]=useState('Alle afdelingen');
 const [confirmPrice,setConfirmPrice]=useState(true);
 const [publish,setPublish]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [open,setOpen]=useState<string|null>(null);

 async function load(){
  const r=await fetch('/api/products',{cache:'no-store'});
  if(!r.ok)throw Error('Producten konden niet worden geladen.');
  const data=await r.json() as ProductLike[];
  setRows(data);setChoices({});
 }
 useEffect(()=>{load().catch(e=>setMessage(e.message))},[]);
 // Snelkoppelingen (wens eigenaar 4 november 2026): een tegel toont de lijst met precies die producten; het adres onthoudt de keuze.
 useEffect(()=>{const f=new URLSearchParams(window.location.search).get('filter') as Filter|null;if(f&&FILTERS.some(x=>x[0]===f))setFilter(f)},[]);
 function jump(f:Filter){setFilter(f);setOpen(null);try{const u=new URL(window.location.href);u.searchParams.set('filter',f);window.history.replaceState(null,'',u)}catch{}requestAnimationFrame(()=>document.getElementById('prijslijst')?.scrollIntoView({behavior:'smooth',block:'start'}))}

 const advice=useMemo(()=>rows?adviseAll(rows):[],[rows]);
 const choice=(a:Advice)=>choices[a.id]??defaultChoice(a);
 const setChoice=(a:Advice,patch:Partial<Choice>)=>setChoices(c=>({...c,[a.id]:{...choice(a),...patch}}));
 const shown=advice.filter(a=>matches(a,filter)&&(dept==='Alle afdelingen'||a.department===dept)&&a.name.toLowerCase().includes(query.trim().toLowerCase()));
 const selected=advice.filter(a=>choice(a).selected);
 const departments=[...new Set(advice.map(a=>a.department).filter(Boolean))].sort();

 function selectShown(on:boolean){setChoices(c=>{const next={...c};for(const a of shown)next[a.id]={...choice(a),selected:on};return next})}

 async function apply(){
  if(!selected.length)return;
  setBusy(true);setMessage('');
  try{
   const changes=selected.map(a=>{const c=choice(a);return {
    id:a.id,version:a.version,
    ...(c.priceCents!==a.priceCents?{priceCents:c.priceCents}:{}),
    ...(c.vat&&c.vat!==a.vat?{vat:c.vat}:{}),
    ...(c.station&&c.station!==a.station?{station:c.station}:{}),
    confirmPrice,publish,
   }});
   const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'apply-advice',changes})});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Overnemen is niet gelukt.');
   const names=new Map(advice.map(a=>[a.id,a.name]));
   const skipped=(d.skipped as {id:string,reason:string}[]).slice(0,8).map(s=>`${names.get(s.id)}: ${s.reason}`).join(' · ');
   setMessage(d.message+(skipped?' '+skipped:''));
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Overnemen is niet gelukt.')}
  finally{setBusy(false)}
 }

 const count=(f:Filter)=>advice.filter(a=>matches(a,f)).length;
 return <div data-bb-view="prijsanalyse">
  <PageHead eyebrow="GERECHTEN & PRIJZEN" title="Prijzen & verkoopklaar" sub={`Wat er per product nog ontbreekt, en hoe de prijs zich verhoudt tot de regio (${BENCHMARK_RADIUS_KM} km rond ${BENCHMARK_ORIGIN}).`}>
  </PageHead>
  <SubTabs current="/prijsanalyse" items={PRODUCT_TABS}/>
  <div className="grid four">
   <Kpi label="Verkoopklaar" value={rows?count('klaar'):'…'} foot={`van ${advice.length} producten`} icon="✓" onClick={()=>jump('klaar')} active={filter==='klaar'}/>
   <Kpi label="Nog niet klaar" value={rows?count('niet-klaar'):'…'} foot="prijs, btw, werkafdeling of publicatie" icon="!" onClick={()=>jump('niet-klaar')} active={filter==='niet-klaar'}/>
   <Kpi label="Prijsvoorstellen" value={rows?count('voorstel'):'…'} foot="onder de regionale prijzen" icon="€" onClick={()=>jump('voorstel')} active={filter==='voorstel'}/>
   <Kpi label="Even nakijken" value={rows?count('nakijken'):'…'} foot="boven regio, afwijkend of kopie" icon="?" onClick={()=>jump('nakijken')} active={filter==='nakijken'}/>
  </div>
  <div className="section-gap"><Notice title="Zo werkt het" kind="info">
   Vink aan wat je wilt overnemen en druk op <b>Overnemen</b>. Een prijsvoorstel brengt een product alleen naar de onderkant van wat vergelijkbare zaken in de regio vragen; boven de regio verlagen we niets automatisch. Btw: 9%, alleen drank met alcohol 21% (wettelijk verplicht). Je kunt elk voorstel aanpassen voordat je het overneemt.
  </Notice></div>

  <div className="card section-gap" id="prijslijst">
   <div className="card-head">
    <div className="filters">
     <input aria-label="Zoek product" placeholder="Zoek een product…" value={query} onChange={e=>setQuery(e.target.value)}/>
     <select aria-label="Weergave" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>{FILTERS.map(([id,label])=><option key={id} value={id}>{label} ({rows?count(id):'…'})</option>)}</select>
     <select aria-label="Afdeling" value={dept} onChange={e=>setDept(e.target.value)}><option>Alle afdelingen</option>{departments.map(d=><option key={d}>{d}</option>)}</select>
    </div>
   </div>
   <div className="row" style={{flexWrap:'wrap',gap:12,margin:'12px 0'}}>
    <button className="btn secondary sm" disabled={busy||!shown.length} onClick={()=>selectShown(true)}>Alles in deze lijst aanvinken ({shown.length})</button>
    <button className="btn secondary sm" disabled={busy||!selected.length} onClick={()=>selectShown(false)}>Vinkjes in deze lijst weghalen</button>
    <label className="small"><input type="checkbox" checked={confirmPrice} onChange={e=>setConfirmPrice(e.target.checked)}/> Prijs als gecontroleerd markeren</label>
    <label className="small"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Direct publiceren (zichtbaar voor gasten)</label>
    <button className="btn" disabled={busy||!selected.length} onClick={apply}>{busy?'Bezig…':`Overnemen (${selected.length})`}</button>
   </div>
   {message&&<div className="message" role="status">{message}</div>}
   {!rows?<p className="small">Producten laden…</p>:!shown.length?<div className="empty">Geen producten in deze weergave.</div>:
   <div className="table-wrap"><table>
    <thead><tr><th aria-label="Kiezen"/><th>Product</th><th>Nu</th><th>Regio</th><th>Prijs</th><th>Btw</th><th>Werkafdeling</th><th>Wat nog ontbreekt</th></tr></thead>
    <tbody>{shown.map(a=><AdviceRow key={a.id} a={a} c={choice(a)} busy={busy} open={open===a.id} onOpen={()=>setOpen(open===a.id?null:a.id)} onChange={p=>setChoice(a,p)}/>)}</tbody>
   </table></div>}
  </div>

  <WinkelAdvies/>

  <div className="card section-gap">
   <h3 className="card-title">Bronnen van de regionale prijzen</h3>
   <p className="small">Verzameld op {BENCHMARKS_COLLECTED} via zoekresultaten: menukaarten zelf konden niet direct worden geopend. Menukaarten online kunnen ouder zijn; waar bekend staat de datum erbij. Afhaalzaken (cafetaria, snackbar) tellen alleen als ondergrens, niet mee voor voorstellen.</p>
   <div className="table-wrap"><table>
    <thead><tr><th>Wat</th><th>Prijs</th><th>Zaak</th><th>Plaats</th><th>Soort</th><th>Bron</th></tr></thead>
    <tbody>{BENCHMARKS.map((b,i)=><tr key={i}><td>{b.item}</td><td>{money(b.priceCents)}</td><td>{b.business}</td><td>{b.place} · ±{b.km} km</td><td>{b.segment==='horeca'?'Café / restaurant':'Afhaal'}</td><td><a href={b.source} target="_blank" rel="noopener noreferrer">bekijken</a>{b.note?` · ${b.note}`:''}</td></tr>)}</tbody>
   </table></div>
  </div>
 </div>;
}

function AdviceRow({a,c,busy,open,onOpen,onChange}:{a:Advice;c:Choice;busy:boolean;open:boolean;onOpen:()=>void;onChange:(p:Partial<Choice>)=>void}){
 const region=a.region&&a.region.n>0?`${money(a.region.min)} – ${money(a.region.max)}`:'—';
 return <>
  <tr>
   <td><input type="checkbox" aria-label={'Kies '+a.name} checked={c.selected} disabled={busy} onChange={e=>onChange({selected:e.target.checked})}/></td>
   <td><strong>{a.name}</strong><div className="small">{a.department}{a.categoryLabel?` · ${a.categoryLabel}`:''}</div>{a.duplicate&&<Pill color="orange">Kopie?</Pill>}</td>
   <td>{money(a.priceCents)}</td>
   <td><button className="text-button" onClick={onOpen} aria-expanded={open}>{region}</button>{a.position==='onder'&&<div><Pill color="blue">onder regio</Pill></div>}{a.position==='boven'&&<div><Pill color="purple">boven regio</Pill></div>}</td>
   <td><input key={c.priceCents} aria-label={'Prijs '+a.name} type="number" min="0.05" step="0.05" style={{width:90}} defaultValue={(c.priceCents/100).toFixed(2)} disabled={busy} onBlur={e=>{const v=Math.round(Number(e.target.value)*100);if(Number.isInteger(v)&&v>0&&v!==c.priceCents)onChange({priceCents:v,selected:true});else e.target.value=(c.priceCents/100).toFixed(2)}}/>{a.proposedCents!==null&&<div className="small">voorstel {money(a.proposedCents)}</div>}</td>
   <td><select aria-label={'Btw '+a.name} value={c.vat} disabled={busy} onChange={e=>onChange({vat:e.target.value,selected:true})}><option value="9">9%</option><option value="21">21%</option></select>{!a.vat&&<div className="small">voorstel</div>}</td>
   <td><select aria-label={'Werkafdeling '+a.name} value={c.station} disabled={busy} onChange={e=>onChange({station:e.target.value,selected:true})}><option value="">Kies…</option>{STATIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{!['kok','barista','winkel'].includes(a.station)&&c.station&&<div className="small">voorstel</div>}</td>
   <td>{a.blockers.length?a.blockers.map(b=><Pill key={b} color="orange">{b}</Pill>):<Pill color="green">Verkoopklaar</Pill>}</td>
  </tr>
  {open&&<tr><td/><td colSpan={7}>
   <p className="small">{a.reason}</p>
   {a.ownFlag&&<p className="small">{a.ownFlag}</p>}
   {a.vat!==a.vatSuggestion&&<p className="small">Btw-voorstel {a.vatSuggestion}%: {a.vatReason}.</p>}
   {a.region&&[...a.region.references,...a.region.lowReferences].map((b,i)=><div className="small" key={i}>{b.business} ({b.place}, ±{b.km} km): {b.item} {money(b.priceCents)}{b.segment==='afhaal'?' · afhaal':''}</div>)}
  </td></tr>}
 </>;
}
