'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {call,when} from './mail';
import {dayLabel} from '@/lib/day-label';
import {emptyDossier,proposalTotal,type GroupDossier,type BookingSuggestion} from '@/lib/group-advice';
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
/** Kern van het nieuwste advies voor het gesprek (eerder de AI-notitie bij Afhandeling; sinds 11 november 2026 in het blok Aan Sanne). */
export type AdviceSummary={busy:boolean;error:string;at?:string;solution?:string;nextAction?:string;totalCents?:number|null;approvedBy?:string;approvedAt?:string;stale:boolean;off?:boolean;wishes?:string;booking?:BookingSuggestion|null};
// Volgorde gesprek (wens eigenaar 11 november 2026): Afhandeling → Aan Sanne (intern advies, met Volledig advies tonen en Datum en tijd
// reserveren) → de mail → het antwoord met het conceptvoorstel. De aparte AI-notitie is vervallen; de kern staat hier, ingeklapt.
// reserve: het reserveringsdeel (ReserveForm en de gekoppelde aanvragen) van het gesprek, onder de knoppen.
export function GroupAdvicePanel({base,lastMessageId,automatic,canManage,onText,onSummary,threadRef,reserve}:{base:string;lastMessageId:string;automatic:boolean;canManage:boolean;onText:(text:string)=>boolean;onSummary?:(s:AdviceSummary)=>void;threadRef?:string;reserve?:ReactNode}){
 const [d,setD]=useState<GroupDossier>(emptyDossier),[basis,setBasis]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[available,setAvailable]=useState(true),[engine,setEngine]=useState('');
 const noteDirty=useRef(false),panel=useRef<HTMLElement>(null);
 // Uitklapknop (wens eigenaar 8 november 2026): het volledige advies staat standaard ingeklapt, zodat er minder gescrold hoeft te worden.
 const [open,setOpen]=useState(false);
 useEffect(()=>{const openOnLink=(e:MouseEvent)=>{if((e.target as Element|null)?.closest?.('a[href="#intern-advies"]'))setOpen(true)};if(location.hash==='#intern-advies')setOpen(true);document.addEventListener('click',openOnLink);return()=>document.removeEventListener('click',openOnLink)},[]);
 const r=d.revisions.at(-1),stale=!!r&&r.basis!==basis,approved=r&&d.approvals.find(a=>a.revisionId===r.id);
 async function prepare(){if(noteDirty.current){setError('Sla eerst de interne correcties op.');return}setBusy(true);setError('');try{const v=await call<{dossier:GroupDossier;basis:string}>(base,{action:'advice-prepare'});setD(v.dossier);setBasis(v.basis)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{let active=true;void call<{dossier:GroupDossier;basis:string;available?:boolean;engine?:string}>(base,{action:'advice-status'}).then(v=>{if(!active)return;setD(v.dossier);if(!noteDirty.current)setNote(v.dossier.note);setBasis(v.basis);setAvailable(v.available!==false);setEngine(v.engine||'');if(v.available!==false&&automatic&&!v.dossier.error&&v.dossier.revisions.at(-1)?.lastMessageId!==lastMessageId)void prepare()}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[base,lastMessageId,automatic]);
 useEffect(()=>{onSummary?.({busy,off:!available,error:available?error||d.error||'':'',at:r?.at,solution:r?.advice.solution,nextAction:r?.advice.nextAction,wishes:r?.advice.wishes,booking:r?.advice.booking??null,totalCents:r?.advice.proposal?proposalTotal(r.advice.proposal):null,approvedBy:approved?approved.by:undefined,approvedAt:approved?approved.at:undefined,stale})},[d,busy,error,stale,available]);
 async function edit(approveId?:string){setBusy(true);setError('');try{const v=await call<{dossier:GroupDossier}>(base,{action:'advice-edit',version:d.revision,note,approveId});if(note!==d.note)setBasis('');setD(v.dossier);noteDirty.current=false}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function transfer(){setBusy(true);setError('');try{const v=await call<{text:string}>(base,{action:'advice-text'});if(onText(v.text))setTimeout(()=>document.querySelector('#mail-reply,[aria-label="Gastconcept"]')?.scrollIntoView({behavior:'smooth',block:'center'}),80)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section ref={panel} id="intern-advies" className="card section-gap group-advice" aria-label="Aan Sanne — intern advies">
  <h3 className="card-title">Aan Sanne — intern advies</h3>
  <p className="small">Dit vak blijft in de backoffice. Alleen het afzonderlijke gastconcept kan naar de antwoordeditor. Prijsgoedkeuring verstuurt niets.</p>
  {!available&&<p className="small">Advies staat nog uit. Kies bij Systeem &amp; koppelingen → <a href="/koppeling">AI voor gasten</a> Claude of OpenAI en vul de sleutel en de schrijfinstructies in. Gewone mail en Planning werken gewoon.</p>}
  {available&&(error||d.error)&&<p className="message error" role="alert">{error||d.error} Gewone mail en Planning blijven beschikbaar.</p>}
  {stale&&<p className="message error">Brongegevens gewijzigd. Laat het advies opnieuw voorbereiden.</p>}
  {r&&<p className="small">Voorbereid {when(r.at)} · {r.by}{r.engine?' · gemaakt met '+r.engine:''}</p>}
  {available&&!r&&!error&&!d.error&&<p className="small">{busy?'Advies wordt voorbereid…':'Nog geen advies voor dit gesprek. Het wordt voorbereid zodra de klant op ons wacht, of met de knop hieronder.'}</p>}
  {r&&!open&&<div className="advice-summary" aria-label="Kern van het advies">
   <p>{(r.advice.solution||'').length>280?r.advice.solution.slice(0,280)+'…':r.advice.solution}</p>
   {r.advice.nextAction&&<p className="small"><b>Volgende stap:</b> {r.advice.nextAction}</p>}
   <p className="small"><b>Prijsvoorstel:</b> {r.advice.proposal?euro(proposalTotal(r.advice.proposal)):'geen onderbouwd bedrag'} · {approved?`goedgekeurd door ${approved.by} (${when(approved.at)})`:'nog niet goedgekeurd'}</p>
   {r.advice.booking&&<p className="small"><b>Voorstel agenda:</b> {dayLabel(r.advice.booking.date)} · {r.advice.booking.from}–{r.advice.booking.to} · {r.advice.booking.people} personen</p>}
  </div>}
  <div className="actions group-advice-actions">
   {r&&<button type="button" className="btn sm" aria-expanded={open} aria-controls="intern-advies-inhoud" onClick={()=>{setOpen(!open);if(open)panel.current?.scrollIntoView({block:'start'})}}>{open?'Advies inklappen ▴':'Volledig advies tonen ▾'}</button>}
      {available&&<button type="button" className="btn secondary sm" disabled={busy} onClick={prepare}>{busy?'Voorbereiden…':`${r?'Opnieuw voorbereiden':'Advies en gastconcept voorbereiden'}${engine?' ('+engine+')':''}`}</button>}
  </div>
  {reserve}
  {r&&open&&<div id="intern-advies-inhoud">
   {[['Wensen',r.advice.wishes],['Passende invulling',r.advice.solution],['Waarom dit past',r.advice.reason],['Volgende actie',r.advice.nextAction]].map(([title,value])=><div key={title}><h4>{title}</h4><p className="mail-text">{value}</p></div>)}
   {[['Ontbreekt',r.advice.missing],['Tegenstrijdigheden',r.advice.conflicts],['Vergelijkingen en bronverwijzingen',r.advice.comparisons],['Te beoordelen',r.advice.review]].map(([title,values])=><div key={String(title)}><h4>{String(title)}</h4><ul>{(values as string[]).map((v,i)=><li key={i}>{v}</li>)}</ul></div>)}
   <h4>Beschikbaarheid</h4>{r.availability.length?r.availability.map(a=><p className="small" key={a.id}>{a.id}: {a.result}</p>):<p className="small">Nog geen gestructureerde aanvraag gekoppeld: datum, tijd en aantallen in Planning beoordelen. Een lege agenda bewijst geen beschikbaarheid.</p>}
   <h4>Prijsvoorstel — intern</h4>{r.advice.proposal?<>
    <ul>{r.advice.proposal.items.map((i,n)=><li key={n}>{i.description}: {i.quantity} × {euro(i.unitCents)} = {euro(Math.round(i.quantity*i.unitCents))}</li>)}</ul>
    <p><strong>Totaal {euro(proposalTotal(r.advice.proposal))}</strong> · Btw: {r.advice.proposal.vat}</p>
    {[['Aannames',r.advice.proposal.assumptions],['Inbegrepen',r.advice.proposal.included],['Onbekend',r.advice.proposal.unknown]].map(([title,values])=><p className="small" key={String(title)}>{String(title)}: {(values as string[]).join('; ')||'niet opgegeven'}</p>)}
    <p className="small">Geen rendementsberekening. Controleer inhoud, aannames en btw vóór goedkeuring.</p>
    {approved?<p>Goedgekeurd door {approved.by} · {when(approved.at)}</p>:canManage&&<button className="btn secondary sm" disabled={busy||stale} onClick={()=>edit(r.id)}>Dit prijsvoorstel goedkeuren</button>}
    {/* Offerte (wens eigenaar 5 november 2026): het voorstel gaat als concept naar Offertes; Sanne past het daar aan. */}
    {canManage&&threadRef&&<button className="btn sm" disabled={busy} onClick={()=>{const p=r.advice.proposal!;try{sessionStorage.setItem('offerte-voorstel',JSON.stringify({threadId:threadRef,lines:p.items.map(i=>({description:i.description,quantity:i.quantity,unitCents:i.unitCents,vat:'9'})),people:r.advice.booking?.people||0,date:r.advice.booking?.date||''}))}catch{}location.href='/offertes?nieuw=1&gesprek='+encodeURIComponent(threadRef)}}>Offerte maken van dit voorstel</button>}
   </>:<p className="small">Geen voldoende onderbouwd bedrag beschikbaar.</p>}
   <h4>Bronnen en toegang</h4><ul>{r.sources.map(s=><li key={s.label}><strong>{s.url?<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>:s.label}</strong>: {s.status}</li>)}</ul>
   <h4>Gastconcept — nog niet in Gmail</h4><p className="mail-text">{r.advice.guestDraft}</p>
   <button className="btn secondary sm" disabled={busy||stale} onClick={transfer}>Gastconcept naar lege antwoordeditor{approved?' met goedgekeurde prijs':''}</button>
  </div>}
  {(!r||open)&&<>
  <label className="small" htmlFor="internal-group-note">Interne correcties en opmerkingen</label><textarea id="internal-group-note" className="input" rows={4} value={note} maxLength={12000} onChange={e=>{noteDirty.current=true;setNote(e.target.value)}}/>
  {canManage&&<button className="btn secondary sm" disabled={busy} onClick={()=>edit()}>Interne toelichting opslaan</button>}
  {d.revisions.length>1&&<details><summary>Eerdere voorstellen ({d.revisions.length-1})</summary>{d.revisions.slice(0,-1).map(v=><div key={v.id}><strong>{when(v.at)}</strong><p className="mail-text">{v.advice.solution}</p><p>{v.advice.proposal?euro(proposalTotal(v.advice.proposal)):'Geen bedrag'} · {d.approvals.some(a=>a.revisionId===v.id)?'Goedgekeurd':'Niet goedgekeurd'}</p></div>)}</details>}
  {r&&<button type="button" className="btn sm" onClick={()=>{setOpen(false);panel.current?.scrollIntoView({block:'start'})}}>Advies inklappen ▴</button>}
  </>}
 </section>;
}
