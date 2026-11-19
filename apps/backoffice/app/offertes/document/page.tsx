'use client';
// Offerte als document (wens eigenaar 5 november 2026), in de stijl van de factuur. Downloaden = afdrukken als PDF.
// Afzender, KvK, btw en IBAN komen uit Bedrijfsgegevens; de offerte zelf uit Offertes & groepen.
import {useEffect,useState} from 'react';
import {publicQuote,type Quote} from '@/lib/quotes';
import {QuoteSheet} from '../sheet';
import type {Company} from '@/lib/company';
export default function OfferteDocument(){
 const [q,setQ]=useState<Quote|null>(null),[co,setCo]=useState<Company|null>(null),[error,setError]=useState('');
 useEffect(()=>{const id=new URLSearchParams(location.search).get('id')||'';
  fetch('/api/gasten',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);const found=(d.state.quotes||[]).find((x:Quote)=>x.id===id);if(!found)throw Error('Offerte niet gevonden, of je hebt geen toegang.');setQ(found);document.title='Offerte '+found.number+' · '+found.customer.name}).catch(e=>setError((e as Error).message||'Laden mislukt.'));
  fetch('/api/bedrijfsgegevens',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d?.company&&setCo(d.company)).catch(()=>{});},[]);
 return <div className="sales-doc-page" data-bb-view="quote-document">
  <div className="sales-doc-bar no-print"><a className="btn secondary" href={q?'/offertes?offerte='+encodeURIComponent(q.id):'/offertes'}>← Offerte bewerken</a><button className="btn" disabled={!q} onClick={()=>print()}>Download als PDF</button><span className="small">Kies bij het afdrukken „Opslaan als PDF”.</span></div>
  {error&&<div className="message no-print" role="alert">{error}</div>}
  {q&&<QuoteSheet q={publicQuote(q)} co={co}/>}
 </div>;
}
