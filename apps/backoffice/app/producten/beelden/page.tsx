'use client';
// Beelden koppelen (wens eigenaar 3 november 2026): foto's en tekeningen uit de beeldbibliotheek bij de juiste producten,
// zo veel mogelijk in één keer. De backoffice stelt voor op naam; jij keurt goed. Daarna desgewenst publiceren.
// Beelden komen in de bibliotheek via de Drive-map (elk uur vanzelf) of via uploaden in het productvenster.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {PageHead,Pill,Notice,money,SubTabs} from '../../ui';
import {PRODUCT_TABS} from '../tabs';
import {FotosLijst} from '../fotos-lijst';
import {suggest,sure,drawingPrompt,driveFileName,type Suggestion} from '@/lib/photo-match';
type P={name:string;department:string;priceCents:number;vat?:string;station?:string;photo?:string;check?:string;sourceCheck?:string};
type Row={id:string;version:number;draft:P;published:P|null};
type Media={id:string;name:string;url:string};
const ready=(p:P)=>['9','21'].includes(String(p.vat))&&['kok','barista','winkel'].includes(String(p.station))&&p.check!=='Prijs controleren'&&p.sourceCheck!=='Prijs controleren';
const missing=(p:P)=>[!['9','21'].includes(String(p.vat))&&'btw',!['kok','barista','winkel'].includes(String(p.station))&&'werkplek',(p.check==='Prijs controleren'||p.sourceCheck==='Prijs controleren')&&'prijs controleren'].filter(Boolean).join(', ');
async function post(body:object){const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Opslaan mislukt.');return d}

export default function Beelden(){
 const [rows,setRows]=useState<Row[]>([]),[media,setMedia]=useState<Media[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [dept,setDept]=useState(''),[publish,setPublish]=useState(true),[choice,setChoice]=useState<Record<string,string>>({}),[showRest,setShowRest]=useState(false);
 const load=useCallback(async()=>{try{const [p,m]=await Promise.all([fetch('/api/products',{cache:'no-store'}).then(r=>r.json()),fetch('/api/media',{cache:'no-store'}).then(r=>r.json())]);setRows(p);setMedia(m)}catch{setMessage('Laden lukte niet. Ververs de pagina.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const without=useMemo(()=>rows.filter(r=>!r.draft.photo&&(!dept||r.draft.department===dept)).sort((a,b)=>a.draft.name.localeCompare(b.draft.name,'nl')),[rows,dept]);
 const advice=useMemo(()=>without.map(r=>({row:r,list:suggest({id:r.id,name:r.draft.name,department:r.draft.department},media)})),[without,media]);
 const withSuggestion=advice.filter(a=>a.list.length).sort((a,b)=>Number(sure(b.list))-Number(sure(a.list))||b.list[0].score-a.list[0].score),sureOnes=withSuggestion.filter(a=>sure(a.list)),none=advice.filter(a=>!a.list.length);
 const depts=[...new Set(rows.map(r=>r.draft.department))].sort();
 const picked=(a:{row:Row;list:Suggestion[]})=>choice[a.row.id]??a.list[0].mediaId;

 async function link(items:{row:Row;mediaId:string}[]){
  if(!items.length||busy)return;setBusy(true);setMessage('');
  try{
   const d=await post({action:'set-photo',changes:items.map(i=>({id:i.row.id,version:i.row.version,photo:'/api/media/'+i.mediaId}))}) as {versions:Record<string,number>;message:string};
   let extra='';
   if(publish){
    const toPublish=items.filter(i=>d.versions[i.row.id]&&!i.row.published&&ready(i.row.draft));
    const notReady=items.filter(i=>d.versions[i.row.id]&&!i.row.published&&!ready(i.row.draft));
    if(toPublish.length){const r=await post({action:'apply-advice',changes:toPublish.map(i=>({id:i.row.id,version:d.versions[i.row.id],publish:true}))}) as {published:number};extra+=` ${r.published} meteen gepubliceerd.`}
    if(notReady.length)extra+=` ${notReady.length} nog niet gepubliceerd (eerst btw, werkplek of prijs aanvullen bij Prijzen & verkoopklaar).`;
   }
   setMessage(d.message+extra);await load();
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function copy(text:string,what:string){try{await navigator.clipboard.writeText(text);setMessage(what+' gekopieerd.')}catch{setMessage(text)}}
 const thumb=(id:string)=>media.find(m=>m.id===id)?.url;

 return <div data-bb-view="product-images">
  <PageHead eyebrow="GERECHTEN & PRIJZEN" title="Beelden & foto's" sub="Foto's en tekeningen uit de beeldbibliotheek bij de juiste producten, zoveel mogelijk in één keer, en zelf een foto maken of kiezen. De backoffice stelt voor op naam, jij keurt goed."><a className="btn" href="#fotos">📷 Foto's maken of kiezen</a></PageHead><SubTabs current="/producten/beelden" items={PRODUCT_TABS}/>
  {message&&<div className="message" role="status">{message}</div>}
  <div className="card"><div className="row" style={{flexWrap:'wrap',gap:10}}>
   <Pill>{without.length} zonder beeld</Pill><Pill color="green">{sureOnes.length} zeker voorstel</Pill><Pill color="orange">{withSuggestion.length-sureOnes.length} even kiezen</Pill><Pill>{none.length} nog geen beeld gevonden</Pill><Pill color="blue">{media.length} beelden in de bibliotheek</Pill>
   <select aria-label="Afdeling" value={dept} onChange={e=>setDept(e.target.value)}><option value="">Alle afdelingen</option>{depts.map(d=><option key={d}>{d}</option>)}</select>
   <label className="checkline"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Daarna publiceren als het product verkoopklaar is</label>
   <button className="btn" disabled={busy||!sureOnes.length} onClick={()=>link(sureOnes.map(a=>({row:a.row,mediaId:a.list[0].mediaId})))}>{busy?'Bezig…':`Alle zekere koppelen (${sureOnes.length})`}</button>
  </div></div>
  {loading?<div className="empty">Laden…</div>:<>
   <div className="card section-gap"><div className="card-head"><h3 className="card-title">Voorstellen</h3><span className="small">Tik op een ander beeld om te kiezen</span></div>
    {!withSuggestion.length?<div className="empty">Geen voorstellen. Zet foto&apos;s of tekeningen met de productnaam als bestandsnaam in de Drive-map; ze komen elk uur vanzelf binnen.</div>:
    <div className="stack">{withSuggestion.map(a=>{const p=a.row.draft,pick=picked(a);return <div key={a.row.id} className="product-tile" style={{alignItems:'flex-start'}}>
     <div className="info"><strong>{p.name}</strong><small>{p.department} · {money(p.priceCents)} · {a.row.published?'gepubliceerd':ready(p)?'concept, verkoopklaar':'concept, mist: '+missing(p)}</small>{sure(a.list)&&<Pill color="green">zeker</Pill>}</div>
     <div className="row" style={{gap:8,flexWrap:'wrap'}}>{a.list.map(s=><button key={s.mediaId} onClick={()=>setChoice({...choice,[a.row.id]:s.mediaId})} aria-pressed={s.mediaId===pick} title={s.name} style={{border:s.mediaId===pick?'3px solid var(--green)':'1px solid var(--border)',borderRadius:10,padding:2,background:'#fff',cursor:'pointer'}}>
      <img src={thumb(s.mediaId)} alt={s.name} width={72} height={72} style={{objectFit:'cover',borderRadius:8,display:'block'}}/><small style={{display:'block',maxWidth:76,fontSize:10}}>{s.drawing?'tekening':'foto'} · {Math.round(s.score*100)}%</small></button>)}</div>
     <button className="btn sm" disabled={busy} onClick={()=>link([{row:a.row,mediaId:pick}])}>Koppelen</button>
    </div>})}</div>}
   </div>
   <div className="card section-gap"><div className="card-head"><h3 className="card-title">Nog geen beeld gevonden ({none.length})</h3><button className="btn sm secondary" onClick={()=>setShowRest(!showRest)}>{showRest?'Verbergen':'Tonen'}</button></div>
    <p className="small">Voor deze producten staat er nog niets passends in de bibliotheek. Maak een foto (winkel) of laat een tekening in stijl 4 maken (menukaart), en zet die in de Drive-map met de voorgestelde bestandsnaam. Binnen een uur komt hij binnen en staat hij hierboven als voorstel.</p>
    {showRest&&<div className="table-wrap"><table><thead><tr><th>Product</th><th>Bestandsnaam voor Drive</th><th></th></tr></thead><tbody>{none.map(a=>{const p=a.row.draft,drawing=p.department.toLowerCase()!=='winkel',file=driveFileName(p.name,drawing);return <tr key={a.row.id}>
     <td><strong>{p.name}</strong><div className="small">{p.department}</div></td><td className="small"><code>{file}.jpg</code></td>
     <td><div className="action-row"><button className="btn sm secondary" onClick={()=>copy(file,'Bestandsnaam')}>Naam kopiëren</button>{drawing&&<button className="btn sm secondary" onClick={()=>copy(drawingPrompt(p.name),'Tekening-opdracht')}>Tekening-opdracht kopiëren</button>}<Link className="btn sm secondary" href={'/producten?id='+a.row.id}>Zelf kiezen</Link></div></td></tr>})}</tbody></table></div>}
   </div>
   <div className="section-gap"><Notice kind="info" title="Hoe het werkt">De backoffice vergelijkt de woorden van de productnaam met de naam van elk beeld (fles, flesje en dergelijke tellen niet mee). Een tekening gaat voor bij het restaurant, een foto bij de winkel. Er wordt niets vanzelf gekoppeld: jij keurt goed. Publiceren gebeurt alleen bij producten die verkoopklaar zijn (btw, werkplek en gecontroleerde prijs); de rest vul je aan bij Prijzen &amp; verkoopklaar.</Notice></div>
  </>}
  <section className="card section-gap"><FotosLijst embedded/></section>
 </div>;
}
