'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {PageHead,Pill,SubTabs,money} from '../ui';
import {useBackoffice,changed} from '../use-backoffice';
// Coöperatieve winkel: ieder product heeft een eigenaar (deelnemer). De omzet gaat bij de weekafsluiting naar hem of haar,
// min het percentage voor de coöperatie (zie /winkel/afrekening). Zelfstandig afrekenen zit bij de kassa.
type Person={id:string;name:string;active:boolean};
export default function Winkel(){
 const {products,loading,error}=useBackoffice({products:true}),[query,setQuery]=useState('');
 const [people,setPeople]=useState<Person[]>([]),[owners,setOwners]=useState<Record<string,string|null>>({}),[message,setMessage]=useState(''),[saving,setSaving]=useState('');
 useEffect(()=>{fetch('/api/cooperatie',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(d.error)throw Error(d.error);setPeople(d.participants);setOwners(d.owners)}).catch(e=>setMessage((e as Error).message))},[]);
 async function owner(productId:string,participantId:string|null,name:string){
  setSaving(productId);setMessage('');
  try{const r=await fetch('/api/cooperatie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'eigenaar',productId,participantId})});const d=await r.json();if(!r.ok)throw Error(d.error||'Opslaan mislukt.');
   setOwners(o=>({...o,[productId]:participantId}));setMessage(`${name}: omzet gaat voortaan naar ${participantId?people.find(p=>p.id===participantId)?.name:'de coöperatie'}. Eerdere verkopen blijven bij de vorige eigenaar.`)}
  catch(e){setMessage((e as Error).message)}finally{setSaving('')}
 }
 const list=products.filter(r=>r.draft.department==='Winkel'&&r.draft.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.draft.name.localeCompare(b.draft.name,'nl'));
 const all=products.filter(r=>r.draft.department==='Winkel'),without=all.filter(r=>!owners[r.id]).length;
 return <div data-bb-view="shop"><PageHead eyebrow="BOERDERIJWINKEL" title="Coöperatieve winkel" sub="Producten en prijzen komen uit dezelfde centrale productbron als de kassa en de website. Per product kies je wie de omzet krijgt."><Link className="btn" href="/producten?nieuw=1">＋ Product</Link></PageHead>
  <SubTabs current="/winkel" items={[['/winkel','Assortiment & eigenaren'],['/winkel/zelfkassa','Zelfkassa & QR-stickers']]}/>
  {error&&<div className="message" role="status">{error}</div>}
  {message&&<div className="message" role="status">{message}</div>}
  <div className="grid three"><div className="card" style={{gridColumn:'span 2'}}><div className="card-head"><h3 className="card-title">Winkelassortiment</h3><Pill>{list.length} producten</Pill></div><input className="input" aria-label="Zoek winkelproduct" placeholder="Zoek in het winkelassortiment…" value={query} onChange={e=>setQuery(e.target.value)} style={{marginBottom:13}}/>
   <div className="stack shop-list">{loading?<div className="empty">Laden…</div>:list.map(r=>{const p=r.draft;return <div className="product-tile" key={r.id}><div className="thumb">{p.photo?<img src={p.photo} alt=""/>:(p.name.match(/\p{L}|\p{N}/u)?.[0]||'✳').toUpperCase()}</div><div className="info"><strong>{p.name}</strong><small>{p.vat?p.vat+'% btw':'Btw nog bepalen'} · {r.published?(changed(r)?'Gepubliceerd, wijziging open':'Gepubliceerd'):'Concept'}{!p.available?' · niet beschikbaar':''}</small></div>
    <select aria-label={'Eigenaar van '+p.name} value={owners[r.id]||''} disabled={saving===r.id} onChange={e=>owner(r.id,e.target.value||null,p.name)} style={{maxWidth:170}}><option value="">Coöperatie</option>{people.filter(x=>x.active||x.id===owners[r.id]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <span className="price">{money(p.priceCents)}</span><Link className="btn secondary sm" href={'/producten?id='+r.id}>Bewerk</Link></div>})}{!loading&&!list.length&&<div className="empty">Geen winkelproducten gevonden.</div>}</div></div>
   <div className="card"><h3 className="card-title">Coöperatie</h3><p className="small">Ieder product heeft een eigenaar: bijvoorbeeld bloemen van Bindert, brood van Rianne, kaas van Karst Jan en groenten van Yne Sinne Farm. Op maandag rekent de backoffice de omzet van vorige week per deelnemer af, min het percentage voor de coöperatie (over de omzet exclusief btw).</p>
    <p className="small"><b>{people.filter(p=>p.active).length}</b> deelnemers · <b>{without}</b> van de {all.length} producten zonder eigenaar (omzet blijft bij de coöperatie).</p>
    <Link className="btn" href="/financien/weekafsluiting">Deelnemers & weekafsluiting</Link>
    <div className="divider"></div><h3 className="card-title">Abonnementen</h3><p className="small">Beheer oogstaandelen, extra’s, kindertarieven, aanbiedingen, inschrijvingen en afhalen.</p><Link className="btn" href="/abonnementen">Abonnementen beheren</Link></div></div>
 </div>
}
