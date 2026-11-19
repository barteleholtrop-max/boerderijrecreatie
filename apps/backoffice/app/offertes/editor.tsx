'use client';
// Offerte-editor (wens eigenaar 5 november 2026): Rianne past het voorstel aan. Regels uit het assortiment (prijs en btw
// uit de centrale backoffice), uit het prijsvoorstel bij het gesprek, of met de hand. Bedragen zijn inclusief btw.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Pill,money} from '../ui';
import type {GuestState} from '@/lib/guest-core';
import {cardForReservation,cardForThread,type CustomerCard} from '@/lib/guest-customers';
import {quoteTotals,quoteMailDraft,QUOTE_LINK,QUOTE_STATUSES,type Quote,type QuoteLine,type QuoteStatus} from '@/lib/quotes';
export const STATUS:Record<QuoteStatus,{label:string;color:''|'green'|'orange'|'red'|'blue'|'purple'}>={concept:{label:'Concept',color:'orange'},verstuurd:{label:'Verstuurd',color:'blue'},geaccepteerd:{label:'Geaccepteerd',color:'green'},afgewezen:{label:'Afgewezen',color:'red'},vervallen:{label:'Vervallen',color:''}};
export type Draft=Omit<Quote,'rev'|'number'|'created'|'updated'|'by'|'history'>&Partial<Pick<Quote,'rev'|'number'|'created'|'updated'|'by'|'history'>>;
type Product={id:string;published:{name:string;priceCents:number;vat:string;available?:boolean}|null};
const ACTIVITY:Record<string,string>={groep:'Groepsarrangement',bezoek:'Boerderijbezoek',yte:'Yte'};
const plusDays=(n:number)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const longDate=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'';
/** Nieuw concept, zo veel mogelijk ingevuld vanuit de aanvraag, het gesprek of de klantenkaart. */
export function newDraft({state,cards,customerId='',reservationId='',threadId=''}:{state:GuestState;cards:CustomerCard[];customerId?:string;reservationId?:string;threadId?:string}):Draft{
 const r=reservationId?state.reservations.find(x=>x.id===reservationId):undefined,tid=threadId||r?.threadId||'';
 const card=cards.find(c=>c.id===customerId)||(r&&cardForReservation(cards,r.id))||(tid?cardForThread(cards,tid):undefined);
 const name=card?.name||r?.name||'',people=r?.people||0;
 return {id:crypto.randomUUID(),customerId:card?.id||'',customer:{name,email:card?.email||(r?.email||'').toLowerCase(),phone:card?.phone||r?.phone||'',company:card?.company||''},threadId:tid,reservationId:r?.id||'',
  title:r?[ACTIVITY[r.activity]||'Arrangement',people?people+' personen':''].filter(Boolean).join(', '):'',eventDate:r?.date||'',people,
  intro:`Beste ${name.split(' ')[0]||'gast'},\n\nDank voor je aanvraag. Hierbij ons voorstel${r?' voor '+longDate(r.date)+', '+r.from+'–'+r.to+' uur':''}. Laat gerust weten wat je wilt aanpassen.`,
  terms:'De offerte is een voorstel; de datum ligt pas vast na bevestiging.',
  lines:[],validUntil:plusDays(14),status:'concept'};
}
export function QuoteEditor({draft,saved,cards,state,can,busy,onSave,onDelete,onClose,onSent}:{draft:Draft;saved?:Quote;onSent:(message:string)=>Promise<void>;cards:CustomerCard[];state:GuestState;can:boolean;busy:boolean;onSave:(q:Draft,message:string)=>Promise<boolean>;onDelete:(id:string)=>void;onClose:()=>void}){
 const [mail,setMail]=useState<{to:string;subject:string;body:string;requestId:string}|null>(null),[sending,setSending]=useState(false),[mailError,setMailError]=useState(''),[sender,setSender]=useState('Boer Bart');
 useEffect(()=>{fetch('/api/bedrijfsgegevens',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d?.company?.tradeName&&setSender(d.company.tradeName)).catch(()=>{})},[]);
 const [q,setQ]=useState<Draft>(draft),[products,setProducts]=useState<Product[]>([]),[pick,setPick]=useState(''),[dirty,setDirty]=useState(false);
 useEffect(()=>{fetch('/api/products',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then((rows:Product[])=>setProducts(rows.filter(p=>p.published).sort((a,b)=>a.published!.name.localeCompare(b.published!.name,'nl')))).catch(()=>{})},[]);
 // Na opslaan: de bewaarde versie (met nummer en revisie) overnemen, zodat een volgende wijziging niet botst.
 useEffect(()=>{if(saved&&!dirty&&(saved.rev!==q.rev||!q.number))setQ({...saved})},[saved?.rev]);// eslint-disable-line react-hooks/exhaustive-deps
 const set=(patch:Partial<Draft>)=>{setQ(v=>({...v,...patch}));setDirty(true)};
 const setLine=(i:number,patch:Partial<QuoteLine>)=>set({lines:q.lines.map((l,n)=>n===i?{...l,...patch}:l)});
 const totals=useMemo(()=>quoteTotals(q.lines.filter(l=>l.quantity>0)),[q.lines]);
 const card=cards.find(c=>c.id===q.customerId);
 const groupReservations=state.reservations.filter(r=>r.status!=='geannuleerd').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,80);
 const ro=!can;
 function chooseCustomer(id:string){const c=cards.find(x=>x.id===id);set(c?{customerId:c.id,customer:{name:c.name,email:c.email,phone:c.phone,company:c.company}}:{customerId:''})}
 function addProduct(id:string){const p=products.find(x=>x.id===id)?.published;if(!p)return;set({lines:[...q.lines,{description:p.name,quantity:q.people||1,unitCents:p.priceCents,vat:(['0','9','21'].includes(p.vat)?p.vat:'9') as QuoteLine['vat']}]});setPick('')}
 async function save(status:QuoteStatus=q.status,msg='Offerte opgeslagen.'){const body={...q,status,lines:q.lines.filter(l=>l.description.trim())};if(await onSave(body,msg)){setQ(v=>({...v,status}));setDirty(false)}}
 useEffect(()=>{if(saved&&!dirty&&saved.rev!==q.rev)setQ({...saved})},[dirty]);
 // Versturen naar de gast (wens eigenaar 5 november 2026): mail vanaf de gastenmailbox met de persoonlijke link.
 function openMail(){setMailError('');setMail({to:q.customer.email,...quoteMailDraft({number:q.number||'',title:q.title,intro:q.intro,lines:q.lines,validUntil:q.validUntil,people:q.people},sender),requestId:crypto.randomUUID()});setTimeout(()=>document.getElementById('offerte-mail')?.scrollIntoView({behavior:'smooth',block:'center'}),50)}
 async function sendMail(){if(!mail)return;setSending(true);setMailError('');try{const r=await fetch('/api/gasten',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'quote-send',id:q.id,...mail})}),d=await r.json();if(!r.ok)throw Error(d.error||'Versturen mislukt.');setMail(null);await onSent('Offerte verstuurd naar '+mail.to+'. De gast krijgt een link naar de offerte.')}catch(e){setMailError((e as Error).message)}finally{setSending(false)}}// eslint-disable-line react-hooks/exhaustive-deps
 return <section className="card section-gap quote-editor" id="offerte-editor" aria-label="Offerte bewerken">
  <div className="quote-editor-head"><div><div className="eyebrow">{q.number||'Nieuwe offerte'} · {STATUS[q.status].label}</div><h2>{q.title||'Offerte zonder titel'}</h2>
   <p className="small">{q.number?`Laatst gewijzigd ${new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(q.updated||Date.now()))}${q.by?' door '+q.by:''}.`:'Nog niet opgeslagen. Dit is een voorstel: pas alles aan wat nodig is.'}{dirty?' Niet-opgeslagen wijzigingen.':''}</p></div>
   <div className="head-actions">{q.number&&<Link className="btn secondary" href={'/offertes/document?id='+encodeURIComponent(q.id)} target="_blank">Bekijk en download PDF</Link>}<button className="btn secondary" onClick={onClose}>Sluiten</button></div></div>
  {/* Reactie van de gast via de link (wens eigenaar 5 november 2026). */}
  {q.accepted&&<div className="notice section-gap quote-accepted"><div><strong>Online akkoord door {q.accepted.name} · {new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(q.accepted.at))}</strong>Geaccepteerd: {money(q.accepted.totalCents)} incl. btw, {q.accepted.lines.length} onderdelen{q.accepted.eventDate?', '+q.accepted.eventDate:''}.{(q.rev??0)>q.accepted.rev+1?' Let op: de offerte is daarna nog gewijzigd; het akkoord geldt voor de versie van dat moment.':''} Leg de boeking vast in Planning.</div></div>}
  {(()=>{const r=q.responses?.at(-1);return r?.kind==='vraag'&&!q.accepted?<div className="notice warn section-gap"><div><strong>Vraag van {r.name} · {new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.at))}</strong><span style={{whiteSpace:'pre-wrap'}}>{r.message}</span>{r.rev!==q.rev?<><br/><em>Je hebt de offerte daarna aangepast. Stuur hem opnieuw, zodat de gast de nieuwe versie ziet.</em></>:null}</div></div>:null})()}
  <div className="quote-editor-grid">
   <fieldset className="guest-fieldgroup"><legend>Klant</legend>
    <label>Klantenkaart<select value={q.customerId} disabled={ro} onChange={e=>chooseCustomer(e.target.value)}><option value="">Geen kaart (zelf invullen)</option>{cards.map(c=><option key={c.id} value={c.id}>{c.name}{c.company?' · '+c.company:''}{c.email?' · '+c.email:''}</option>)}</select></label>
    <div className="quote-two"><label>Naam<input value={q.customer.name} disabled={ro} maxLength={300} onChange={e=>set({customer:{...q.customer,name:e.target.value}})}/></label><label>Bedrijf / organisatie<input value={q.customer.company} disabled={ro} maxLength={300} onChange={e=>set({customer:{...q.customer,company:e.target.value}})}/></label></div>
    <div className="quote-two"><label>E-mail<input type="email" value={q.customer.email} disabled={ro} onChange={e=>set({customer:{...q.customer,email:e.target.value}})}/></label><label>Telefoon<input value={q.customer.phone} disabled={ro} maxLength={100} onChange={e=>set({customer:{...q.customer,phone:e.target.value}})}/></label></div>
    {card?<p className="small">Gekoppeld aan de klantenkaart van {card.name}. <Link href={'/gesprekken?tab=klanten&klant='+encodeURIComponent(card.id)}>Klantenkaart openen</Link></p>:<p className="small">Kies een klantenkaart, dan staat de offerte ook bij die klant. Met hetzelfde e-mailadres wordt hij ook gevonden.</p>}
   </fieldset>
   <fieldset className="guest-fieldgroup"><legend>Gelegenheid</legend>
    <label>Titel<input value={q.title} disabled={ro} maxLength={200} placeholder="Bijvoorbeeld: Teamuitje met lunch, 24 personen" onChange={e=>set({title:e.target.value})}/></label>
    <div className="quote-two"><label>Datum<input type="date" value={q.eventDate} disabled={ro} onChange={e=>set({eventDate:e.target.value})}/></label><label>Personen<input type="number" min={0} max={10000} value={q.people||''} disabled={ro} onChange={e=>set({people:Math.max(0,Math.round(Number(e.target.value)||0))})}/></label></div>
    <label>Aanvraag in Planning<select value={q.reservationId} disabled={ro} onChange={e=>{const r=state.reservations.find(x=>x.id===e.target.value);set({reservationId:e.target.value,...(r?{eventDate:q.eventDate||r.date,people:q.people||r.people,threadId:q.threadId||r.threadId||''}:{})})}}><option value="">Niet gekoppeld</option>{groupReservations.map(r=><option key={r.id} value={r.id}>{r.date} · {r.name} · {r.people} pers. · {r.status}</option>)}</select></label>
    <div className="quote-two"><label>Geldig tot<input type="date" value={q.validUntil} disabled={ro} onChange={e=>set({validUntil:e.target.value})}/></label><label>Status<select value={q.status} disabled={ro} onChange={e=>set({status:e.target.value as QuoteStatus})}>{QUOTE_STATUSES.map(s=><option key={s} value={s}>{STATUS[s].label}</option>)}</select></label></div>
   </fieldset>
  </div>
  <h3 className="section-gap">Onderdelen en prijzen</h3>
  <div className="table-wrap"><table className="quote-lines"><thead><tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Prijs per stuk</th><th className="num">Btw</th><th className="num">Totaal</th><th></th></tr></thead><tbody>
   {q.lines.map((l,i)=><tr key={i+'-'+q.lines.length}>
    <td><input aria-label="Omschrijving" value={l.description} disabled={ro} maxLength={500} onChange={e=>setLine(i,{description:e.target.value})}/></td>
    <td className="num"><input aria-label="Aantal" type="number" min={0} step="any" value={l.quantity} disabled={ro} onChange={e=>setLine(i,{quantity:Number(e.target.value)})}/></td>
    <td className="num"><input aria-label="Prijs per stuk in euro" type="number" min={0} step="0.01" defaultValue={(l.unitCents/100).toFixed(2)} disabled={ro} onChange={e=>setLine(i,{unitCents:Math.max(0,Math.round(Number(e.target.value)*100))})}/></td>
    <td className="num"><select aria-label="Btw" value={l.vat} disabled={ro} onChange={e=>setLine(i,{vat:e.target.value as QuoteLine['vat']})}><option value="9">9%</option><option value="21">21%</option><option value="0">0%</option></select></td>
    <td className="num"><b>{money(Math.round(l.quantity*l.unitCents))}</b></td>
    <td>{can&&<button className="text-button" aria-label={'Regel '+(i+1)+' weghalen'} onClick={()=>set({lines:q.lines.filter((_,n)=>n!==i)})}>✕</button>}</td></tr>)}
   {!q.lines.length&&<tr><td colSpan={6} className="small">Nog geen onderdelen. Voeg een product uit het assortiment toe of een eigen regel.</td></tr>}
  </tbody></table></div>
  {can&&<div className="quote-add"><select aria-label="Product uit het assortiment" value={pick} onChange={e=>{setPick(e.target.value);addProduct(e.target.value)}}><option value="">+ Product uit het assortiment…</option>{products.map(p=><option key={p.id} value={p.id}>{p.published!.name} · {money(p.published!.priceCents)}</option>)}</select>
   <button className="btn secondary sm" onClick={()=>set({lines:[...q.lines,{description:'',quantity:q.people||1,unitCents:0,vat:'9'}]})}>+ Eigen regel</button></div>}
  <div className="quote-totals"><div>{totals.vat.map(v=><div key={v.rate}><span>Btw {v.rate}% over {money(v.exclCents)}</span><span>{money(v.vatCents)}</span></div>)}<div><span>Totaal excl. btw</span><span>{money(totals.exclCents)}</span></div><div className="quote-grand"><span>Totaal incl. btw</span><span>{money(totals.totalCents)}</span></div>{q.people>0&&totals.totalCents>0&&<div className="small"><span>Per persoon</span><span>{money(Math.round(totals.totalCents/q.people))}</span></div>}</div></div>
  <div className="quote-editor-grid section-gap">
   <label className="quote-text">Aanhef en toelichting voor de gast<textarea rows={6} value={q.intro} disabled={ro} maxLength={5000} onChange={e=>set({intro:e.target.value})}/></label>
   <label className="quote-text">Voorwaarden en afspraken<textarea rows={6} value={q.terms} disabled={ro} maxLength={5000} onChange={e=>set({terms:e.target.value})}/></label>
  </div>
  {can&&<div className="quote-editor-actions">
   <button className="btn" disabled={busy} onClick={()=>save()}>{busy?'Bezig…':'Offerte opslaan'}</button>
   {q.number&&['concept','verstuurd'].includes(q.status)&&<button className="btn warm" disabled={busy||dirty||!q.lines.length} title={dirty?'Sla eerst de wijzigingen op.':''} onClick={openMail}>✉ {q.mails?.length?'Opnieuw versturen':'Versturen naar gast'}</button>}
   {q.status==='concept'&&<button className="btn secondary" disabled={busy||!q.lines.length} onClick={()=>save('verstuurd','Offerte opgeslagen als verstuurd.')}>Zelf verstuurd</button>}
   {q.status==='verstuurd'&&<><button className="btn secondary" disabled={busy} onClick={()=>save('geaccepteerd','Offerte geaccepteerd. Leg de boeking vast in Planning.')}>Gast is akkoord</button><button className="btn secondary" disabled={busy} onClick={()=>save('afgewezen','Offerte op afgewezen gezet.')}>Gast ziet af</button></>}
   {q.status==='geaccepteerd'&&q.reservationId&&<Link className="btn secondary" href={'/planning?reservering='+encodeURIComponent(q.reservationId)}>Boeking vastleggen in Planning</Link>}
   {q.number&&q.status==='concept'&&<button className="btn red" disabled={busy} onClick={()=>{if(confirm('Dit concept verwijderen?'))onDelete(q.id)}}>Concept verwijderen</button>}
   <span className="small">Bedragen zijn inclusief btw. Prijzen uit het assortiment kun je per offerte aanpassen; het assortiment zelf verandert niet.</span>
  </div>}
  {mail&&<div className="quote-mail" id="offerte-mail"><h3>Offerte versturen naar de gast</h3>
   <p className="small">De mail gaat vanaf de gastenmailbox (Gmail-koppeling van Gesprekken). Op de plek van {QUOTE_LINK} komt de persoonlijke link naar de offerte; daar kan de gast hem bekijken en als PDF bewaren. Pas de tekst gerust aan.</p>
   <label>Aan<input type="email" value={mail.to} onChange={e=>setMail({...mail,to:e.target.value})} placeholder="gast@voorbeeld.nl"/></label>
   <label>Onderwerp<input value={mail.subject} maxLength={200} onChange={e=>setMail({...mail,subject:e.target.value})}/></label>
   <label>Bericht<textarea rows={12} value={mail.body} maxLength={20000} onChange={e=>setMail({...mail,body:e.target.value})}/></label>
   {mailError&&<p className="message" role="alert">{mailError}</p>}
   <div className="quote-editor-actions"><button className="btn" disabled={sending||!mail.to} onClick={sendMail}>{sending?'Versturen…':'Nu versturen'}</button><button className="btn secondary" disabled={sending} onClick={()=>setMail(null)}>Annuleren</button>{q.status==='concept'&&<span className="small">Na versturen staat de offerte op Verstuurd.</span>}</div>
  </div>}
  {!!q.mails?.length&&<div className="section-gap"><h3>Verstuurd</h3>{q.mails.slice().reverse().map(m=><div className="audit" key={m.messageId}>{new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(m.at))} · naar {m.to} · door {m.by}</div>)}</div>}
  {q.history&&q.history.length>1&&<details className="section-gap"><summary className="small">Geschiedenis ({q.history.length})</summary>{q.history.slice().reverse().map((h,i)=><div className="audit" key={i}>{new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(h.at))} · {h.by} · <Pill color={STATUS[h.status].color}>{STATUS[h.status].label}</Pill></div>)}</details>}
 </section>;
}
