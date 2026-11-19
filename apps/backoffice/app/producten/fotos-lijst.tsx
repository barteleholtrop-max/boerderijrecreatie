'use client';
// Foto's, sinds 16 november 2026 (nieuwe indeling stap 5) onderdeel van het tabblad Beelden & foto's; /producten/fotos stuurt door.
// Foto's (wens eigenaar 9 november 2026: „maak iets waarmee we super makkelijk foto's kunnen uploaden”). Gemaakt voor de telefoon:
// tik op een product, maak of kies een foto, klaar. De telefoon maakt de foto kleiner (lib/photo-upload.ts), zet hem in de
// beeldbank (/api/media) en koppelt hem aan het product (set-photo in /api/products). Staat het product gepubliceerd, dan ziet de
// gast de foto binnen een minuut in de bestelapp. Op de computer kun je een foto ook op een product slepen.
// Een foto waarvan het bestand ontbreekt (niet meegekomen bij de overstap naar Supabase), telt als „zonder foto”.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {PageHead,Pill} from '../ui';
import {fitSize,pickUpload,MAX_SIDE,JPEG_QUALITY} from '@/lib/photo-upload';
type P={name:string;department:string;photo?:string};
type Row={id:string;version:number;draft:P;published:P|null};
type Status={kind:'busy'|'done'|'error';text:string};

async function shrink(file:File):Promise<Blob>{
 // Verkleinen in de browser; lukt dat niet (bijvoorbeeld een HEIC-bestand op de computer), dan gaat het origineel.
 try{
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'} as ImageBitmapOptions);
  const size=fitSize(bitmap.width,bitmap.height),needs=size.width<bitmap.width;
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext('2d');if(!ctx)return file;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(bitmap,0,0,size.width,size.height);bitmap.close?.();
  const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',JPEG_QUALITY));
  return pickUpload(file,blob,needs)==='resized'&&blob?blob:file;
 }catch{return file}
}

export function FotosLijst({embedded=false}:{embedded?:boolean}){
 const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [filter,setFilter]=useState<'zonder'|'alle'>('zonder'),[dept,setDept]=useState(''),[query,setQuery]=useState('');
 const [status,setStatus]=useState<Record<string,Status>>({}),[broken,setBroken]=useState<Set<string>>(new Set()),[over,setOver]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/products',{cache:'no-store'});if(!r.ok)throw Error();setRows(await r.json() as Row[])}catch{setError('De producten konden niet worden geladen. Ververs de pagina.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);

 const hasPhoto=(r:Row)=>!!r.draft.photo&&!broken.has(r.id);
 const depts=useMemo(()=>[...new Set(rows.map(r=>r.draft.department))].sort((a,b)=>a.localeCompare(b,'nl')),[rows]);
 const shown=useMemo(()=>{const q=query.trim().toLowerCase();return rows
  .filter(r=>(!dept||r.draft.department===dept)&&(!q||r.draft.name.toLowerCase().includes(q))&&(filter==='alle'||!hasPhoto(r)||status[r.id]?.kind==='done'))
  .sort((a,b)=>Number(!!b.published)-Number(!!a.published)||a.draft.name.localeCompare(b.draft.name,'nl'))},[rows,dept,query,filter,broken,status]); // eslint-disable-line react-hooks/exhaustive-deps
 const without=rows.filter(r=>!hasPhoto(r)).length;

 async function upload(row:Row,file:File){
  if(!file.type.startsWith('image/')&&!/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)){setStatus(s=>({...s,[row.id]:{kind:'error',text:'Dit is geen foto.'}}));return}
  setStatus(s=>({...s,[row.id]:{kind:'busy',text:'Foto verkleinen…'}}));
  try{
   const blob=await shrink(file);
   setStatus(s=>({...s,[row.id]:{kind:'busy',text:'Uploaden…'}}));
   const form=new FormData();form.set('file',new File([blob],row.draft.name.replace(/[^\p{L}\p{N} -]/gu,'').trim()+'.jpg',{type:blob.type||'image/jpeg'}));form.set('name',row.draft.name);
   const up=await fetch('/api/media',{method:'POST',body:form});const m=await up.json().catch(()=>({})) as {id?:string;error?:string};
   if(!up.ok||!m.id)throw Error(m.error||'Uploaden is niet gelukt. Probeer het opnieuw.');
   const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'set-photo',changes:[{id:row.id,version:row.version,photo:'/api/media/'+m.id}]})});
   const d=await r.json().catch(()=>({})) as {versions?:Record<string,number>;skipped?:{reason:string}[];error?:string};
   if(!r.ok)throw Error(d.error||'Koppelen is niet gelukt.');
   if(!d.versions?.[row.id])throw Error((d.skipped?.[0]?.reason||'Koppelen is niet gelukt.')+' De foto staat wel in de beeldbank.');
   const photo='/api/media/'+m.id,version=d.versions[row.id];
   setRows(list=>list.map(x=>x.id===row.id?{...x,version,draft:{...x.draft,photo},published:x.published?{...x.published,photo}:null}:x));
   setBroken(b=>{const n=new Set(b);n.delete(row.id);return n});
   setStatus(s=>({...s,[row.id]:{kind:'done',text:row.published?'Opgeslagen · gasten zien hem binnen een minuut':'Opgeslagen · product is nog niet gepubliceerd'}}));
  }catch(e){setStatus(s=>({...s,[row.id]:{kind:'error',text:(e as Error).message}}))}
 }

 return <div data-bb-view="product-photos">
  {embedded?<><h2 id="fotos">Foto's maken of kiezen</h2><p className="small">Tik op een product en maak of kies een foto. Hij staat meteen bij het product; is het product gepubliceerd, dan ziet de gast hem in de bestelapp.</p></>:<PageHead eyebrow="PRODUCTEN & PRIJZEN" title="Foto's" sub="Tik op een product en maak of kies een foto. Hij staat meteen bij het product; is het product gepubliceerd, dan ziet de gast hem in de bestelapp.">
   <Link className="btn secondary" href="/producten">← Gerechten & prijzen</Link>
  </PageHead>}
  {error&&<div className="message" role="alert">{error}</div>}
  <div className="card fotos-filters">
   <div className="fotos-chips" role="group" aria-label="Welke producten">
    <button type="button" className={'tab'+(filter==='zonder'?' active':'')} aria-pressed={filter==='zonder'} onClick={()=>setFilter('zonder')}>Zonder foto <Pill color="orange">{loading?'…':without}</Pill></button>
    <button type="button" className={'tab'+(filter==='alle'?' active':'')} aria-pressed={filter==='alle'} onClick={()=>setFilter('alle')}>Alle producten <Pill>{loading?'…':rows.length}</Pill></button>
   </div>
   <input className="input" type="search" placeholder="Zoek product…" aria-label="Zoek product" value={query} onChange={e=>setQuery(e.target.value)}/>
   <select className="input" aria-label="Afdeling" value={dept} onChange={e=>setDept(e.target.value)}><option value="">Alle afdelingen</option>{depts.map(d=><option key={d}>{d}</option>)}</select>
  </div>
  {loading?<div className="empty">Laden…</div>:!shown.length?<div className="empty">{filter==='zonder'?'Alle producten hebben een foto. 🎉':'Geen producten gevonden.'}</div>:
  <div className="fotos-grid">{shown.map(r=>{const st=status[r.id],photo=hasPhoto(r)?r.draft.photo:null;return <label key={r.id}
    className={'foto-tegel'+(over===r.id?' over':'')+(st?.kind==='busy'?' bezig':'')}
    onDragOver={e=>{e.preventDefault();setOver(r.id)}} onDragLeave={()=>setOver('')}
    onDrop={e=>{e.preventDefault();setOver('');const f=e.dataTransfer.files[0];if(f)void upload(r,f)}}>
   <input type="file" accept="image/*" className="foto-input" disabled={st?.kind==='busy'} aria-label={`Foto maken of kiezen voor ${r.draft.name}`}
    onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(r,f)}}/>
   <span className="foto-beeld">
    {photo?<img src={photo} alt="" loading="lazy" onError={()=>setBroken(b=>new Set(b).add(r.id))}/>
     :<span className="foto-leeg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>{broken.has(r.id)?'Foto ontbreekt':'Foto maken'}</span>}
    {st?.kind==='busy'&&<span className="foto-bezig" aria-hidden="true"/>}
   </span>
   <span className="foto-naam">{r.draft.name}</span>
   <span className="small">{r.draft.department}{r.published?'':' · concept'}</span>
   {st&&<span className={'foto-status '+st.kind} role={st.kind==='error'?'alert':'status'}>{st.kind==='done'?'✓ ':''}{st.text}</span>}
   {photo&&!st&&<span className="small foto-vervang">Tik om te vervangen</span>}
  </label>})}</div>}
  <p className="small section-gap">De foto wordt op je telefoon eerst verkleind (lange kant hooguit {MAX_SIDE} pixels), zodat uploaden snel gaat. Hij komt ook in de beeldbank, zodat je hem bij Beelden koppelen of in het productvenster opnieuw kunt kiezen.</p>
 </div>;
}
