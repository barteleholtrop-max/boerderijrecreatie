'use client';
// Bedrijfsgegevens → Officiële documenten (wens eigenaar 6 november 2026): akte, reglement, KvK-uittreksel en dergelijke als PDF.
// Met „Beschikbaar voor leden?” staan ze op elke ledenpagina (Gegevens → Documenten van de coöperatie). Opslag in lib/coop-documents.ts.
// Eén verzameling (16 november 2026): met „Op de Bloeimarkt?” staan ze ook openbaar op de Bloeimarkt; Bloei houdt de persoonlijke overeenkomsten.
import {useCallback,useEffect,useRef,useState} from 'react';
type Doc={id:string;title:string;categoryLabel:string;version:string;forMembers:boolean;forMarket:boolean;fileName:string;size:number;uploaded:string};
const day=(iso:string)=>new Date(iso).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
const kb=(n:number)=>n>=1048576?(n/1048576).toLocaleString('nl-NL',{maximumFractionDigits:1})+' MB':Math.max(1,Math.round(n/1024))+' kB';
export function OfficieleDocumenten({can}:{can:boolean}){
 const [docs,setDocs]=useState<Doc[]|null>(null),[cats,setCats]=useState<[string,string][]>([]),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const form=useRef<HTMLFormElement>(null);
 const load=useCallback(async()=>{const r=await fetch('/api/coop-documenten',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setErr(d.error||'Laden mislukt.');return}setDocs(d.documents);setCats(d.categories)},[]);
 useEffect(()=>{void load()},[load]);
 async function send(init:RequestInit,ok:string){setBusy(true);setMsg('');setErr('');
  try{const r=await fetch('/api/coop-documenten',{method:'POST',...init});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Opslaan mislukt.');setDocs(d.documents);setMsg(ok);return true}
  catch(e){setErr((e as Error).message);return false}finally{setBusy(false)}}
 async function upload(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);if(f.get('forMembers')!=='on')f.delete('forMembers');
  if(await send({body:f},'Document toegevoegd.'))form.current?.reset()}
 const json=(b:object)=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 return <section className="card section-gap" id="officiele-documenten" data-bb-view="officiele-documenten"><h2>Officiële documenten</h2>
  <p className="small">Eén verzameling: akte, reglement, KvK-uittreksel, AFM-informatie en voorwaarden, als PDF. Vink „Beschikbaar voor leden?” aan voor elke ledenpagina, en „Op de Bloeimarkt?” om het openbaar op de Bloeimarkt te zetten. Persoonlijke overeenkomsten staan bij Bloei → Documenten.</p>
  {msg&&<p className="small" role="status">{msg}</p>}{err&&<p className="notice warn" role="alert">{err}</p>}
  {docs&&(docs.length?<div className="table-wrap"><table><thead><tr><th>Document</th><th>Soort</th><th>Versie</th><th>Toegevoegd</th><th>Beschikbaar voor leden?</th><th>Op de Bloeimarkt?</th><th></th></tr></thead><tbody>
   {docs.map(d=><tr key={d.id}><td><a href={'/api/coop-documenten?id='+d.id}>{d.title}</a> <span className="small">{kb(d.size)}</span></td><td>{d.categoryLabel}</td><td className="small">{d.version}</td><td className="small">{day(d.uploaded)}</td>
    <td><label className="guest-check"><input type="checkbox" checked={d.forMembers} disabled={busy||!can} onChange={e=>void send(json({action:'leden',id:d.id,on:e.target.checked}),e.target.checked?'Staat nu op de ledenpagina.':'Staat niet meer op de ledenpagina.')}/>{d.forMembers?'Ja':'Nee'}</label></td>
    <td><label className="guest-check"><input type="checkbox" checked={d.forMarket} disabled={busy||!can} onChange={e=>{const on=e.target.checked;if(on&&!window.confirm(`„${d.title}” openbaar op de Bloeimarkt zetten? Iedereen kan het dan downloaden.`))return;void send(json({action:'markt',id:d.id,on,confirm:on}),on?'Staat nu openbaar op de Bloeimarkt.':'Staat niet meer op de Bloeimarkt.')}}/> Openbaar</label></td>
    <td><button type="button" className="btn secondary sm" disabled={busy||!can} onClick={()=>void send(json({action:'verwijderen',id:d.id}),'Document verwijderd.')}>Verwijderen</button></td></tr>)}</tbody></table></div>
   :<p className="small">Nog geen documenten.</p>)}
  {can&&<form ref={form} className="guest-form" onSubmit={upload} style={{alignItems:'end'}}>
   <label>Naam<input name="title" required maxLength={160} placeholder="Akte van oprichting"/></label>
   <label>Soort<select name="category" required defaultValue=""><option value="" disabled>Kies…</option>{cats.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label>Versie of datum<input name="version" maxLength={80} placeholder="12 juni 2023"/></label>
   <label>PDF (max. 8 MB)<input name="file" type="file" accept="application/pdf,.pdf" required/></label>
   <label className="guest-check"><input type="checkbox" name="forMembers"/>Beschikbaar voor leden?</label>
   <button className="btn" disabled={busy}>{busy?'Bezig…':'Document toevoegen'}</button>
  </form>}
 </section>;
}
