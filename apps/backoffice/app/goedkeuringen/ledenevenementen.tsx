'use client';
// Goedkeuringen → Evenementen van leden (besluit eigenaar 8 november 2026). De coördinator (nu Rianne) keurt goed, wijst af of doet
// een voorstel: andere datum of tijd, het deel van de boerderij, het btw-tarief (9 november 2026), en een koffiebedrag als de organisator de koffie betaalt. Goedgekeurd
// = in de agenda, diensten in het rooster met een hulpvraag aan de leden, en een marketingconcept bij Marketing.
import {useCallback,useEffect,useState} from 'react';
import {Pill,Notice} from '../ui';

type Req={title:string;description:string;date:string;from:string;to:string;altDate:string;place:string;capacity:number|null;priceCents:number;needs:string;coffee:'geen'|'gast'|'organisator';roles:{roleId:string;count:number}[];vatKind?:'cultuur'|'workshop'|'vrijgesteld';shareSeenBp:number};
type Terms={date:string;from:string;to:string;farmShareBp:number;coffeeCents:number|null;note:string;vatBp?:number;vatChecked?:boolean};
type Ev={id:string;version:number;status:string;statusLabel:string;request:Req|null;terms:Terms|null;change:Req|null;note:string;organiser:string;
 // Samen organiseren (wens eigenaar 9 november 2026): wie meedoet en wat ieder krijgt van het organisatordeel.
 team?:{name:string;shareBp:number;status:string}[];split?:{name:string;cents:number;status:string}[]|null;staffing:{roleId:string;count:number}[];
 signups:{people:number;revenueCents:number};settlement:{revenueCents:number;vatBp:number;vatCents:number;exclCents:number;farmCents:number;organiserCents:number;coffeeCents:number;payoutCents:number}|null;
 coffeeSuggestionCents:number|null;refunds:{name:string;email:string;amountCents:number}[];
 // Afrekening na het evenement (9 november 2026).
 settled:{route:string;status:string;statusText:string;payoutCents:number;bbCents:number;dueCents:number;ibanLast4:string;version:number}|null;canSettle:boolean};
const teamText=(e:{organiser:string;team?:{name:string;shareBp:number;status:string}[]})=>{const t=(e.team||[]).filter(v=>v.status!=='afgewezen');return t.length?' · samen met '+t.map(v=>`${v.name} ${(v.shareBp/100).toLocaleString('nl-NL',{maximumFractionDigits:2})}%${v.status==='uitgenodigd'?' (uitgenodigd)':''}`).join(', '):''};
type Data={settings:{coordinatorId:string;coordinatorName:string;farmShareBp:number;version:number};roles:{id:string;name:string}[];members:{id:string;name:string;organiser:boolean}[];
 coffeePriceCents:number|null;events:Ev[];canDecide:boolean};

const euro=(c:number)=>(c<0?'− ':'')+'€ '+(Math.abs(c)/100).toFixed(2).replace('.',',');
const pct=(bp:number)=>(bp/100).toLocaleString('nl-NL',{maximumFractionDigits:2});
const day=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
// Btw (besluit eigenaar 9 november 2026): zelfde lijst als lib/member-events-core.ts VAT_KINDS.
const VAT_KIND={cultuur:['cultuur (9%)',900],workshop:['workshop en overig (21%)',2100],vrijgesteld:['vrijgesteld (0%)',0]} as const;
const kindBp=(k?:keyof typeof VAT_KIND)=>k?VAT_KIND[k][1]:2100;
const COFFEE={gast:'gast betaalt zelf (restaurantpot)',organisator:'organisator betaalt',geen:'niet nodig'};

export function useLedenEvenementen(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/ledenevenementen',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);setError('')}catch(e){setError((e as Error).message||'Evenementen van leden konden niet worden geladen.')}},[]);
 useEffect(()=>{void load()},[load]);
 return {data,setData,error,load};
}

export function LedenEvenementen({data,setData,error}:{data:Data|null;setData:(d:Data)=>void;error:string}){
 const [busy,setBusy]=useState(''),[msg,setMsg]=useState('');
 if(error)return <div className="message" role="status">{error}</div>;
 if(!data)return null;
 async function post(body:{action:string;[k:string]:unknown},key:string){
  setBusy(key);setMsg('');
  try{const r=await fetch('/api/ledenevenementen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Dat lukte niet.');
   setData(d);setMsg(d.message+((d.warnings||[]).length?' Let op: '+d.warnings.join(' · '):''))}
  catch(e){setMsg((e as Error).message)}finally{setBusy('')}
 }
 const role=(id:string)=>data.roles.find(r=>r.id===id)?.name||id;
 const waiting=data.events.filter(e=>e.status==='aangevraagd'||(e.status==='goedgekeurd'&&e.change));
 const proposed=data.events.filter(e=>e.status==='voorstel');
 const planned=data.events.filter(e=>e.status==='goedgekeurd'&&!e.change);
 const cancelled=data.events.filter(e=>e.status==='geannuleerd'&&e.refunds.length);
 const sum=(r:Req)=><>
  <p className="small">{r.description}</p>
  <p className="small"><b>{day(r.date)}, {r.from}–{r.to}</b>{r.altDate?` (of ${day(r.altDate)})`:''}{r.place?' · '+r.place:''} · {r.priceCents?euro(r.priceCents)+' p.p.':'gratis'}{r.capacity?` · max. ${r.capacity}`:''} · btw: {r.vatKind?VAT_KIND[r.vatKind][0]:'niet gekozen (21%)'} · koffie: {COFFEE[r.coffee]}</p>
  {r.roles.length>0&&<p className="small">Rollen: {r.roles.map(x=>`${x.count}× ${role(x.roleId)}`).join(', ')}</p>}
  {r.needs&&<p className="small">Nodig: {r.needs}</p>}
 </>;
 return <section className="section-gap" data-bb-view="ledenevenementen">
  <div className="card-head"><h3 className="card-title">Evenementen van leden</h3><Pill color={waiting.length?'orange':'green'}>{waiting.length} te beoordelen</Pill></div>
  {msg&&<div className="message" role="status">{msg}</div>}
  {!data.canDecide&&<Notice kind="info" title="Alleen bekijken">Beslissen over evenementen kan de coördinator of een eigenaar.</Notice>}
  <div className="grid two">
   {waiting.map(e=>e.status==='aangevraagd'?<Decide key={e.id} e={e} data={data} busy={busy===e.id} post={post} summary={sum(e.request!)}/>
    :<div className="card" key={e.id} data-member-event={e.id}><div className="row between" style={{marginBottom:13}}><Pill color="purple">Wijziging</Pill><Pill>{e.organiser}</Pill></div>
     <h3>{e.change!.title}</h3><p className="small">Nu: {day(e.terms!.date)}, {e.terms!.from}–{e.terms!.to} · {e.request!.priceCents?euro(e.request!.priceCents):'gratis'}</p>{sum(e.change!)}
     <div className="action-row"><button className="btn sm" disabled={!!busy||!data.canDecide} onClick={()=>{const ex=e.change!.vatKind==='vrijgesteld'&&e.change!.priceCents>0&&(e.change!.vatKind!==e.request!.vatKind);
       if(ex&&!window.confirm('Het lid kiest nu „vrijgesteld van btw”. Heb je gecontroleerd dat dit evenement echt vrijgesteld is?'))return;
       void post({action:'wijziging-goedkeuren',id:e.id,version:e.version,...(ex?{terms:{vatChecked:true}}:{})},e.id)}}>Wijziging goedkeuren</button>
      <button className="btn secondary sm" disabled={!!busy||!data.canDecide} onClick={()=>{const note=window.prompt('Waarom niet? Het lid krijgt dit te zien.');if(note!==null)void post({action:'wijziging-afwijzen',id:e.id,version:e.version,note},e.id)}}>Afwijzen</button></div></div>)}
   {!waiting.length&&<div className="card empty" style={{gridColumn:'1/-1'}}>Geen evenementen van leden te beoordelen ✓</div>}
  </div>
  {proposed.length>0&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Voorstel verstuurd, wacht op het lid</h3></div>
   {proposed.map(e=><div className="task" key={e.id}><div className="task-body"><strong>{e.request?.title} · {e.organiser}{teamText(e)}</strong><span>{e.terms&&`${day(e.terms.date)}, ${e.terms.from}–${e.terms.to} · btw ${pct(e.terms.vatBp??2100)}% · boerderij ${pct(e.terms.farmShareBp)}%${e.terms.coffeeCents?' · koffie '+euro(e.terms.coffeeCents):''}`}</span></div></div>)}</div>}
  {planned.length>0&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Gepland</h3></div>
   {planned.map(e=><div className="task" key={e.id}><div className="task-body"><strong>{e.request?.title} · {e.organiser}{teamText(e)} · {e.terms&&`${day(e.terms.date)}, ${e.terms.from}–${e.terms.to}`}</strong>
    <span>{e.signups.people} aangemeld{e.settlement?` · betaald ${euro(e.settlement.revenueCents)} · btw ${euro(e.settlement.vatCents)} · boerderij ${euro(e.settlement.farmCents)} · organisator ${euro(e.settlement.organiserCents)}${e.settlement.coffeeCents?` − koffie ${euro(e.settlement.coffeeCents)}`:''} = ${euro(e.settlement.payoutCents)}`:''}
     {e.staffing.length?` · rooster: ${e.staffing.map(x=>`${x.count}× ${role(x.roleId)}`).join(', ')}`:''}</span>
     {e.settled&&<span><b>Afrekening: {e.settled.statusText}</b> · {settledText(e.settled)}</span>}</div>
    <Payout e={e} busy={!!busy} can={data.canDecide} post={post}/></div>)}</div>}
  {cancelled.length>0&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Geannuleerd: nog terug te betalen</h3></div>
   {cancelled.map(e=><div className="task" key={e.id}><div className="task-body"><strong>{e.request?.title}</strong><span>{e.refunds.map(r=>`${r.name} (${r.email}) ${euro(r.amountCents)}`).join(' · ')}</span></div>
    {/* Eén knop (besluit eigenaar 9 november 2026): bewust drukken; Mollie betaalt elke online betaling één keer terug. */}
    <button className="btn sm" disabled={!!busy||!data.canDecide} onClick={()=>{if(window.confirm(`${euro(e.refunds.reduce((n,r)=>n+r.amountCents,0))} terugbetalen via Mollie aan ${e.refunds.length} ${e.refunds.length===1?'gast':'gasten'}?`))void post({action:'terugbetalen',id:e.id},e.id)}}>Terugbetalen via Mollie</button></div>)}</div>}
  <Settings data={data} busy={busy==='instellingen'} post={post}/>
 </section>;
}

function Decide({e,data,busy,post,summary}:{e:Ev;data:Data;busy:boolean;post:(b:{action:string;[k:string]:unknown},key:string)=>Promise<void>;summary:React.ReactNode}){
 const r=e.request!,[t,setT]=useState({date:r.date,from:r.from,to:r.to,share:pct(r.shareSeenBp),coffee:e.coffeeSuggestionCents?(e.coffeeSuggestionCents/100).toFixed(2).replace('.',','):'',note:'',vat:String(kindBp(r.vatKind)),vatChecked:false});
 const changed=t.date!==r.date||t.from!==r.from||t.to!==r.to||Math.round(Number(t.share.replace(',','.'))*100)!==r.shareSeenBp||(r.priceCents>0&&Number(t.vat)!==kindBp(r.vatKind)),proposal=changed||r.coffee==='organisator';
 const set=(k:'date'|'from'|'to'|'share'|'coffee'|'note'|'vat')=>(ev:{target:{value:string}})=>setT({...t,[k]:ev.target.value});
 const exempt=t.vat==='0'&&r.priceCents>0;
 return <div className="card" data-member-event={e.id}><div className="row between" style={{marginBottom:13}}><Pill color="purple">Evenement</Pill><Pill>{e.organiser}{teamText(e)}</Pill></div>
  <h3>{r.title}</h3>{summary}
  <div className="form-grid">
   <label>Datum<input type="date" value={t.date} onChange={set('date')}/></label>
   <label>Van<input type="time" value={t.from} onChange={set('from')}/></label><label>Tot<input type="time" value={t.to} onChange={set('to')}/></label>
   <label>Deel boerderij (%, van de kaartverkoop zonder btw)<input inputMode="decimal" value={t.share} onChange={set('share')}/></label>
   <label>Btw op de kaartjes<select value={t.vat} onChange={set('vat')}><option value="900">9% (cultuur: concert, voorstelling, film, tentoonstelling, rondleiding)</option><option value="2100">21% (workshop, cursus, lezing, proeverij, overig)</option><option value="0">0% (vrijgesteld)</option></select>
    {exempt&&<span className="field-hint small"><label><input type="checkbox" checked={t.vatChecked} onChange={ev=>setT({...t,vatChecked:ev.target.checked})}/> Ik heb gecontroleerd dat dit evenement echt vrijgesteld is van btw.</label></span>}</label>
   {r.coffee==='organisator'&&<label>Koffiebedrag voor de organisator (€)<input inputMode="decimal" value={t.coffee} onChange={set('coffee')} placeholder="bijv. 40,00"/>
    <span className="field-hint small">{data.coffeePriceCents?`Voorstel: ${r.capacity??20} gasten × ${euro(data.coffeePriceCents)} koffie.`:'Geen koffieprijs op de kaart gevonden; vul zelf een bedrag in.'}</span></label>}
   <label>Toelichting voor het lid<input value={t.note} maxLength={500} onChange={set('note')}/></label>
  </div>
  <p className="small">{proposal?'Dit wordt een voorstel: het evenement komt in de agenda zodra het lid akkoord geeft.':'Goedkeuren zet het evenement meteen in de agenda, de rollen in het rooster en vraagt leden om te helpen.'}</p>
  <div className="action-row"><button className="btn sm" disabled={busy||!data.canDecide||(exempt&&!t.vatChecked)} onClick={()=>void post({action:'goedkeuren',id:e.id,version:e.version,terms:{date:t.date,from:t.from,to:t.to,farmSharePercent:t.share,coffee:t.coffee,note:t.note,vatBp:Number(t.vat),vatChecked:t.vatChecked}},e.id)}>{proposal?'Voorstel versturen':'Goedkeuren'}</button>
   <button className="btn secondary sm" disabled={busy||!data.canDecide} onClick={()=>{const note=window.prompt('Waarom wijs je dit af? Het lid krijgt dit te zien.');if(note!==null)void post({action:'afwijzen',id:e.id,version:e.version,note},e.id)}}>Afwijzen</button></div>
 </div>;
}

function Settings({data,busy,post}:{data:Data;busy:boolean;post:(b:{action:string;[k:string]:unknown},key:string)=>Promise<void>}){
 const [s,setS]=useState({coordinatorId:data.settings.coordinatorId,share:pct(data.settings.farmShareBp)});
 const organisers=data.members.filter(m=>m.organiser).map(m=>m.name);
 return <details className="card section-gap"><summary className="card-title">Instellingen evenementen van leden</summary>
  <div className="form-grid">
   <label>Evenementencoördinator (krijgt de meldingen)<select value={s.coordinatorId} onChange={e=>setS({...s,coordinatorId:e.target.value})}><option value="">Niemand</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   <label>Standaard deel van de boerderij uit de kaartverkoop (%)<input inputMode="decimal" value={s.share} onChange={e=>setS({...s,share:e.target.value})}/></label>
  </div>
  <p className="small">Wie evenementen mag aanvragen, zet je op de ledenkaart met „Organiseert evenementen”{organisers.length?`: nu ${organisers.join(', ')}`:' (nu nog niemand)'}.</p>
  <div className="action-row"><button className="btn sm" disabled={busy||!data.canDecide} onClick={()=>void post({action:'instellingen',settings:{coordinatorId:s.coordinatorId,farmSharePercent:s.share,version:data.settings.version}},'instellingen')}>Opslaan</button></div>
 </details>;
}

const settledText=(s:NonNullable<Ev['settled']>)=>s.route==='bb'?`${euro(s.payoutCents)} als BB-tegoed`:s.route==='bunq'?`${euro(s.payoutCents)} naar •••• ${s.ibanLast4}`
 :s.route==='bb-af'?[s.bbCents?`${euro(-s.bbCents)} van het BB-tegoed af`:'',s.dueCents?`nog te ontvangen ${euro(s.dueCents)}`:''].filter(Boolean).join(' · '):'niets te betalen';
/** Knoppen bij een gepland of geweest evenement: afrekenen na afloop, de uitbetaling goedkeuren of volgen, of annuleren zolang het nog kan. */
function Payout({e,busy,can,post}:{e:Ev;busy:boolean;can:boolean;post:(b:{action:string;[k:string]:unknown},key:string)=>Promise<void>}){
 const s=e.settled,act=(action:string,ask?:string)=>{if(ask&&!window.confirm(ask))return;void post({action,id:e.id,version:s?.version},e.id)};
 if(e.canSettle)return <button className="btn sm" disabled={busy||!can} onClick={()=>act('afrekenen',e.settlement?`Afrekenen met ${e.organiser}? Uitkomst ${euro(e.settlement.payoutCents)}. Dit kan maar één keer.`:'Afrekenen? Dit kan maar één keer.')}>Afrekenen</button>;
 if(s?.route==='bunq'&&s.status==='klaar')return <button className="btn sm" disabled={busy||!can} onClick={()=>act('uitbetaling-goedkeuren',`${euro(s.payoutCents)} uitbetalen aan ${e.organiser}? bunq zet een conceptbetaling klaar die je in de bunq-app bevestigt.`)}>Uitbetaling goedkeuren</button>;
 if(s&&['in-bunq','aandacht'].includes(s.status))return <button className="btn secondary sm" disabled={busy||!can} onClick={()=>act('bunq-ophalen')}>Stand bij bunq ophalen</button>;
 if(s?.status==='te-ontvangen')return <button className="btn secondary sm" disabled={busy||!can} onClick={()=>act('ontvangen',`Heeft ${e.organiser} ${euro(s.dueCents)} betaald?`)}>Ontvangen</button>;
 if(!s&&e.terms&&e.terms.date>=new Date().toISOString().slice(0,10))return <button className="btn secondary sm" disabled={busy||!can} onClick={()=>{const note=window.prompt('Evenement annuleren? Het gaat uit de agenda, de diensten gaan uit het rooster en de aanmeldingen worden geannuleerd. Toelichting voor het lid:');if(note!==null)void post({action:'annuleren',id:e.id,version:e.version,note},e.id)}}>Annuleren</button>;
 return null;
}
