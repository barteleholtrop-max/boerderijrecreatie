'use client';
import {useEffect,useState} from 'react';
import {PageHead,Notice,SubTabs,money} from '../../ui';
import {FINANCE_TABS} from '../tabs';
// Facturen van gezamenlijke rekeningen (wens eigenaar 5 november 2026): altijd een factuur, met „Voldaan” zodra alles
// betaald is (iDEAL, contant, pin). Rekeningen van vorige dagen die nog openstaan: de factuur gaat naar de rekeninghouder.
// Factuurmail (akkoord eigenaar 5 november 2026): automatisch vanaf info@ (Gesprekken; tot 11 november 2026 rianne@): „voldaan” zodra alles betaald is,
// en „nog te betalen” met iDEAL-link de dag na het bezoek. Hier zie je de stand en kun je bij elke factuur met e-mailadres (opnieuw) versturen
// (ook bij „Alle facturen”, wens eigenaar 11 november 2026).
type Bill={id:string;code:string;name:string;origin:string;holderName:string;holderEmail:string;holderPhone:string;validUntil:string;status:string;paidAt:string;invoiceNumber:number|null;orders:number;spentCents:number;mailOpen:string;mailPaid:string;mailError:string};
const MAIL:Record<string,string>={verzonden:'✓ gemaild',uit:'niet gemaild',mislukt:'mailen mislukt'};
const label=(n:number|null)=>n?'BB-'+String(n).padStart(5,'0'):'–';
const day=(v:string)=>v?new Date(v.length===10?v+'T12:00:00Z':v).toLocaleDateString('nl-NL',{timeZone:'Europe/Amsterdam'}):'';
export default function Facturen(){
 const [bills,setBills]=useState<Bill[]|null>(null),[late,setLate]=useState<Bill[]>([]),[error,setError]=useState(''),[dividend,setDividend]=useState<{participantId:string;name:string;email:string;paidCents:number;orders:number;dividendCents:number;availableCents?:number}[]>([]);
 useEffect(()=>{fetch('/api/rekeningen?soort=dividend',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(Array.isArray(d))setDividend(d)}).catch(()=>{})},[]);
 useEffect(()=>{Promise.all([fetch('/api/rekeningen?soort=facturen',{cache:'no-store'}).then(r=>r.json()),fetch('/api/rekeningen?soort=achterstallig',{cache:'no-store'}).then(r=>r.json())])
  .then(([a,b])=>{if(!Array.isArray(a))throw Error(a.error);setBills(a);setLate(Array.isArray(b)?b:[])}).catch(e=>setError((e as Error).message||'Laden mislukt.'))},[]);
 const [sent,setSent]=useState<Record<string,string>>({});
 async function send(b:Bill){setSent(x=>({...x,[b.id]:'Bezig…'}));try{const r=await fetch('/api/rekeningen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.id,action:'mail'})});const d=await r.json();if(!r.ok)throw Error(d.error);setSent(x=>({...x,[b.id]:'In de wachtrij: wordt zo verstuurd.'}))}catch(e){setSent(x=>({...x,[b.id]:(e as Error).message||'Dat lukte niet.'}))}}
 const mailState=(b:Bill)=>{const v=b.paidAt?b.mailPaid:b.mailOpen;return sent[b.id]||(v?MAIL[v]+(v!=='verzonden'&&b.mailError?' · '+b.mailError:''):b.paidAt?'':'nog niet gemaild')};
 return <div data-bb-view="finance-invoices"><PageHead eyebrow="FINANCIËN" title="Facturen & rekeningen" sub="Elke gezamenlijke rekening krijgt een factuur, met „Voldaan” zodra alles betaald is."/>
  <SubTabs current="/financien/facturen" items={FINANCE_TABS}/>
  {error&&<div className="message" role="status">{error}</div>}
  {late.length>0&&<section className="card section-gap"><h3 className="card-title">Nog te versturen ({late.length})</h3>
   <Notice kind="warn" title="Rekeningen van vorige dagen die nog niet betaald zijn">De rekeninghouder krijgt automatisch de factuur met een iDEAL-betaallink, vanaf info@boerbart.nl (de mailbox van Gesprekken). Lukt mailen niet, dan zie je hier waarom en kun je het opnieuw proberen.</Notice>
   <div className="table-wrap"><table><thead><tr><th>Factuur</th><th>Rekening</th><th>Rekeninghouder</th><th>Open</th><th></th></tr></thead><tbody>{late.map(b=><tr key={b.id}><td>{label(b.invoiceNumber)}</td><td>{b.name}<br/><span className="small">{day(b.validUntil)}</span></td><td>{b.holderName}<br/><span className="small">{b.holderEmail} · {b.holderPhone}</span></td><td>{money(b.spentCents)}</td>
    <td className="action-row"><span className="small">{mailState(b)}</span><a className="btn sm secondary" href={'/financien/factuur?id='+encodeURIComponent(b.id)} target="_blank" rel="noopener">Factuur</a><button className="btn sm" onClick={()=>send(b)}>{b.mailOpen==='verzonden'?'Opnieuw versturen':'Nu versturen'}</button></td></tr>)}</tbody></table></div></section>}
  <section className="card section-gap"><h3 className="card-title">Betaald met dividend (dit jaar)</h3>
   <p className="small">Dit overzicht toont betalingen met opneembaar dividend uit Bloei in dit kalenderjaar. Het bedrag dat nog te besteden is volgt de actieve tegoedperiode, met aftrek van lopende betalingen.</p>
   {!dividend.length?<p className="small">Nog niets met dividend betaald.</p>:<div className="table-wrap"><table><thead><tr><th>Lid</th><th>Bestellingen</th><th>Betaald met dividend</th><th>Opneembaar uit Bloei</th><th>Nog te besteden</th></tr></thead><tbody>
    {dividend.map(d=><tr key={d.participantId}><td>{d.name}<br/><span className="small">{d.email}</span></td><td>{d.orders}</td><td>{money(d.paidCents)}</td><td>{money(d.dividendCents)}</td><td>{money(d.availableCents??Math.max(0,d.dividendCents-d.paidCents))}</td></tr>)}</tbody></table></div>}
  </section>
  <section className="card section-gap"><h3 className="card-title">Alle facturen</h3>
   {!bills?<p>Laden…</p>:!bills.length?<p className="small">Nog geen facturen. Ze ontstaan vanzelf zodra een gast een rekening opent of een groepsrekening wordt afgerekend.</p>
   :<div className="table-wrap"><table><thead><tr><th>Factuur</th><th>Rekening</th><th>Rekeninghouder</th><th>Bedrag</th><th>Stand</th><th></th></tr></thead><tbody>{bills.map(b=><tr key={b.id}><td>{label(b.invoiceNumber)}</td><td>{b.name}<br/><span className="small">{b.origin==='gast'?'geopend door gast':'groepscode'} · {b.orders} {b.orders===1?'bestelling':'bestellingen'}</span></td><td>{b.holderName||'–'}</td><td>{money(b.spentCents)}</td>
    <td>{b.paidAt?<span className="pill green">Voldaan {day(b.paidAt)}</span>:<span className="pill orange">Open</span>}<br/><span className="small">{mailState(b)}</span></td><td className="action-row"><a className="btn sm secondary" href={'/financien/factuur?id='+encodeURIComponent(b.id)} target="_blank" rel="noopener">Factuur</a>{b.holderEmail&&<button className="btn sm" onClick={()=>send(b)}>{(b.paidAt?b.mailPaid:b.mailOpen)==='verzonden'?'Opnieuw versturen':'Nu versturen'}</button>}</td></tr>)}</tbody></table></div>}
  </section></div>;
}
