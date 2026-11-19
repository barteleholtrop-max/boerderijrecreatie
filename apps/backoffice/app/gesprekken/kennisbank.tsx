'use client';
// Kennisbank voor gastmail (wens eigenaar 9 november 2026). Wat hier is goedgekeurd, gaat mee naar de assistent bij elke mail.
// Oude geschiedenis uit Trello (JSON-export) en Wix (CSV-export van berichten of boekingen): het bestand wordt in deze browser
// gelezen en in stukken naar de assistent gestuurd; die stelt kennisitems voor. Het bestand zelf wordt nergens bewaard.
import {useEffect,useState} from 'react';
import {Pill} from '../ui';
import {KB_KINDS,chunk,trelloEntries,csvEntries,textEntries,whatsappEntries,pickOurName,type KbKind} from '@/lib/kennisbank-core';
import {parseWhatsappExport} from '@/lib/whatsapp-export';
import {zipEntries} from '@/lib/zip-browser';
type Item={id:string;kind:KbKind;title:string;answer:string;source:string;sourceNote:string;status:'voorstel'|'goedgekeurd';version:number;updated:string;updatedBy:string};
type Draft={id?:string;version?:number;kind:KbKind;title:string;answer:string};
const empty:Draft={kind:'vraag',title:'',answer:''};
const kindLabel=(k:string)=>KB_KINDS.find(([x])=>x===k)?.[1]||k;
async function post(body:unknown){const r=await fetch('/api/kennisbank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Dat lukte niet.');return d}

export function Kennisbank(){
 const [items,setItems]=useState<Item[]|null>(null),[draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const [source,setSource]=useState<'trello'|'wix'|'tekst'|'whatsapp'>('trello'),[progress,setProgress]=useState(''),[paste,setPaste]=useState(''),[us,setUs]=useState('Boerderijrecreatie');
 async function load(){try{const r=await fetch('/api/kennisbank',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items)}catch(e){setError(e instanceof Error?e.message:'Laden lukte niet.')}}
 useEffect(()=>{void load()},[]);
 async function run(fn:()=>Promise<{items?:Item[]}|void>){setBusy(true);setError('');try{const d=await fn();if(d&&d.items)setItems(d.items)}catch(e){setError(e instanceof Error?e.message:'Dat lukte niet.')}finally{setBusy(false)}}
 async function importEntries(entries:string[],note:string){
  const parts=chunk(entries);if(!parts.length)throw Error('Er staat niets bruikbaars in dit bestand.');let added=0;
  for(let i=0;i<parts.length;i++){setProgress(`Stuk ${i+1} van ${parts.length} wordt gelezen… (${added} voorstellen)`);added+=(await post({action:'voorstellen',source,note,text:parts[i]})).added}
  setProgress(`Klaar: ${added} voorstellen uit ${parts.length} ${parts.length===1?'stuk':'stukken'}. Keur ze hieronder goed of wijs ze af.`);await load();
 }
 async function onFile(f:File){await run(async()=>{const text=await f.text();
  const entries=source==='trello'?trelloEntries(JSON.parse(text)):/\.csv$/i.test(f.name)||source==='wix'?csvEntries(text):textEntries(text);
  await importEntries(entries,f.name)})}
 // WhatsApp-export(s): .zip of .txt van „Chat exporteren”. Namen worden „Gast” en „Boerderijrecreatie”; alleen de tekst gaat mee, geen media.
 async function onWhatsapp(files:File[]){await run(async()=>{
  const entries:string[]=[],skipped:string[]=[];
  for(const f of files){
   let text='';
   if(/\.zip$/i.test(f.name)){const chat=(await zipEntries(f)).find(e=>/\.txt$/i.test(e.name));if(chat)text=await (await chat.read()).text()}
   else if(/\.txt$/i.test(f.name))text=await f.text();
   const p=parseWhatsappExport(text),ours=pickOurName(p.authors,us);
   if(!ours){skipped.push(`${f.name} (namen in de export: ${p.authors.slice(0,6).join(', ')||'geen berichten gevonden'})`);continue}
   entries.push(...whatsappEntries(p.messages,ours));
  }
  if(skipped.length&&!entries.length)throw Error(`Niet duidelijk wie Boerderijrecreatie is in ${skipped.length===1?'deze export':'deze exports'}: ${skipped.join('; ')}. Vul bij „Naam van Boerderijrecreatie” één van die namen in en kies het bestand opnieuw.`);
  await importEntries(entries,files.length===1?files[0].name:files.length+' WhatsApp-exports');
  if(skipped.length)setProgress(p=>p+` Overgeslagen (niet duidelijk wie Boerderijrecreatie is): ${skipped.join('; ')}.`);
 })}
 const list=(items||[]).filter(i=>!search||(i.title+' '+i.answer).toLowerCase().includes(search.toLowerCase()));
 const proposals=list.filter(i=>i.status==='voorstel'),approved=list.filter(i=>i.status==='goedgekeurd');
 const row=(i:Item)=><div key={i.id} className="task"><div className="task-body"><strong>{i.title}</strong><span style={{whiteSpace:'pre-wrap'}}>{i.answer}</span>
  <span className="small">{kindLabel(i.kind)} · {i.source==='handmatig'?'zelf ingevuld':'uit '+i.source+(i.sourceNote?' ('+i.sourceNote+')':'')}{i.updatedBy?' · '+i.updatedBy:''}</span></div>
  <span className="row" style={{gap:6,flexWrap:'wrap'}}>{i.status==='voorstel'&&<button className="btn sm" disabled={busy} onClick={()=>run(()=>post({action:'status',id:i.id,version:i.version,status:'goedgekeurd'}))}>Goedkeuren</button>}
   <button className="btn secondary sm" disabled={busy} onClick={()=>setDraft({id:i.id,version:i.version,kind:i.kind,title:i.title,answer:i.answer})}>Wijzigen</button>
   <button className="btn secondary sm" disabled={busy} onClick={()=>run(()=>post({action:'status',id:i.id,version:i.version,status:'afgewezen'}))}>{i.status==='voorstel'?'Afwijzen':'Verwijderen'}</button></span></div>;
 return <div data-bb-view="kennisbank">
  <p className="small">Wat hier is goedgekeurd, gebruikt de assistent bij elke gastmail: veelgestelde vragen met jullie antwoord, huisregels en hoe jullie het doen. Prijzen komen niet hier maar uit de producten en offertes. Zet nooit gegevens van gasten in de kennisbank.</p>
  {error&&<p className="mail-error" role="alert">{error}</p>}
  <div className="row section-gap" style={{gap:8,flexWrap:'wrap'}}><button className="btn" disabled={busy} onClick={()=>setDraft({...empty})}>+ Nieuw item</button><input placeholder="Zoeken" value={search} onChange={e=>setSearch(e.target.value)}/>
   <Pill color="green">{approved.length} goedgekeurd</Pill>{proposals.length>0&&<Pill color="orange">{proposals.length} voorstellen</Pill>}</div>
  {draft&&<form className="card section-gap" onSubmit={e=>{e.preventDefault();void run(async()=>{const d=await post({action:'opslaan',item:draft});setDraft(null);return d})}}>
   <div className="form-grid"><label>Soort<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as KbKind})}>{KB_KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label>{draft.kind==='vraag'?'Vraag':'Titel'}<input value={draft.title} maxLength={200} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder={draft.kind==='vraag'?'Mag onze hond mee?':'Kinderfeestje: zo verloopt het'}/></label></div>
   <label>Antwoord<textarea rows={5} maxLength={3000} value={draft.answer} onChange={e=>setDraft({...draft,answer:e.target.value})}/></label>
   <div className="row"><button className="btn" disabled={busy}>Opslaan</button><button type="button" className="btn secondary" onClick={()=>setDraft(null)}>Annuleren</button></div></form>}
  <details className="card section-gap"><summary><b>Geschiedenis uit Trello, Wix of WhatsApp inlezen</b></summary>
   <p className="small">Trello: open het bord → Menu → Afdrukken, exporteren en delen → Exporteren als JSON. Wix: exporteer de berichten of boekingen als CSV. Het bestand wordt in deze browser in stukken gelezen; e-mailadressen en telefoonnummers gaan er eerst uit. De assistent stelt items voor, jullie keuren goed. Het bestand wordt nergens bewaard. Elk stuk kost een AI-aanvraag (een paar cent).</p>
   <div className="row" style={{gap:8,flexWrap:'wrap',alignItems:'center'}}><select aria-label="Bron" value={source} onChange={e=>setSource(e.target.value as typeof source)}><option value="trello">Trello (JSON)</option><option value="wix">Wix (CSV)</option><option value="tekst">Tekst</option><option value="whatsapp">WhatsApp-export (.zip of .txt)</option></select>
    {source==='whatsapp'?<><label className="small">Naam van Boerderijrecreatie in de export <input value={us} onChange={e=>setUs(e.target.value)} style={{width:140}}/></label>
     <input type="file" multiple accept=".zip,.txt,text/plain" disabled={busy||!us.trim()} onChange={e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length)void onWhatsapp(f)}}/></>
    :<input type="file" accept={source==='trello'?'.json,application/json':source==='wix'?'.csv,text/csv':'.txt,.csv,text/plain'} disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void onFile(f)}}/>}</div>
   {source==='whatsapp'&&<p className="small">Kies één of meer exports van „Chat exporteren”. Alleen de tekst gaat naar de assistent, met „Gast” in plaats van de naam en zonder telefoonnummers of e-mailadressen; foto's en spraakberichten niet. Alleen gesprekken waarin Boerderijrecreatie antwoordt, tellen mee. Het bestand wordt nergens bewaard. Wil je de gesprekken ook zelf terugzien bij de klant, gebruik dan <strong>WhatsApp-export importeren</strong> bij Systeem &amp; koppelingen.</p>}
   {source==='tekst'&&<><textarea rows={5} placeholder="Of plak hier tekst, bijvoorbeeld de veelgestelde vragen van de oude website" value={paste} onChange={e=>setPaste(e.target.value)}/><button className="btn secondary sm" disabled={busy||!paste.trim()} onClick={()=>run(async()=>{await importEntries(textEntries(paste),'geplakte tekst');setPaste('')})}>Voorstellen maken</button></>}
   {progress&&<p className="small" role="status">{progress}</p>}</details>
  {!items?<p className="small">Kennisbank laden…</p>:<>
   {proposals.length>0&&<div className="card section-gap"><h3 className="card-title">Voorstellen ({proposals.length})</h3>{proposals.map(row)}</div>}
   <div className="card section-gap"><h3 className="card-title">Goedgekeurd ({approved.length})</h3>{approved.length?approved.map(row):<p className="empty">Nog niets goedgekeurd. Begin met de vragen die jullie het vaakst krijgen.</p>}</div></>}
 </div>;
}
