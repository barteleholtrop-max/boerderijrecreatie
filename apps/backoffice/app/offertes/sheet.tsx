// Het offerteblad (wens eigenaar 5 november 2026): hetzelfde in de backoffice (/offertes/document) en voor de gast
// (/offerte/<link>). Afzender, KvK, btw en IBAN uit Bedrijfsgegevens. Geen interne velden.
import type {PublicQuote} from '@/lib/quotes';
import type {Company} from '@/lib/company';
const money=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
const longDate=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T12:00:00Z')):'';
const qty=(n:number)=>Number.isInteger(n)?String(n):n.toLocaleString('nl-NL',{maximumFractionDigits:3});
type Co=Pick<Company,'tradeName'|'street'|'postalCode'|'city'|'phone'|'email'|'kvk'|'vatNumber'|'iban'>;
export function QuoteSheet({q,co}:{q:PublicQuote;co:Co|null}){
 const t=q.totals,name=co?.tradeName||'Boer Bart';
 return <article className="sales-doc quote-sheet">
  <header className="invoice-head"><img className="invoice-logo" src="/boerbart-logo.webp" alt={name}/>
   <div className="invoice-from"><div className="sales-doc-brand">{name}</div>{co&&[co.street,[co.postalCode,co.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}{co&&(co.phone||co.email)&&<><br/>{[co.phone,co.email].filter(Boolean).join(' · ')}</>}</div>
   <div className="sales-doc-meta"><h1>Offerte</h1><dl><dt>Offertenummer</dt><dd>{q.number}</dd><dt>Datum</dt><dd>{longDate(q.date)}</dd>{q.validUntil&&<><dt>Geldig tot</dt><dd>{longDate(q.validUntil)}</dd></>}</dl>
    {q.status==='concept'&&<div className="quote-concept-mark">Concept</div>}{q.status==='geaccepteerd'&&<div className="invoice-paid">Akkoord</div>}{['afgewezen','vervallen'].includes(q.status)&&<div className="quote-concept-mark">Vervallen</div>}</div></header>
  <div className="invoice-parties"><div><h2>Offerte voor</h2><p>{q.customer.company&&<><b>{q.customer.company}</b><br/></>}{q.customer.company?q.customer.name:<b>{q.customer.name}</b>}</p></div>
   <div><h2>{q.title}</h2><p>{q.eventDate&&<>{longDate(q.eventDate)}<br/></>}{q.people>0&&<>{q.people} personen</>}</p></div></div>
  {q.intro&&<p className="quote-doc-text">{q.intro}</p>}
  <table className="sales-doc-table"><thead><tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Prijs</th><th className="num">Btw</th><th className="num">Bedrag incl. btw</th></tr></thead>
   <tbody>{q.lines.map((l,i)=><tr key={i}><td>{l.description}</td><td className="num">{qty(l.quantity)}</td><td className="num">{money(l.unitCents)}</td><td className="num">{l.vat}%</td><td className="num">{money(Math.round(l.quantity*l.unitCents))}</td></tr>)}
   {!q.lines.length&&<tr><td colSpan={5} className="sales-doc-empty">Nog geen onderdelen.</td></tr>}</tbody></table>
  <div className="sales-doc-totals"><div><span>Totaal excl. btw</span><b>{money(t.exclCents)}</b></div>{t.vat.map(v=><div key={v.rate}><span>Btw {v.rate}% over {money(v.exclCents)}</span><b>{money(v.vatCents)}</b></div>)}
   <div className="grand"><span>Totaal incl. btw</span><b>{money(t.totalCents)}</b></div>{q.people>0&&t.totalCents>0&&<div><span>Per persoon</span><b>{money(Math.round(t.totalCents/q.people))}</b></div>}</div>
  {q.terms&&<div className="quote-doc-terms"><h2>Voorwaarden</h2><p className="quote-doc-text">{q.terms}</p></div>}
  <footer className="invoice-foot"><img src="/boerbart-logo.webp" alt=""/><div><p>{co&&[name,[co.street,[co.postalCode,co.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),co.kvk&&'KvK '+co.kvk,co.vatNumber&&'Btw '+co.vatNumber,co.iban&&'IBAN '+co.iban.replace(/(.{4})/g,'$1 ').trim()].filter(Boolean).join(' · ')}</p>
   <p>Bedragen inclusief btw. Deze offerte is een voorstel; de afspraak ligt pas vast na bevestiging.</p></div></footer>
 </article>;
}
