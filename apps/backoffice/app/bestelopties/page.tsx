'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {PageHead,Pill,Notice,SubTabs,money} from '../ui';
import {StationOpenCard} from './werkplekken-open';
// Eigen bedrag ("Wat is het je waard?") per verkoopcontext and group codes with a maximum budget (owner decision, 3 November 2026).
type Setting={context:string;label:string;enabled:boolean;maxPercent:number;allowZero:boolean;version:number};
type Group={id:string;code:string;name:string;host:string;budgetCents:number;validFrom:string;validUntil:string;status:'actief'|'gesloten';version:number;created:string;spentCents:number;orders:number};
type BillLine={number:string;created:string;totalCents:number;lines:{name:string;quantity:number;totalCents:number}[]};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const nlDate=(d:string)=>d.split('-').reverse().join('-');
const toCents=(v:string)=>{const m=/^\s*€?\s*(\d{1,5})(?:[.,](\d{1,2}))?\s*$/.exec(v);return m?Number(m[1])*100+Number((m[2]||'0').padEnd(2,'0')):NaN};
const pretty=(code:string)=>code.slice(0,4)+'-'+code.slice(4);
async function call(body?:unknown,query=''){
 const r=await fetch('/api/bestelopties'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Er ging iets mis. Ververs en probeer opnieuw.');return d;
}
export default function OrderOptions(){
 const [settings,setSettings]=useState<Setting[]>([]),[groups,setGroups]=useState<Group[]>([]),[orderPage,setOrderPage]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [form,setForm]=useState({name:'',host:'',budget:'',validFrom:today(),validUntil:today()}),[formId,setFormId]=useState(''),[bill,setBill]=useState<{group:Group;lines:BillLine[]}|null>(null),[budgetEdit,setBudgetEdit]=useState<Record<string,string>>({}),[qr,setQr]=useState<{group:Group;image:string}|null>(null);
 async function load(){try{const d=await call();setSettings(d.settings);setGroups(d.groups);setOrderPage(d.orderPage)}catch(e){setMessage((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{setFormId(crypto.randomUUID());load()},[]);
 async function run(work:()=>Promise<string>){if(busy)return;setBusy(true);setMessage('');try{setMessage(await work());await load()}catch(e){setMessage((e as Error).message);await load()}finally{setBusy(false)}}
 const link=(g:Group)=>orderPage+'?groep='+g.code;
 const saveSetting=(s:Setting)=>run(async()=>{await call({action:'instelling',version:s.version,setting:{context:s.context,enabled:s.enabled,maxPercent:s.maxPercent,allowZero:s.allowZero}});return 'Opgeslagen. De bestelpagina gebruikt dit binnen een minuut.'});
 const createGroup=()=>run(async()=>{const budgetCents=toCents(form.budget);if(!form.name.trim())throw Error('Geef de groep een naam, bijvoorbeeld "70 jaar opa Jan".');if(!Number.isSafeInteger(budgetCents)||budgetCents<=0)throw Error('Vul een maximumbedrag in, bijvoorbeeld 250.');
  const d=await call({action:'nieuwe-groep',id:formId,group:{name:form.name.trim(),host:form.host.trim(),budgetCents,validFrom:form.validFrom,validUntil:form.validUntil}});
  setFormId(crypto.randomUUID());setForm({name:'',host:'',budget:'',validFrom:today(),validUntil:today()});return 'Groepscode '+pretty(d.code)+' is klaar. Kopieer de link en deel hem met de gasten.'});
 const change=(g:Group,c:Record<string,unknown>,done:string)=>run(async()=>{await call({action:'wijzig-groep',id:g.id,version:g.version,...c});return done});
 async function copy(g:Group){try{await navigator.clipboard.writeText(link(g));setMessage('Link gekopieerd: '+link(g))}catch{setMessage('Kopiëren lukte niet. Selecteer de link en kopieer hem zelf: '+link(g))}}
 async function showQr(g:Group){setMessage('');try{setQr({group:g,image:await QRCode.toDataURL(link(g),{width:640,margin:2,errorCorrectionLevel:'M',color:{dark:'#263d30',light:'#ffffff'}})})}catch{setMessage('De QR-code kon niet worden gemaakt.')}}
 async function showBill(g:Group){setMessage('');try{setBill({group:g,lines:await call(undefined,'?groep='+g.id)})}catch(e){setMessage((e as Error).message)}}
 return <div data-bb-view="order-options">
  <PageHead eyebrow="VERKOOP · BESTELLEN" title="Eigen bedrag & groepscodes" sub="Laat gasten zelf bepalen wat iets ze waard is, en laat een gastheer de rekening voor een hele groep betalen, met een maximum."/>
  <SubTabs current="/bestelopties" items={[['/werkplekken','Uitgifte per werkplek'],['/kassa','Kassa · bestelling opnemen'],['/bestelopties','Bestelopties & werkplekken']]}/>
  <StationOpenCard/>
  {message&&<div className="message" role="status">{message}</div>}
  <div className="grid two">
   <div className="card"><div className="card-head"><h3 className="card-title">Wat is het je waard?</h3><Pill color="orange">Proef · nog geen betaling</Pill></div>
    <p className="small">De gast ziet eerst de normale waarde. Leeg laten betekent de normale prijs. Normale waarde, gekozen bedrag en verschil worden apart bewaard. Btw wordt berekend over wat werkelijk betaald wordt, per regel naar verhouding; laat dit bevestigen door de boekhouder.</p>
    {loading?<div className="empty">Laden…</div>:settings.map(s=><div className="stack" key={s.context}>
     <label className="checkline"><input type="checkbox" checked={s.enabled} onChange={e=>setSettings(a=>a.map(x=>x.context===s.context?{...x,enabled:e.target.checked}:x))}/> <b>{s.label}</b>: gasten mogen een eigen bedrag kiezen</label>
     <div className="form-grid"><div className="field"><label htmlFor={'max-'+s.context}>Maximum (% van de normale waarde)</label><input id={'max-'+s.context} type="number" min={100} max={1000} step={10} value={s.maxPercent} onChange={e=>setSettings(a=>a.map(x=>x.context===s.context?{...x,maxPercent:Math.round(Number(e.target.value))}:x))}/></div>
      <div className="field"><label>Nul euro</label><label className="checkline"><input type="checkbox" checked={s.allowZero} onChange={e=>setSettings(a=>a.map(x=>x.context===s.context?{...x,allowZero:e.target.checked}:x))}/> € 0,00 mag (wordt apart gemarkeerd)</label></div></div>
     <div><button className="btn" disabled={busy} onClick={()=>saveSetting(s)}>Opslaan</button></div>
    </div>)}
    <div className="divider"></div><p className="small">Bij de kassa, Ite by Boer Bart en de winkel staat een eigen bedrag nog niet aan. Dat komt per verkoopplek, na een eigen besluit.</p>
   </div>
   <div className="card"><div className="card-head"><h3 className="card-title">Nieuwe groepscode</h3></div>
    <p className="small">Bijvoorbeeld het feest van opa: de gasten bestellen met de link en betalen zelf niets. Opa betaalt de hele rekening, tot het maximum. Een bestelling boven het maximum wordt geweigerd.</p>
    <div className="form-grid">
     <div className="field full"><label htmlFor="g-name">Naam van de groep</label><input id="g-name" maxLength={80} placeholder="70 jaar opa Jan" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
     <div className="field"><label htmlFor="g-host">Gastheer (betaalt)</label><input id="g-host" maxLength={80} placeholder="Opa Jan" value={form.host} onChange={e=>setForm({...form,host:e.target.value})}/></div>
     <div className="field"><label htmlFor="g-budget">Maximumbedrag (€)</label><input id="g-budget" inputMode="decimal" placeholder="250" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})}/></div>
     <div className="field"><label htmlFor="g-from">Geldig vanaf</label><input id="g-from" type="date" value={form.validFrom} onChange={e=>setForm({...form,validFrom:e.target.value})}/></div>
     <div className="field"><label htmlFor="g-until">Geldig tot en met</label><input id="g-until" type="date" value={form.validUntil} onChange={e=>setForm({...form,validUntil:e.target.value})}/></div>
    </div>
    <div style={{marginTop:14}}><button className="btn" disabled={busy} onClick={createGroup}>＋ Groepscode maken</button></div>
   </div>
  </div>
  <div className="card section-gap"><div className="card-head"><h3 className="card-title">Groepscodes</h3><Pill>{groups.length}</Pill></div>
   {!loading&&!groups.length?<div className="empty">Nog geen groepscodes.</div>:<div className="table-wrap"><table><thead><tr><th>Groep</th><th>Code & link</th><th>Geldig</th><th>Besteld / maximum</th><th>Status</th><th></th></tr></thead><tbody>{groups.map(g=>{const pct=Math.min(100,Math.round(g.spentCents/g.budgetCents*100));const past=g.validUntil<today();return <tr key={g.id}>
    <td><strong>{g.name}</strong><div className="small">{g.host?'Betaalt: '+g.host:'Gastheer niet ingevuld'}</div></td>
    <td><strong style={{letterSpacing:'.08em'}}>{pretty(g.code)}</strong><div className="small" style={{wordBreak:'break-all'}}>{link(g)}</div><button className="copylink" style={{border:0,background:'none',padding:0}} onClick={()=>copy(g)}>Link kopiëren</button></td>
    <td className="small">{nlDate(g.validFrom)}{g.validFrom!==g.validUntil?' t/m '+nlDate(g.validUntil):''}</td>
    <td style={{minWidth:170}}><div className="small">{money(g.spentCents)} van {money(g.budgetCents)} · {g.orders} {g.orders===1?'bestelling':'bestellingen'}</div><div className="progress" aria-hidden="true"><span style={{width:pct+'%'}}></span></div>
     <div className="row" style={{marginTop:6,gap:6}}><input aria-label={'Nieuw maximum voor '+g.name} inputMode="decimal" placeholder="nieuw max." style={{width:96,padding:'6px 8px'}} value={budgetEdit[g.id]||''} onChange={e=>setBudgetEdit({...budgetEdit,[g.id]:e.target.value})}/><button className="btn sm secondary" disabled={busy||!budgetEdit[g.id]} onClick={()=>{const c=toCents(budgetEdit[g.id]||'');if(!Number.isSafeInteger(c)||c<=0){setMessage('Vul een geldig maximumbedrag in.');return}setBudgetEdit({...budgetEdit,[g.id]:''});change(g,{budgetCents:c},'Maximum aangepast naar '+money(c)+'.')}}>Wijzig</button></div></td>
    <td>{g.status==='gesloten'?<Pill>Gesloten</Pill>:past?<Pill color="orange">Verlopen</Pill>:g.spentCents>=g.budgetCents?<Pill color="red">Maximum bereikt</Pill>:<Pill color="green">Actief</Pill>}</td>
    <td><div className="action-row"><button className="btn sm secondary" onClick={()=>showQr(g)}>QR-code</button><button className="btn sm secondary" onClick={()=>showBill(g)}>Rekening</button>{g.status==='actief'?<button className="btn sm red" disabled={busy} onClick={()=>change(g,{status:'gesloten'},'Groepscode gesloten. Nieuwe bestellingen worden geweigerd.')}>Sluiten</button>:<button className="btn sm secondary" disabled={busy} onClick={()=>change(g,{status:'actief'},'Groepscode weer actief.')}>Heropenen</button>}</div></td>
   </tr>})}</tbody></table></div>}
   <p className="small" style={{marginTop:12}}>Groepsbestellingen gaan direct naar keuken, bar of winkel (de gastheer betaalt achteraf). In deze proef wordt nog niets afgerekend. Met QR-code maak je een afbeelding om te downloaden en af te drukken.</p>
  </div>
  {qr&&<div className="card section-gap" data-bb-view="group-qr"><div className="card-head"><h3 className="card-title">QR-code · {qr.group.name}</h3><div className="action-row"><a className="btn sm" href={qr.image} download={'groepscode-'+qr.group.code+'.png'}>Downloaden</a><button className="btn sm secondary" onClick={()=>setQr(null)}>Sluiten</button></div></div>
   <div className="row" style={{alignItems:'flex-start',flexWrap:'wrap',gap:24}}><img src={qr.image} alt={'QR-code voor '+qr.group.name} width={260} height={260} style={{border:'1px solid var(--border)',borderRadius:12}}/>
    <div className="stack" style={{maxWidth:420}}><p className="small">Zet deze QR-code op een tafelkaartje of in de uitnodiging. Gasten scannen hem met hun telefoon en bestellen op rekening van {qr.group.host||'de gastheer'}.</p><div><div className="small">Code</div><strong style={{letterSpacing:'.08em',fontSize:20}}>{pretty(qr.group.code)}</strong></div><div className="small" style={{wordBreak:'break-all'}}>{link(qr.group)}</div>
     {/^http:\/\/(localhost|127\.0\.0\.1)/.test(orderPage)&&<Notice kind="warn" title="Alleen op deze computer">Deze link wijst naar de proefomgeving op deze computer; een telefoon kan hem niet openen. Start met ./boerbart-test --telefoon voor een link die op de telefoon werkt.</Notice>}</div></div>
  </div>}
  {bill&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Rekening · {bill.group.name}{bill.group.host?' · '+bill.group.host:''}</h3><div className="action-row"><button className="btn sm secondary" onClick={()=>window.print()}>Afdrukken</button><button className="btn sm secondary" onClick={()=>setBill(null)}>Sluiten</button></div></div>
   {!bill.lines.length?<div className="empty">Nog geen bestellingen op deze rekening.</div>:<div className="table-wrap"><table><thead><tr><th>Bestelling</th><th>Tijd</th><th>Wat</th><th>Bedrag</th></tr></thead><tbody>{bill.lines.map(o=><tr key={o.number}><td><strong>{o.number}</strong></td><td className="small">{new Date(o.created).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td className="small">{o.lines.map(l=>l.quantity+'× '+l.name).join(' · ')}</td><td>{money(o.totalCents)}</td></tr>)}<tr><td colSpan={3}><strong>Totaal voor de gastheer</strong></td><td><strong>{money(bill.lines.reduce((s,o)=>s+o.totalCents,0))}</strong></td></tr></tbody></table></div>}
  </div>}
  <div className="section-gap"><Notice kind="info" title="Hoe gasten het gebruiken">Deel de link of de QR-code met de groep. Wie de link opent, ziet bovenaan de bestelpagina op wiens rekening hij bestelt en betaalt zelf niets. Wil een gast toch zelf betalen, dan kiest hij "Toch zelf betalen".</Notice></div>
 </div>
}
