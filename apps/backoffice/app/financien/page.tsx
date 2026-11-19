'use client';
import Link from 'next/link';
import {PageHead,Pill,Kpi,Notice,SubTabs,money} from '../ui';
import {useOmgeving,betaalStand,type Omgeving} from '../omgeving';
import {FINANCE_TABS} from './tabs';
import {useState} from 'react';
import {useBackoffice,amsterdamDay,type OrderRow} from '../use-backoffice';
import {periodPreset,paidSplit,paidWithText,PAY_METHODS,MODE_NAMES,type PayMethod} from '@/lib/sales-overview';
const PRESETS=[['dag','Vandaag'],['gisteren','Gisteren'],['week','Deze week'],['vorige-week','Vorige week'],['maand','Deze maand'],['vorige-maand','Vorige maand']] as const;
const csvCell=(v:string|number)=>{const s=String(v);return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const time=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
// Klikbare tegels (wens eigenaar 12 november 2026: „de knoppen in het overzicht klikbaar maken”): een tegel opent de lijst erachter.
type Focus='bestellingen'|'omzet'|'btw9'|'btw21'|'';
const FOCUS_TITLE:Record<Exclude<Focus,''>,string>={bestellingen:'Alle vastgelegde bestellingen',omzet:'Bestellingen die als omzet meetellen',btw9:'Regels met 9% btw',btw21:'Regels met 21% btw'};
// Koppelingen (12 november 2026): de echte stand uit /api/omgeving, met een link naar het scherm erachter.
function koppelingen(o:Omgeving|null):{name:string;what:string;state:string;color:'green'|'orange'|'';href:string}[]{
 const k=o?.koppelingen,bunq=k?.bunq;
 return [
  {name:'bunq',what:o?.via==='bunq'?'Online betalen (betaalverzoek), bankontvangsten en verdeling':'Bankontvangsten en verdeling',state:!o?'…':bunq==='live'?'Gekoppeld · live':bunq==='sandbox'?'Gekoppeld · sandbox':'Niet gekoppeld',color:!o?'':bunq==='live'?'green':'orange',href:'/financien/bank'},
  {name:'SnelStart',what:k?.snelstart?'Alleen lezen (Bloei → Waarde); omzet gaat er nog niet heen':'Dagboekingen en facturen',state:!o?'…':k?.snelstart?'Gekoppeld · alleen lezen':'Niet gekoppeld',color:!o?'':k?.snelstart?'green':'orange',href:'/koppeling'},
  {name:'Kassa',what:'Verkopen en bestelregels',state:'Actief',color:'green',href:'/kassa'},
 ];
}
export default function Financien(){const omgeving=useOmgeving();
 const today=amsterdamDay(new Date().toISOString()),[van,setVan]=useState(today.slice(0,8)+'01'),[tot,setTot]=useState(today),[focus,setFocus]=useState<Focus>('');
 const {orders,loading,error}=useBackoffice({orders:{van,tot}});
 // Eén omzetregel (lib/order-revenue.ts): alleen bestellingen die meetellen, met het echt betaalde bedrag.
 const counted=orders.filter(o=>o.counted),waiting=orders.length-counted.length;
 const lines=orders.flatMap(o=>o.lines.map(l=>({o,l}))),sum=counted.reduce((s,o)=>s+o.paidCents,0);
 const vat9=counted.reduce((s,o)=>s+o.paidVat9Cents,0),vat21=counted.reduce((s,o)=>s+o.paidVat21Cents,0);
 // Per betaalwijze (bunq, contant, BB-saldo …): uit de geslaagde betalingen, samen precies de omzet.
 const byMethod=new Map<PayMethod,number>();for(const o of counted)for(const p of paidSplit(o))byMethod.set(p.method,(byMethod.get(p.method)||0)+p.cents);
 const methods=(Object.keys(PAY_METHODS) as PayMethod[]).filter(m=>byMethod.has(m));
 const toggle=(f:Exclude<Focus,''>)=>setFocus(focus===f?'':f);
 function exportCsv(){const eur=(c:number)=>(c/100).toFixed(2).replace('.',',');const rows=[['Bestelling','Datum','Route','Kenmerk','Status','Telt als omzet','Betaald met','Product','Aantal','Normale prijs incl. btw','Betaald incl. btw','Btw-tarief','Btw over betaald'],...lines.map(({o,l})=>[o.number,amsterdamDay(o.created),o.mode,o.reference,o.statusLabel,o.counted?'ja':'nee',paidWithText(o),l.name,l.quantity,eur(l.totalCents),eur(l.paidCents),l.vat+'%',eur(l.paidVatCents)])];const blob=new Blob(['﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='controleoverzicht-bestellingen-'+van+'-tot-'+tot+'.csv';a.click();URL.revokeObjectURL(a.href)}
 const snelstart=!!omgeving?.koppelingen?.snelstart;
 return <div data-bb-view="finance"><PageHead eyebrow="FINANCIËN" title="Betalingen & dagafsluiting" sub="Alle omzet en btw controleerbaar, per verkoopkanaal en per betaalwijze."><a className="btn" href={'/financien/verkoopoverzicht?van='+van+'&tot='+tot} target="_blank" rel="noopener">Verkoopoverzicht (PDF)</a><button className="btn secondary" disabled={!lines.length} onClick={exportCsv}>Download CSV-controleoverzicht</button></PageHead>
  <SubTabs current="/financien" items={FINANCE_TABS}/>
  <Notice kind="warn" title="Nog geen boekingen naar SnelStart">De bedragen hieronder komen uit de vastgelegde bestellingen; omzet telt pas mee als er betaald is. Elke bestelling bewaart de prijs en btw van het bestelmoment. {snelstart?'SnelStart is alleen-lezen gekoppeld':'SnelStart is nog niet gekoppeld'}: neem de omzet voor de btw-aangifte zelf over.{betaalStand(omgeving)&&<> {betaalStand(omgeving)}.</>}</Notice>
  <div className="card section-gap"><h3 className="card-title">Periode</h3><div className="period-presets" role="group" aria-label="Snel een periode kiezen">{PRESETS.map(([k,label])=>{const p=periodPreset(k,today),on=p.van===van&&p.tot===tot;return <button key={k} type="button" className={'chip-btn'+(on?' active':'')} aria-pressed={on} onClick={()=>{setVan(p.van);setTot(p.tot)}}>{label}</button>})}</div><div className="grid two"><label>Van<input type="date" value={van} max={tot} onChange={e=>e.target.value&&setVan(e.target.value)}/></label><label>Tot en met<input type="date" value={tot} min={van} onChange={e=>e.target.value&&setTot(e.target.value)}/></label></div><p className="small">Kies een dag, een week (maandag t/m zondag), een maand of zelf van–tot. Periode van maximaal een jaar. Het verkoopoverzicht gebruikt dezelfde periode.</p></div>
  {error&&<div className="message" role="status">{error}</div>}
  <div className="grid four section-gap">
   <Kpi label="Vastgelegde bestellingen" value={loading?'…':orders.length} foot={van+' t/m '+tot} icon="▤" onClick={()=>toggle('bestellingen')} active={focus==='bestellingen'}/>
   <Kpi label="Omzet incl. btw" value={money(sum)} foot={waiting?`Betaald bedrag · ${waiting} niet meegeteld (wacht op betaling of terugbetaald)`:'Betaald bedrag'} icon="€" onClick={()=>toggle('omzet')} active={focus==='omzet'}/>
   <Kpi label="Btw 9%" value={money(vat9)} foot="Over het betaalde bedrag" icon="9" onClick={()=>toggle('btw9')} active={focus==='btw9'}/>
   <Kpi label="Btw 21%" value={money(vat21)} foot="Over het betaalde bedrag" icon="21" onClick={()=>toggle('btw21')} active={focus==='btw21'}/>
  </div>
  {focus&&<Details focus={focus} orders={focus==='bestellingen'?orders:counted} onClose={()=>setFocus('')}/>}
  <div className="grid two section-gap"><div className="card"><h3 className="card-title">Controleoverzicht</h3>
    <button type="button" className="task task-link" onClick={()=>toggle('omzet')}><div className="task-body"><strong>Verkopen incl. btw</strong><span>Alleen bestellingen die meetellen, met het echt betaalde bedrag</span></div><strong>{money(sum)}</strong></button>
    <button type="button" className="task task-link" onClick={()=>toggle('omzet')}><div className="task-body"><strong>Omzet excl. btw</strong><span>Betaald min btw</span></div><strong>{money(sum-vat9-vat21)}</strong></button>
    <button type="button" className="task task-link" onClick={()=>toggle(vat21&&!vat9?'btw21':'btw9')}><div className="task-body"><strong>Totale btw</strong><span>9% en 21% gescheiden</span></div><strong>{money(vat9+vat21)}</strong></button>
    {methods.length>0&&<><h3 className="card-title section-gap">Per betaalwijze</h3>{methods.map(m=><div className="task" key={m}><div className="task-body"><strong>{PAY_METHODS[m]}</strong></div><strong>{money(byMethod.get(m)!)}</strong></div>)}</>}
   </div>
   <div className="card"><h3 className="card-title">Koppelingen</h3>{koppelingen(omgeving).map(k=><Link className="task task-link" key={k.name} href={k.href}><div className="task-body"><strong>{k.name}</strong><span>{k.what}</span></div><Pill color={k.color}>{k.state}</Pill><span className="kpi-go" aria-hidden="true">→</span></Link>)}</div></div>
 </div>
}
function Details({focus,orders,onClose}:{focus:Exclude<Focus,''>;orders:OrderRow[];onClose:()=>void}){
 const rate=focus==='btw9'?'9':focus==='btw21'?'21':'';
 return <div className="card section-gap"><div className="card-head"><h3 className="card-title">{FOCUS_TITLE[focus]}</h3><button type="button" className="btn sm secondary" onClick={onClose}>Sluiten</button></div>
  <div className="table-wrap">{rate?<table><thead><tr><th>Bestelling</th><th>Moment</th><th>Product</th><th>Aantal</th><th>Betaald met</th><th style={{textAlign:'right'}}>Betaald incl. btw</th><th style={{textAlign:'right'}}>Btw {rate}%</th></tr></thead>
   <tbody>{orders.flatMap(o=>o.lines.filter(l=>String(l.vat)===rate).map((l,i)=><tr key={o.id+'-'+i}><td>{o.number}</td><td>{time(o.created)}</td><td>{l.name}</td><td>{l.quantity}</td><td>{paidWithText(o)}</td><td style={{textAlign:'right'}}>{money(l.paidCents)}</td><td style={{textAlign:'right'}}>{money(l.paidVatCents)}</td></tr>))}</tbody></table>
  :<table><thead><tr><th>Bestelling</th><th>Moment</th><th>Kanaal</th><th>Producten</th><th>Status</th><th>Betaald met</th><th style={{textAlign:'right'}}>Betaald</th></tr></thead>
   <tbody>{orders.map(o=><tr key={o.id}><td>{o.number}{o.reference?' · '+o.reference:''}</td><td>{time(o.created)}</td><td>{MODE_NAMES[o.mode]||o.mode}</td><td>{o.lines.map(l=>l.quantity+'× '+l.name).join(', ')}</td><td>{o.statusLabel}</td><td>{o.counted?paidWithText(o):'—'}</td><td style={{textAlign:'right'}}>{o.counted?money(o.paidCents):'—'}</td></tr>)}</tbody></table>}
  {!orders.length&&<p className="empty">Geen bestellingen in deze periode.</p>}</div></div>;
}
