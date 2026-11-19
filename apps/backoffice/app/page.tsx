'use client';
import Link from 'next/link';
import {PageHead,Kpi,Pill,Notice,money} from './ui';
import {useBackoffice,productAttention,amsterdamDay,changed} from './use-backoffice';
import {useGuests} from './use-guests';
import {DayList,Totals,Kinds} from './planning/overview';
import {overviewDay} from '@/lib/guest-overview';
import {StartschermVraag} from './startscherm-vraag';
import {TakenKaarten} from './taken/kaarten';
import {MagazijnMeldingen} from './magazijn-meldingen';
const days=['zo','ma','di','wo','do','vr','za'];
export default function Dashboard(){
 const {products,orders,ops,loading,error}=useBackoffice({products:true,orders:true,operations:true});
 const guests=useGuests();
 const today=ops?.today||amsterdamDay(new Date().toISOString());
 const week=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);const key=d.toISOString().slice(0,10);return {key,label:days[d.getUTCDay()],cents:orders.filter(o=>o.counted&&amsterdamDay(o.created)===key).reduce((s,o)=>s+o.paidCents,0)}});
 const max=Math.max(1,...week.map(w=>w.cents)),todayOrders=orders.filter(o=>amsterdamDay(o.created)===today);
 const attention=productAttention(products).filter(a=>a.count>0),low=(ops?.state.ingredients||[]).filter(i=>i.known&&i.stock<i.min);
 const pending=products.filter(changed).length+(ops?.state.invoices.filter(i=>!i.reviewed).length||0)+(ops?.state.recipes.filter(r=>!r.reviewed).length||0);
 return <div data-bb-view="dashboard"><PageHead eyebrow="GOEDEMORGEN" title="Alles wat vandaag belangrijk is" sub="Eén overzicht van producten, bestellingen, voorraad en beslissingen — rechtstreeks uit de centrale backoffice."><Link className="btn secondary" href="/planning">Agenda’s & openingstijden</Link><Link className="btn secondary" href="/kassa">＋ Bestelling opnemen</Link><Link className="btn" href="/producten?nieuw=1">＋ Product toevoegen</Link></PageHead>
  {/* Backoffice op het startscherm (wens eigenaar 13 november 2026), net als ledenapp en managementapp. */}
  <StartschermVraag naam="Backoffice" altijd/>
  {error&&<div className="message" role="status">{error}</div>}
  <div className="notice"><span style={{fontSize:20}}>✦</span><div><strong>{loading?'Gegevens laden…':`${attention.length+(low.length?1:0)} aandachtspunten uit de centrale gegevens`}</strong>Productcontrole, voorraad onder minimum en wijzigingen die op jouw akkoord wachten. Voorstellen worden nooit stilzwijgend uitgevoerd. <Link className="copylink" href="/goedkeuringen">Bekijk wat op akkoord wacht →</Link></div></div>
  {guests.data&&(()=>{const day=overviewDay(guests.data.state,today,guests.data.signups||[]);return <div className="card section-gap" data-bb-view="farm-today"><div className="card-head"><div><h3 className="card-title">Vandaag op de boerderij</h3><Totals day={day}/><Kinds day={day}/></div><Link className="btn secondary sm" href="/planning">Week bekijken</Link></div><DayList day={day} href={i=>i.kind==='evenement'?'/planning':'/planning?reservering='+encodeURIComponent(i.id)} pickupsHref="/winkel"/></div>})()}
  <div className="grid four section-gap"><Kpi label="Producten in de centrale lijst" value={loading?'…':products.length} foot={`${products.filter(p=>p.published).length} gepubliceerd voor gasten`} icon="◉" href="/producten"/><Kpi label="Bestellingen vandaag" value={loading?'…':todayOrders.length} foot={money(todayOrders.filter(o=>o.counted).reduce((s,o)=>s+o.paidCents,0))+' omzet incl. btw'+(todayOrders.some(o=>!o.counted)?` · ${todayOrders.filter(o=>!o.counted).length} wacht op betaling`:'')} icon="€" href="/werkplekken"/><Kpi label="Wacht op akkoord" value={loading?'…':pending} foot="Productwijzigingen, facturen en recepten" icon="✓" href="/goedkeuringen"/><Kpi label="Voorraad onder minimum" value={loading?'…':low.length} foot="Getelde ingrediënten" icon="▥" href="/inkoop"/></div>
  <div className="grid two section-gap"><div className="card"><div className="card-head"><h3 className="card-title">Bestellingen · laatste zeven dagen</h3><Link className="btn secondary sm" href="/financien">Financiën bekijken</Link></div><div className="weekbars">{week.map((w,i)=><div key={w.key} className={'barcol'+(i===6?' today':'')} title={money(w.cents)}><div className="bartrack"><div className="barfill" style={{height:Math.round(w.cents/max*100)+'%'}}></div></div><div className="barlabel">{w.label}</div></div>)}</div><div className="small" style={{marginTop:12}}>Omzet incl. btw uit vastgelegde proefbestellingen · geen prognose en geen echte betalingen</div></div>
   <div className="card"><div className="card-head"><h3 className="card-title">Productcontrole</h3><Link className="btn secondary sm" href="/producten">Alle producten</Link></div><div className="stack">{attention.length?attention.map(a=><div className="task" key={a.key}><div className="task-dot">!</div><div className="task-body"><strong>{a.label}</strong><span>{a.hint}</span></div><Pill color="orange">{a.count}</Pill><Link className="btn secondary sm" href={'/producten?filter='+a.key}>Bekijken</Link></div>):<div className="empty">{loading?'Laden…':'Alle producten zijn gecontroleerd ✓'}</div>}</div></div></div>
  <div className="grid two section-gap"><TakenKaarten/><MagazijnMeldingen/>
   <div className="card"><div className="card-head"><h3 className="card-title">Snelle acties</h3></div><div className="grid two">{[['＋','Product toevoegen','/producten?nieuw=1'],['▤','Kassa openen','/kassa'],['▥','Factuur inlezen','/inkoop'],['⚙','Spreadsheet verversen','/koppeling'],['✆','Managementapp (telefoon)','/management/gesprekken']].map(([icon,label,href])=><Link className="product-tile" key={href} href={href}><span className="task-dot">{icon}</span><span style={{fontWeight:700,fontSize:12}}>{label}</span></Link>)}</div><div className="section-gap"><Notice kind="info" title="Ontwerpprincipe">Prijzen, producten en bestellingen worden centraal beheerd. Elke module, ook de website, gebruikt dezelfde gegevens.</Notice></div></div></div>
 </div>
}
