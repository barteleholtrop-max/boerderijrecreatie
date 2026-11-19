'use client';
import {useState,useEffect,useRef} from 'react';
import {money} from '../ui';
// Afrekenen aan de medewerkerskassa (wens eigenaar 4 november 2026): contant, pin of QR (iDEAL via Mollie; test of live volgens de Mollie-sleutel).
// Contant en pin bevestigt de medewerker zelf; bij QR ziet het scherm vanzelf dat er betaald is.
export type PayOrder={id:number;number:string;reference:string;totalCents:number;paymentStatus?:string};
type Method='contant'|'pin'|'qr';
const post=async(orderId:number,method:Method)=>{const r=await fetch('/api/kassa/afrekenen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,method})});const d=await r.json() as {error?:string;paid?:boolean;checkoutUrl?:string};if(!r.ok)throw Error(d.error||'Afrekenen lukte niet.');return d};
export function PayDrawer({order,onClose,onPaid}:{order:PayOrder;onClose:()=>void;onPaid:()=>void}){
 const [method,setMethod]=useState<Method|null>(null),[paid,setPaid]=useState(order.paymentStatus==='betaald'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[given,setGiven]=useState(''),[qr,setQr]=useState('');
 const paidRef=useRef(onPaid);paidRef.current=onPaid;
 const done=()=>{setPaid(true);paidRef.current()};
 async function pay(m:'contant'|'pin'){setBusy(true);setError('');try{await post(order.id,m);done()}catch(e){setError(e instanceof Error?e.message:'Afrekenen lukte niet.')}finally{setBusy(false)}}
 const [shared,setShared]=useState('');
 async function shareLink(url:string){const text=`Betaalverzoek van Boer Bart: ${money(order.totalCents)} voor ${order.number}.`;
  try{if(navigator.share){await navigator.share({title:'Boer Bart',text,url});setShared('Gedeeld. Het scherm ziet vanzelf dat er betaald is.');return}}catch(e){if((e as Error)?.name==='AbortError')return}
  try{await navigator.clipboard.writeText(text+' '+url);setShared('Link gekopieerd: plak hem in WhatsApp of een sms.')}catch{setShared(url)}}
 async function showQr(){setMethod('qr');setBusy(true);setError('');try{const d=await post(order.id,'qr');if(d.paid)done();else if(d.checkoutUrl)setQr(d.checkoutUrl)}catch(e){setError(e instanceof Error?e.message:'De QR-code kon niet worden gemaakt.')}finally{setBusy(false)}}
 // Tijdens het wachten op de QR-betaling elke 3 seconden de stand opvragen (de backoffice kijkt zelf bij Mollie of bunq).
 useEffect(()=>{if(!qr||paid)return;let stop=false;const t=setInterval(async()=>{try{const r=await fetch('/api/kassa/afrekenen?bestelling='+order.id,{cache:'no-store'});const d=await r.json() as {paymentStatus?:string};if(!stop&&d.paymentStatus==='betaald'){setPaid(true);paidRef.current()}}catch{}},3000);return ()=>{stop=true;clearInterval(t)}},[qr,paid,order.id]);
 const givenCents=Math.round(Number(given.replace(',','.'))*100),change=Number.isFinite(givenCents)&&givenCents>=order.totalCents?givenCents-order.totalCents:null;
 return <div className="overlay"><section className="drawer cash-pay" role="dialog" aria-modal="true" aria-label="Afrekenen"><div className="drawer-top"><h2>Afrekenen · {order.number}</h2><button className="close" onClick={onClose} aria-label="Sluiten">×</button></div>
  <div className="cash-total"><span>Te betalen{order.reference&&order.reference!=='Kassa'?' · '+order.reference:''}</span><strong>{money(order.totalCents)}</strong></div>
  {error&&<div role="alert" className="message">{error}</div>}
  {paid?<div className="cash-paid"><p className="cash-paid-mark">✓ Betaald</p><p>De bestelling is betaald en staat bij de werkplek.</p><button className="btn" autoFocus onClick={onClose}>Volgende klant</button></div>
  :<><div className="cash-pay-methods" role="group" aria-label="Hoe betaalt de gast?">
    <button type="button" className={method==='contant'?'active':''} disabled={busy} onClick={()=>setMethod('contant')}><span aria-hidden="true">💶</span>Contant</button>
    <button type="button" className={method==='pin'?'active':''} disabled={busy} onClick={()=>setMethod('pin')}><span aria-hidden="true">💳</span>Pin</button>
    <button type="button" className={method==='qr'?'active':''} disabled={busy} onClick={showQr}><span aria-hidden="true">📱</span>Betaalverzoek</button></div>
   {method==='contant'&&<div className="cash-pay-step"><label>Ontvangen (niet verplicht)<input inputMode="decimal" value={given} onChange={e=>setGiven(e.target.value)} placeholder="Bijvoorbeeld 20"/></label>{change!==null&&<p className="cash-change">Wisselgeld: <b>{money(change)}</b></p>}<button className="btn" disabled={busy} onClick={()=>pay('contant')}>{busy?'Vastleggen…':'Contant ontvangen'}</button></div>}
   {method==='pin'&&<div className="cash-pay-step"><p>Zet {money(order.totalCents)} op de pinautomaat en laat de gast pinnen. Tik daarna hieronder.</p><button className="btn" disabled={busy} onClick={()=>pay('pin')}>{busy?'Vastleggen…':'Pin gelukt'}</button></div>}
   {method==='qr'&&<div className="cash-pay-step">{qr?<><img className="cash-qr" src={'/api/public/qr?url='+encodeURIComponent(qr)} alt="QR-code om te betalen" width={240} height={240}/><p>Laat de gast de code scannen en betalen. Het scherm ziet vanzelf dat er betaald is.</p>
    {/* Betaalverzoek sturen (wens eigenaar 10 november 2026: „mogen we je nu een betaalverzoekje sturen?”): dezelfde link via WhatsApp of sms. */}
    <button type="button" className="btn secondary" onClick={()=>void shareLink(qr)}>📤 Betaalverzoek sturen</button>{shared&&<p className="small" role="status">{shared}</p>}</>:busy?<p>QR-code maken…</p>:null}</div>}
   <button type="button" className="btn secondary" onClick={onClose}>Later afrekenen</button></>}
 </section></div>;
}
