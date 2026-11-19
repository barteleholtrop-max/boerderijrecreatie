'use client';
// Foto bij een evenement (wens eigenaar 3 november 2026): kies een foto uit de beeldbank of plak een https-link.
// De foto staat op de website in het venster dat opent als een gast op het evenement klikt.
import {useState} from 'react';
import {MediaPicker} from '../media-picker';

type Ev={id:string;date:string;from:string;to:string;title:string;description?:string;signup?:boolean;capacity?:number;priceCents?:number;paymentInfo?:string;payOnline?:boolean;photo?:string;rev?:number};
const ok=(v:string)=>v===''||/^https:\/\//i.test(v)||/^\/api\/media\/[a-f0-9-]{36}$/.test(v);

export function EventPhoto({event,busy,canEdit,save}:{event:Ev;busy:boolean;canEdit:boolean;save:(event:Record<string,unknown>)=>void}){
 const [picking,setPicking]=useState(false),[link,setLink]=useState('');
 // Alle bestaande gegevens van het evenement gaan mee; alleen de foto verandert.
 const store=(photo:string)=>save({id:event.id,date:event.date,from:event.from,to:event.to,title:event.title,description:event.description||'',holiday:false,
  ...(event.signup!==undefined?{signup:event.signup}:{}),...(event.capacity!==undefined?{capacity:event.capacity}:{}),...(event.priceCents!==undefined?{priceCents:event.priceCents}:{}),
  ...(event.paymentInfo!==undefined?{paymentInfo:event.paymentInfo}:{}),...(event.payOnline!==undefined?{payOnline:event.payOnline}:{}),photo,...(event.rev!==undefined?{rev:event.rev}:{})});
 const off=busy||!canEdit;
 return <div className="event-photo-edit">
  {event.photo?<div className="chosen-image"><img src={event.photo} alt={'Foto bij '+event.title}/><button type="button" disabled={off} onClick={()=>store('')}>Foto weghalen</button></div>
   :<span className="small">Nog geen foto. Gasten zien de foto als ze op het evenement klikken.</span>}
  <div className="row" style={{gap:8,flexWrap:'wrap'}}>
   <button type="button" className="btn secondary sm" disabled={off} onClick={()=>setPicking(true)}>{event.photo?'Andere foto kiezen':'Foto kiezen uit beeldbank'}</button>
   <input aria-label={'Fotolink voor '+event.title} placeholder="of plak een https-link" value={link} onChange={e=>setLink(e.target.value.trim())} disabled={off}/>
   <button type="button" className="btn secondary sm" disabled={off||!link||!ok(link)} onClick={()=>{store(link);setLink('')}}>Link gebruiken</button>
  </div>
  {link&&!ok(link)&&<span className="small">Een link moet met https:// beginnen.</span>}
  {picking&&<MediaPicker onClose={()=>setPicking(false)} onSelect={url=>{setPicking(false);store(url)}}/>}
 </div>;
}
