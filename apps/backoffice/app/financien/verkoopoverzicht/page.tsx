'use client';
import {useEffect,useState} from 'react';
import {money} from '../../ui';
import {useOmgeving} from '../../omgeving';
import {salesOverview,overviewNumber,type OverviewOrder} from '@/lib/sales-overview';
// Verkoopoverzicht als document (wens eigenaar 4 november 2026): wat er in een periode verkocht is, met de uitstraling van
// een factuur. Downloaden = afdrukken als PDF. De bedrijfsgegevens komen uit Bedrijfsgegevens, de cijfers uit
// dezelfde omzetregel als Financiën. Zonder backofficemenu, zodat het afdrukt als één nette pagina.
type Contact={tradeName?:string;phone?:string;email?:string;street?:string;postalCode?:string;city?:string;kvk?:string;vatNumber?:string};
const longDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const shortDay=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const valid=(v:string|null)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';
export default function Verkoopoverzicht(){
 const omgeving=useOmgeving();
 const [period,setPeriod]=useState<{van:string;tot:string}|null>(null),[orders,setOrders]=useState<OverviewOrder[]|null>(null),[contact,setContact]=useState<Contact>({}),[error,setError]=useState('');
 useEffect(()=>{
  const q=new URLSearchParams(location.search),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
  const van=valid(q.get('van'))||today,tot=valid(q.get('tot'))||van;setPeriod({van,tot});document.title=overviewNumber(van,tot)+' · Verkoopoverzicht Boer Bart';
  fetch('/api/orders?van='+van+'&tot='+tot,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Laden mislukt.');setOrders(d)}).catch(e=>setError(e instanceof Error?e.message:'Laden mislukt.'));
  fetch('/api/bedrijfsgegevens',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d?.company&&setContact(d.company)).catch(()=>{});
 },[]);
 if(!period)return null;
 const o=orders?salesOverview(orders):null,made=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date());
 const address=[contact.street,[contact.postalCode,contact.city].filter(Boolean).join(' ')].filter(Boolean);
 return <div className="sales-doc-page" data-bb-view="sales-overview">
  <div className="sales-doc-bar no-print"><a className="btn secondary" href="/financien">← Terug naar Financiën</a><button className="btn" disabled={!o} onClick={()=>print()}>Download als PDF</button><span className="small">Kies bij het afdrukken „Opslaan als PDF”.</span></div>
  {error&&<div className="message no-print" role="alert">{error}</div>}
  <article className="sales-doc">
   <header className="sales-doc-head"><div><div className="sales-doc-brand">{contact.tradeName||'Boer Bart'}</div>{address.map(a=><div key={a}>{a}</div>)}{contact.phone&&<div>{contact.phone}</div>}{contact.email&&<div>{contact.email}</div>}{contact.kvk&&<div>KvK {contact.kvk}</div>}{contact.vatNumber&&<div>Btw {contact.vatNumber}</div>}</div>
    <div className="sales-doc-meta"><h1>Verkoopoverzicht</h1><dl><dt>Nummer</dt><dd>{overviewNumber(period.van,period.tot)}</dd><dt>Periode</dt><dd>{period.van===period.tot?longDate(period.van):longDate(period.van)+' t/m '+longDate(period.tot)}</dd><dt>Gemaakt op</dt><dd>{made}</dd><dt>Bestellingen</dt><dd>{o?o.orders:'…'}</dd></dl></div></header>
   {!o?<p>Overzicht laden…</p>:<>
    <table className="sales-doc-table"><thead><tr><th>Omschrijving</th><th>Betaald met</th><th className="num">Aantal</th><th className="num">Btw</th><th className="num">Excl. btw</th><th className="num">Btw-bedrag</th><th className="num">Incl. btw</th></tr></thead>
     <tbody>{o.products.length?o.products.map(p=><tr key={p.name+p.vat+p.paidWith}><td>{p.name}</td><td className="sales-doc-paid">{p.paidWith}</td><td className="num">{p.quantity}</td><td className="num">{p.vat}%</td><td className="num">{money(p.exclCents)}</td><td className="num">{money(p.vatCents)}</td><td className="num">{money(p.inclCents)}</td></tr>):<tr><td colSpan={7} className="sales-doc-empty">Geen verkopen in deze periode.</td></tr>}</tbody></table>
    <div className="sales-doc-totals"><div><span>Totaal excl. btw</span><b>{money(o.total.exclCents)}</b></div>{o.vat.map(v=><div key={v.rate}><span>Btw {v.rate}% over {money(v.exclCents)}</span><b>{money(v.vatCents)}</b></div>)}<div className="grand"><span>Totaal incl. btw</span><b>{money(o.total.inclCents)}</b></div>
     {/* Per betaalwijze (wens eigenaar 12 november 2026): samen precies het totaal incl. btw. */}
     {o.methods.length>0&&<div className="sales-doc-methods">{o.methods.map(m=><div key={m.method}><span>waarvan {m.name} <small>({m.orders} best.)</small></span><b>{money(m.inclCents)}</b></div>)}</div>}</div>
    <div className="sales-doc-split">
     {o.days.length>1&&<section><h2>Per dag</h2><table className="sales-doc-table small"><tbody>{o.days.map(d=><tr key={d.date}><td>{shortDay(d.date)}</td><td className="num">{d.orders} best.</td><td className="num">{money(d.inclCents)}</td></tr>)}</tbody></table></section>}
     {o.modes.length>0&&<section><h2>Per verkoopkanaal</h2><table className="sales-doc-table small"><tbody>{o.modes.map(m=><tr key={m.mode}><td>{m.name}</td><td className="num">{m.orders} best.</td><td className="num">{money(m.inclCents)}</td></tr>)}</tbody></table></section>}
    </div>
    <footer className="sales-doc-foot"><p>Dit is een verkoopoverzicht voor de eigen administratie, geen factuur aan een klant. Bedragen zijn wat er echt betaald is (bij „Jou wat goed fielt” het gekozen bedrag), met de btw van het bestelmoment.{o.skipped>0&&` ${o.skipped} ${o.skipped===1?'bestelling telt':'bestellingen tellen'} niet mee (wacht op betaling of terugbetaald).`}</p>{omgeving&&<p>{omgeving.koppelingen?.bunq==='live'?'Betalingen via bunq zijn live (echt geld).':'Er is nog geen live bankkoppeling.'} {omgeving.koppelingen?.snelstart?'SnelStart is alleen-lezen gekoppeld; de omzet gaat er nog niet heen.':'Er is nog geen boekhoudkoppeling.'}</p>}</footer>
   </>}
  </article>
 </div>;
}
