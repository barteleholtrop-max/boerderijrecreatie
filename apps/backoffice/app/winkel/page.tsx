'use client';
import Link from 'next/link';
import {useState} from 'react';
import {PageHead,Pill,SubTabs,money} from '../ui';
import {useBackoffice,changed} from '../use-backoffice';
// Coöperatieve winkel: ieder product heeft een eigenaar (deelnemer). De omzet gaat bij de weekafsluiting naar hem of haar,
// min het percentage voor de coöperatie (zie /winkel/afrekening). Zelfstandig afrekenen zit bij de kassa.
export default function Winkel(){
 const {products,loading,error}=useBackoffice({products:true}),[query,setQuery]=useState('');
 const [message]=useState('');
 const list=products.filter(r=>r.draft.department==='Winkel'&&r.draft.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.draft.name.localeCompare(b.draft.name,'nl'));
 return <div data-bb-view="shop"><PageHead eyebrow="BOERDERIJWINKEL" title="Winkel" sub="Producten en prijzen komen uit dezelfde centrale productbron als de kassa en de website."><Link className="btn" href="/producten?nieuw=1">＋ Product</Link></PageHead>
  <SubTabs current="/winkel" items={[['/winkel','Assortiment'],['/winkel/zelfkassa','Zelfkassa & QR-stickers']]}/>
  {error&&<div className="message" role="status">{error}</div>}
  {message&&<div className="message" role="status">{message}</div>}
  <div className="grid three"><div className="card" style={{gridColumn:'1/-1'}}><div className="card-head"><h3 className="card-title">Winkelassortiment</h3><Pill>{list.length} producten</Pill></div><input className="input" aria-label="Zoek winkelproduct" placeholder="Zoek in het winkelassortiment…" value={query} onChange={e=>setQuery(e.target.value)} style={{marginBottom:13}}/>
   <div className="stack shop-list">{loading?<div className="empty">Laden…</div>:list.map(r=>{const p=r.draft;return <div className="product-tile" key={r.id}><div className="thumb">{p.photo?<img src={p.photo} alt=""/>:(p.name.match(/\p{L}|\p{N}/u)?.[0]||'✳').toUpperCase()}</div><div className="info"><strong>{p.name}</strong><small>{p.vat?p.vat+'% btw':'Btw nog bepalen'} · {r.published?(changed(r)?'Gepubliceerd, wijziging open':'Gepubliceerd'):'Concept'}{!p.available?' · niet beschikbaar':''}</small></div>
    <span className="price">{money(p.priceCents)}</span><Link className="btn secondary sm" href={'/producten?id='+r.id}>Bewerk</Link></div>})}{!loading&&!list.length&&<div className="empty">Geen winkelproducten gevonden.</div>}</div></div></div>
 </div>
}
