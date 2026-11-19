'use client';
// Personeelsplanning (besluit eigenaar 5 november 2026), tussen Verwachte gasten en de Weekagenda: per open dag welke rollen nodig
// zijn, wie ze heeft geclaimd (via de eigen ledenlink) en wie zich op de dag zelf op de tablet heeft aangemeld. Regels in
// lib/pot-day-core.ts en lib/pot-planning.ts. Alleen aanwezig telt mee in de restaurantpot (Winstdeling & rollen).
// Wens eigenaar 6 november 2026: diensten alleen op open dagen; signalen bij een extra open dag of een groep op een dag zonder
// diensten; na het toevoegen van diensten de vraag of het naar de leden mag (direct of in het weekbericht); een omschrijving per
// dienst; weektaken apart bovenaan de week, met per weektaak de keuze of hij ook op gesloten dagen mag.
// Wens eigenaar 7 november 2026: de winkeldiensten van de leveranciers (twee dagdelen, lib/member-shop.ts) in hetzelfde rooster.
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {Pill} from '../ui';
type Person={participantId:string;name:string;status:'gepland'|'aanwezig';offered?:boolean};
type Slot={roleId:string;roleName:string;points:number;need:number;note:string;open:number;week:boolean;people:Person[]};
type Day={day:string;open:boolean;farmOpen:boolean;extra:boolean;warnings:string[];hours:string;past:boolean;locked:boolean;hasAgreement:boolean;norm:{guests:number;omzetCents:number;people:number;missing:string[]}|null;expected:{sure:number;possible:number;forecast:number|null};slots:Slot[];needed:number;filled:number};
type WeekTask={roleId:string;roleName:string;onClosed:boolean};
type Roster={today:string;members:{id:string;name:string}[];weekTasks:WeekTask[];days:Day[]};
type ShopSlot={id:string;name:string;from:string;to:string;participantId:string|null;offered:boolean};
type Shop={today:string;people:{id:string;name:string}[];days:{day:string;open:boolean;slots:ShopSlot[]}[]};
type Signal={pot:string;potName:string;day:string;reason:string;text:string;items:string[]};
const amsterdam=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const add=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const monday=(d:string)=>add(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
const label=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));

export function Personeelsplanning(){
 const [week,setWeek]=useState(()=>monday(amsterdam())),[data,setData]=useState<Roster|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[closed,setClosed]=useState(false);
 const [shop,setShop]=useState<Shop|null>(null);
 const [signals,setSignals]=useState<Signal[]>([]),[ask,setAsk]=useState<{day:string;roleIds:string[]}|null>(null),[info,setInfo]=useState(''),[editing,setEditing]=useState('');
 const load=useCallback(async(w:string)=>{
  const [r,s]=await Promise.all([fetch(`/api/pot-planning?pot=restaurant&van=${w}&dagen=7`,{cache:'no-store'}),fetch('/api/pot-planning?signalen=1',{cache:'no-store'})]);
  const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Laden mislukt.');return}setError('');setData(d);
  const sd=await s.json().catch(()=>({}));if(s.ok)setSignals(sd.signals||[]);
  // Winkeldiensten van de leveranciers (wens eigenaar 7 november 2026): in hetzelfde rooster, per dag.
  const w2=await fetch(`/api/leden/winkeldiensten?vanaf=${w}`,{cache:'no-store'});const wd=await w2.json().catch(()=>null);setShop(w2.ok&&wd?.days?wd:null);
 },[]);
 useEffect(()=>{load(week)},[week,load]);
 // Opnieuw laden als je terugkomt naar dit tabblad, zodat dicht gezette dagen meteen zichtbaar zijn (6 november 2026).
 useEffect(()=>{const again=()=>{if(document.visibilityState==='visible')void load(week)};window.addEventListener('focus',again);document.addEventListener('visibilitychange',again);return ()=>{window.removeEventListener('focus',again);document.removeEventListener('visibilitychange',again)}},[week,load]);
 async function act(body:Record<string,unknown>,pot='restaurant'){setBusy(true);setError('');setInfo('');
  try{const r=await fetch('/api/pot-planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pot,van:week,dagen:7,...body})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Opslaan mislukt.');
   if(pot==='restaurant'&&d.days)setData(d);if(d.signals)setSignals(d.signals);else if(body.action==='nodig'||body.action==='inplannen')void fetch('/api/pot-planning?signalen=1',{cache:'no-store'}).then(x=>x.json()).then(x=>setSignals(x.signals||[])).catch(()=>{});
   return d}
  catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.');return null}finally{setBusy(false)}}
 async function shopPlan(day:string,part:string,participantId:string|null){setBusy(true);setError('');setInfo('');
  try{const r=await fetch('/api/leden/winkeldiensten',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inplannen',vanaf:week,day,part,participantId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Opslaan mislukt.');setShop(d)}
  catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.')}finally{setBusy(false)}}
 const shopDay=(day:string)=>shop?.days.find(x=>x.day===day&&x.open);
 // Na het toevoegen van een plek (aantal omhoog) op een dag die nog komt: vragen of het naar de leden mag.
 async function more(d:Day,s:Slot){if(await act({action:'nodig',day:d.day,roleId:s.roleId,count:s.need+1})&&!d.past)setAsk(a=>a&&a.day===d.day?{day:d.day,roleIds:[...new Set([...a.roleIds,s.roleId])]}:{day:d.day,roleIds:[s.roleId]})}
 async function announce(){if(!ask)return;const r=await act({action:'melden',day:ask.day,roleIds:ask.roleIds});if(r){setAsk(null);setInfo(`Verstuurd naar ${r.melding.members} ${r.melding.members===1?'lid':'leden'} (${r.melding.sent} ${r.melding.sent===1?'telefoon':'telefoons'}). Alleen leden die voor die rol zijn aangenomen.`)}}
 const days=(data?.days||[]).filter(d=>closed||d.open||d.slots.some(s=>s.people.length)||d.warnings.length||!!shopDay(d.day));
 const needed=days.reduce((n,d)=>n+(d.open?d.needed:0),0),filled=days.reduce((n,d)=>n+(d.open?d.filled:0),0);
 // Weektaken één keer bovenaan de week: wie ze doet (over de hele week) en of ze ook op gesloten dagen mogen.
 const weekPeople=(roleId:string)=>[...new Map((data?.days||[]).flatMap(d=>d.slots.filter(s=>s.roleId===roleId).flatMap(s=>s.people)).map(p=>[p.participantId,p])).values()];
 const weekLocked=(data?.days||[]).some(d=>d.locked);
 // Weektaken inplannen via de eerste open dag die nog komt (één claim geldt voor de rest van de week).
 const weekDay=(data?.days||[]).find(d=>d.open&&d.hasAgreement&&!d.past&&!d.locked)?.day||null;
 async function allWeekTasks(participantId:string){if(!weekDay)return;const r=await act({action:'weektaken',day:weekDay,participantId});
  if(r?.weektaken)setInfo(`Ingepland voor alle weektaken: ${r.weektaken.claimed.join(', ')}.`+(r.weektaken.skipped.length?` Niet gelukt: ${r.weektaken.skipped.map((x:{name:string;reason:string})=>`${x.name} (${x.reason})`).join('; ')}.`:''))}
 return <section className="card section-gap staff-plan" aria-label="Ledenplanning">
  <div className="row between overview-head" style={{flexWrap:'wrap',gap:8}}><h2>Ledenplanning · restaurant</h2>
   <div className="row" style={{gap:6}}><button type="button" className="btn secondary sm" aria-label="Vorige week" onClick={()=>setWeek(add(week,-7))}>‹</button><button type="button" className="btn secondary sm" onClick={()=>setWeek(monday(amsterdam()))}>Deze week</button><button type="button" className="btn secondary sm" aria-label="Volgende week" onClick={()=>setWeek(add(week,7))}>›</button></div></div>
  <p className="small">Leden claimen een rol via hun eigen link (tabblad Rooster) en melden zich op de dag zelf aan op de tablet bij de werkplek Barista. Alleen wie zich heeft aangemeld telt mee in de restaurantpot. Stippellijn = geclaimd, groen = aanwezig. Op gesloten dagen staan geen plekken, behalve wat je voor die dag zelf zet.{data&&<> Deze week: <b>{filled} van {needed}</b> plekken ingevuld.</>} <Link href="/planning/voorspelling">Voorspelling daggasten aanpassen</Link></p>
  {error&&<div role="alert" className="message">{error}</div>}
  {info&&<div role="status" className="notice info">{info}</div>}
  {signals.length>0&&<div className="staff-signals" aria-label="Signalen ledenplanning">
   {signals.map(s=><div key={s.pot+s.day} className="staff-signal"><div><strong>{label(s.day)} · {s.potName}</strong><span className="small">{s.text}</span>{s.items.length>0&&<span className="small">{s.items.join(' · ')}</span>}</div>
    <div className="action-row"><button type="button" className="btn sm" disabled={busy} onClick={()=>act({action:'signaal',day:s.day,mode:'standaard'},s.pot)}>Standaarddiensten zetten</button><button type="button" className="btn secondary sm" disabled={busy} onClick={()=>act({action:'signaal',day:s.day,mode:'geen'},s.pot)}>Geen diensten nodig</button>{s.pot==='restaurant'&&monday(s.day)!==week&&<button type="button" className="btn ghost sm" onClick={()=>setWeek(monday(s.day))}>Naar die week</button>}</div></div>)}
  </div>}
  {ask&&<div className="staff-ask" role="group" aria-label="Melden aan de leden"><span><strong>Mag dit naar de leden in de pool?</strong> {label(ask.day)}: {ask.roleIds.map(id=>data?.days.flatMap(d=>d.slots).find(s=>s.roleId===id)?.roleName||id).join(', ')}. Alleen leden die voor die rol zijn aangenomen.</span>
   <div className="action-row"><button type="button" className="btn sm" disabled={busy} onClick={announce}>Direct versturen</button><button type="button" className="btn secondary sm" disabled={busy} onClick={()=>{setAsk(null);setInfo('Komt in het weekbericht van vrijdag 12:00 (open plekken van de komende week).')}}>Meenemen in het weekbericht</button><button type="button" className="close" aria-label="Niet melden" onClick={()=>setAsk(null)}>×</button></div></div>}
  {!data?<p className="small">Planning laden…</p>:!data.members.length?<p className="empty">Nog geen leden in de restaurantpot. Zet bij <Link href="/leden">Leden</Link> het onderdeel Restaurant aan op de ledenkaart.</p>:<>
  {data.weekTasks.length>0&&<div className="staff-weektasks"><h3 className="card-title">Weektaken deze week</h3>
   <ul className="staff-roles">{data.weekTasks.map(t=>{const ppl=weekPeople(t.roleId);return <li key={t.roleId} className="staff-weektask">
    <span><b>{t.roleName}</b> <span className="small">· één claim geldt voor alle open dagen van de week</span></span>
    <span className="staff-people">{ppl.length?ppl.map(p=><span key={p.participantId} className={'staff-chip '+p.status}>{p.name}</span>):<span className="staff-chip empty">nog niemand</span>}</span>
    {weekDay&&<select className="staff-add" aria-label={`${t.roleName} inplannen deze week`} value="" disabled={busy} onChange={e=>e.target.value&&act({action:'inplannen',day:weekDay,roleId:t.roleId,participantId:e.target.value})}><option value="">+ inplannen</option>{data.members.filter(m=>!ppl.some(p=>p.participantId===m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
    <label className="checkline small"><input type="checkbox" checked={t.onClosed} disabled={busy||weekLocked} onChange={e=>act({action:'weektaak-gesloten',roleId:t.roleId,on:e.target.checked})}/>Ook op gesloten dagen</label></li>})}</ul>
   {data.weekTasks.length>1&&weekDay&&<p className="small staff-weektasks-all">Eén persoon doet alle weektaken: <select className="staff-add" aria-label="Alle weektaken deze week inplannen" value="" disabled={busy} onChange={e=>e.target.value&&void allWeekTasks(e.target.value)}><option value="">kies een lid</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></p>}</div>}
  <div className="staff-days">{days.map(d=><div key={d.day} className={'staff-day'+(d.day===data.today?' today':'')+(d.open?'':' closed')}>
   <div className="staff-day-head"><strong>{label(d.day)}</strong><span className="small">{d.farmOpen?d.hours:d.extra?'gesloten · met eigen diensten':'gesloten'}</span>
    <span className="small staff-guests">👥 {d.expected.sure} zeker{d.expected.possible?` · +${d.expected.possible} mogelijk`:''}{d.expected.forecast!=null?` · ±${d.expected.forecast} daggasten`:''}</span>
    {d.norm&&<span className="small staff-norm" title="Gasten × € 15 gemiddelde besteding; norm van Bartele. Met de hand gezette plekken gaan voor.">Verwachting ±{d.norm.guests} gasten ≈ € {Math.round(d.norm.omzetCents/100).toLocaleString('nl-NL')} · {d.norm.people} mensen volgens de norm{d.norm.missing.length?` · rol ${d.norm.missing.join(', ')} ontbreekt in de afspraak`:''}</span>}
    {d.open&&d.hasAgreement&&<Pill color={d.filled>=d.needed?'green':'orange'}>{d.filled}/{d.needed} ingevuld</Pill>}{d.locked&&<Pill>week ligt vast</Pill>}</div>
   {d.warnings.map((w,i)=><p key={i} className="staff-warning" role="alert">{w}</p>)}
   {!d.hasAgreement?<p className="small">Nog geen geldige afspraak voor deze dag.</p>:<ul className="staff-roles">{d.slots.filter(s=>!s.week&&(s.need||s.people.length||!d.farmOpen&&closed)).map(s=><li key={s.roleId}>
    <div className="staff-role"><span>{s.roleName}</span>
     {!d.locked&&<span className="staff-need"><button type="button" aria-label={`Minder ${s.roleName} op ${label(d.day)}`} disabled={busy||s.need<=0} onClick={()=>act({action:'nodig',day:d.day,roleId:s.roleId,count:s.need-1})}>−</button><b>{s.need}</b><button type="button" aria-label={`Meer ${s.roleName} op ${label(d.day)}`} disabled={busy||s.need>=10} onClick={()=>more(d,s)}>+</button></span>}</div>
    {editing===d.day+s.roleId?<input className="staff-note-input" autoFocus defaultValue={s.note} maxLength={200} aria-label={`Omschrijving ${s.roleName} op ${label(d.day)}`} placeholder="Bijv. schoonmaak + inrichting"
      onKeyDown={e=>{if(e.key==='Escape')setEditing('');if(e.key==='Enter')(e.target as HTMLInputElement).blur()}} onBlur={e=>{setEditing('');if(e.target.value.trim()!==s.note)void act({action:'omschrijving',day:d.day,roleId:s.roleId,note:e.target.value})}}/>
     :<button type="button" className={'staff-note'+(s.note?'':' empty')} disabled={d.locked} onClick={()=>setEditing(d.day+s.roleId)}>{s.note||'+ omschrijving'}</button>}
    <div className="staff-people">{s.people.map(p=><span key={p.participantId} className={'staff-chip '+p.status} title={p.status==='aanwezig'?'Aangemeld op de tablet':p.offered?'Biedt deze dienst aan voor overname; blijft van dit lid tot iemand hem overneemt':'Geclaimd, nog niet aangemeld'}>{p.name}{p.offered?' (biedt aan)':''}{!d.locked&&<button type="button" aria-label={`${p.name} vrijgeven`} disabled={busy} onClick={()=>act({action:'vrijgeven',day:d.day,roleId:s.roleId,participantId:p.participantId})}>×</button>}</span>)}
     {Array.from({length:s.open},(_,i)=>i===0&&!d.locked&&!d.past?<select key={i} className="staff-add" aria-label={`${s.roleName} inplannen op ${label(d.day)}`} value="" disabled={busy} onChange={e=>e.target.value&&act({action:'inplannen',day:d.day,roleId:s.roleId,participantId:e.target.value})}><option value="">+ inplannen</option>{data.members.filter(m=>!s.people.some(p=>p.participantId===m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>:<span key={i} className="staff-chip empty">vrij</span>)}
    </div></li>)}</ul>}
   {(()=>{const sd=shopDay(d.day);if(!sd||!shop)return null;return <ul className="staff-roles staff-shop" aria-label={`Winkeldiensten ${label(d.day)}`}>{sd.slots.map(x=>{const who=shop.people.find(p=>p.id===x.participantId),future=d.day>=shop.today;return <li key={x.id}>
    <div className="staff-role"><span>Winkel · {x.id==='ochtend'?'eerste':'tweede'} dagdeel</span><span className="small">{x.from}–{x.to}</span></div>
    <div className="staff-people">{who?<span className="staff-chip gepland" title={x.offered?'Biedt dit dagdeel aan voor overname; blijft van dit lid tot iemand het overneemt':'Gekozen door de leverancier'}>{who.name}{x.offered?' (biedt aan)':''}{future&&<button type="button" aria-label={`${who.name} vrijgeven`} disabled={busy} onClick={()=>shopPlan(d.day,x.id,null)}>×</button>}</span>
     :future?<select className="staff-add" aria-label={`Winkel ${x.id==='ochtend'?'eerste':'tweede'} dagdeel inplannen op ${label(d.day)}`} value="" disabled={busy} onChange={e=>e.target.value&&shopPlan(d.day,x.id,e.target.value)}><option value="">+ inplannen</option>{shop.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>:<span className="staff-chip empty">vrij</span>}</div></li>})}</ul>})()}
  </div>)}</div>
  {data.days.some(d=>!d.open)&&<label className="checkline section-gap"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/>Ook gesloten dagen tonen (om daar toch een dienst te zetten)</label>}
  </>}
 </section>;
}
