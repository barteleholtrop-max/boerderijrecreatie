'use client';
import {useEffect,useState} from 'react';
import {money} from '../../ui';
import {plainName} from '@/lib/group-bill-core';
// Factuur van een gezamenlijke rekening (wens eigenaar 5 november 2026), in dezelfde stijl als het verkoopoverzicht.
// Standaard een overzicht: wat er besteld is en wie er besteld hebben, niet wie wat nam (wens eigenaar 5 november 2026: geen
// scheve gezichten). Op verzoek de uitsplitsing per persoon (?detail=1). Btw per tarief, betalingen en „Voldaan”. Downloaden = afdrukken als PDF.
type Line={order:string;quantity:number;name:string;vat:string;totalCents:number};
type Invoice={number:string;date:string;bill:string;code:string;holder:{name:string;email:string;phone:string};seller:{name:string;street:string;postalCode:string;city:string;email:string;phone:string;kvk:string;vatNumber:string;website?:string};
 people:{name:string;email:string;phone:string;lines:Line[];totalCents:number}[];products:{name:string;quantity:number;vat:string;totalCents:number}[];orderedBy:string[];totalCents:number;exclCents:number;vat:{rate:string;vatCents:number;exclCents:number}[];
 payments:{label:string;method:string;amountCents:number;paidAt:string}[];paidCents:number;openCents:number;paid:boolean;differenceCents:number;
 payment?:{iban:string;accountName:string;links:{position:number;count:number;amountCents:number;url:string}[]}};
const longDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T12:00:00Z'));
export default function Factuur(){
 const [inv,setInv]=useState<Invoice|null>(null),[error,setError]=useState(''),[detail,setDetail]=useState(false);
 useEffect(()=>{const q=new URLSearchParams(location.search),id=q.get('id')||'';setDetail(q.get('detail')==='1');
  fetch('/api/rekeningen?id='+encodeURIComponent(id),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setInv(d.invoice);document.title='Factuur '+d.invoice.number+' · Boer Bart'}).catch(e=>setError((e as Error).message||'Laden mislukt.'))},[]);
 const s=inv?.seller;
 return <div className="sales-doc-page" data-bb-view="invoice">
  <div className="sales-doc-bar no-print"><a className="btn secondary" href="/financien/facturen">← Facturen</a><button className="btn" disabled={!inv} onClick={()=>print()}>Download als PDF</button><label className="small"><input type="checkbox" checked={detail} onChange={e=>{setDetail(e.target.checked);const u=new URL(location.href);if(e.target.checked)u.searchParams.set('detail','1');else u.searchParams.delete('detail');history.replaceState(null,'',u)}}/> Met details per persoon (alleen op verzoek)</label><span className="small">Kies bij het afdrukken „Opslaan als PDF”.</span></div>
  {error&&<div className="message no-print" role="alert">{error}</div>}
  {inv&&s&&<>
   {(!s.kvk||!s.vatNumber)&&<p className="message no-print inv-note">Vul het KvK- en btw-nummer in bij Bedrijfsgegevens; die horen op een factuur.</p>}
   {!inv.payment?.iban&&<p className="message no-print inv-note">Vul het IBAN in bij Bedrijfsgegevens; dan staat het rekeningnummer op de factuur.</p>}
   {/* Zakelijke opmaak (wens eigenaar 11 november 2026): rustige kop, duidelijke gegevensblokken, lichte totalen en een voet met alle bedrijfsgegevens. */}
   <article className="sales-doc inv">
   <header className="inv-head">
    <div className="inv-brand"><img className="inv-logo" src="/boerbart-logo.webp" alt="Boer Bart"/>
     <div><div className="inv-name">{s.name}</div><div className="inv-address">{s.street}{s.street&&<br/>}{[s.postalCode,s.city].filter(Boolean).join('  ')}</div></div></div>
    <div className="inv-title"><h1>Factuur</h1>{inv.paid?<span className="inv-status paid">Voldaan</span>:<span className="inv-status open">Openstaand</span>}</div>
   </header>
   <section className="inv-info">
    <div><h2>Factuur aan</h2><p><b>{inv.holder.name||'–'}</b>{inv.holder.email&&<><br/>{inv.holder.email}</>}{inv.holder.phone&&<><br/>{inv.holder.phone}</>}</p></div>
    <dl className="inv-meta"><dt>Factuurnummer</dt><dd>{inv.number}</dd><dt>Factuurdatum</dt><dd>{longDate(inv.date)}</dd><dt>Rekening</dt><dd>{inv.bill}</dd><dt>Kenmerk</dt><dd>{inv.code}</dd></dl>
   </section>
   <table className="inv-table"><thead><tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Btw</th><th className="num">Bedrag</th></tr></thead>
    <tbody>{detail?inv.people.map(p=>[<tr key={p.email+p.name} className="inv-person"><td colSpan={3}>{p.name}{(p.email||p.phone)&&<span> · {[p.email,p.phone].filter(Boolean).join(' · ')}</span>}</td><td className="num">{money(p.totalCents)}</td></tr>,
     ...p.lines.map((l,i)=><tr key={p.email+i}><td>{plainName(l.name)} <span className="inv-muted">({l.order})</span></td><td className="num">{l.quantity}</td><td className="num">{l.vat}%</td><td className="num">{money(l.totalCents)}</td></tr>)])
     :inv.products.map(l=><tr key={l.name+l.vat}><td>{plainName(l.name)}</td><td className="num">{l.quantity}</td><td className="num">{l.vat}%</td><td className="num">{money(l.totalCents)}</td></tr>)}</tbody></table>
   <div className="inv-bottom">
    <div className="inv-left">{!detail&&inv.orderedBy.length>0&&<p className="inv-muted">Besteld door: {inv.orderedBy.join(', ')}</p>}
     {!inv.paid&&inv.openCents>0&&<div className="inv-pay"><h2>Betalen</h2>
      {(inv.payment?.links||[]).map(l=><div className="inv-pay-link" key={l.url}><img src={'/api/public/qr?url='+encodeURIComponent(l.url)} alt="" width={74} height={74}/><div>{l.count>1&&<b>Deel {l.position} van {l.count} · {money(l.amountCents)}<br/></b>}<a href={l.url}>Betaal online met iDEAL</a><br/><span className="inv-muted">Scan de code of klik op de link.</span></div></div>)}
      <p>{(inv.payment?.links||[]).length>0?'Of maak het bedrag over':'Maak het bedrag over'}{inv.payment?.iban?<> naar <b>{inv.payment.iban}</b>{inv.payment.accountName&&<> t.n.v. {inv.payment.accountName}</>}</>:''}, onder vermelding van <b>{inv.number}</b>.</p></div>}</div>
    <div className="inv-totals"><div><span>Subtotaal excl. btw</span><b>{money(inv.exclCents)}</b></div>{inv.vat.map(v=><div key={v.rate}><span>Btw {v.rate}% over {money(v.exclCents)}</span><b>{money(v.vatCents)}</b></div>)}
     <div className="inv-total"><span>Totaal incl. btw</span><b>{money(inv.totalCents)}</b></div>
     {inv.payments.map((p,i)=><div key={i}><span>Betaald · {p.method} · {longDate(p.paidAt)}</span><b>− {money(p.amountCents)}</b></div>)}
     {inv.differenceCents!==0&&<div><span>Geef wat goed voelt ({inv.differenceCents<0?'minder':'meer'} betaald)</span><b>{inv.differenceCents<0?'− ':'+ '}{money(Math.abs(inv.differenceCents))}</b></div>}
     <div className={inv.paid?'inv-due paid':'inv-due open'}><span>{inv.paid?'Voldaan':'Te betalen'}</span><b>{money(inv.paid?0:inv.openCents)}</b></div></div>
   </div>
   <p className="inv-thanks">Dank je wel voor je bezoek aan Boer Bart. Alle bedragen zijn inclusief btw, met het tarief van het moment van bestellen.</p>
   <footer className="inv-foot">
    <div><b>{s.name}</b><br/>{s.street}{s.street&&<br/>}{[s.postalCode,s.city].filter(Boolean).join('  ')}</div>
    <div>{[s.phone,s.email,s.website].filter(Boolean).map(x=><span key={x}>{x}<br/></span>)}</div>
    <div>{s.kvk&&<span>KvK {s.kvk}<br/></span>}{s.vatNumber&&<span>Btw {s.vatNumber}<br/></span>}{inv.payment?.iban&&<span>IBAN {inv.payment.iban}<br/></span>}</div>
   </footer>
  </article></>}
 </div>;
}
