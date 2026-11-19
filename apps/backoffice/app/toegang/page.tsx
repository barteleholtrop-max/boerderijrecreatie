'use client';
// Toegang tot de backoffice (inloggen via Supabase, besluiten eigenaar 4 en 6 november 2026). De eigenaar zet hier wie mag
// inloggen: een eigen account per persoon (Google of e-mail en wachtwoord, altijd met Authenticator), met een rol.
// Een eigenaar mag alles; een medewerker alleen de aangevinkte onderdelen (lib/onderdelen.ts). Wie eraf gaat of minder
// mag, merkt dat bij de volgende keer inloggen (uiterlijk na 8 uur). Telefoon kwijt? Een andere eigenaar reset de
// Authenticator. Daaronder de werkplektablets (QR-code) en de vastlegging van gevoelige handelingen.
import {useEffect,useState} from 'react';
import {PageHead,Pill} from '../ui';
import {ONDERDELEN} from '@/lib/onderdelen';
import {Tablets} from './tablets';
import {Telefoons} from './telefoons';
type Account={email:string;name:string;role:'eigenaar'|'medewerker';active:number;lastLogin:string|null;linked:boolean;modules:string[];quickLogin:number};
type Audit={id:string;at:string;account:string;email:string;action:string;path:string;detail:string};
const when=(d:string|null)=>d?new Date(d).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'nog niet';
const label=(k:string)=>ONDERDELEN.find(o=>o.key===k)?.label||k;

function Onderdelen({value,onChange,disabled}:{value:string[];onChange:(v:string[])=>void;disabled?:boolean}){
 return <fieldset className="module-picks" disabled={disabled}><legend>Onderdelen</legend>
  {ONDERDELEN.map(o=><label key={o.key} title={o.uitleg}><input type="checkbox" checked={value.includes(o.key)} onChange={e=>onChange(e.target.checked?[...value,o.key]:value.filter(k=>k!==o.key))}/>{o.label}</label>)}
 </fieldset>;
}

export default function Toegang(){
 const [list,setList]=useState<Account[]|null>(null),[audit,setAudit]=useState<Audit[]>([]),[login,setLogin]=useState(false),[reset,setReset]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[role,setRole]=useState<'eigenaar'|'medewerker'>('medewerker'),[mods,setMods]=useState<string[]>([]);
 const [editing,setEditing]=useState<string|null>(null),[editMods,setEditMods]=useState<string[]>([]);
 async function load(){try{const r=await fetch('/api/toegang',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setList(d.accounts);setAudit(d.vastlegging||[]);setLogin(d.login);setReset(d.reset)}catch(e){setMsg((e as Error).message)}}
 useEffect(()=>{void load()},[]);
 async function post(body:object,done:string){setBusy(true);setMsg('');try{const r=await fetch('/api/toegang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);setMsg(done);await load();return true}catch(e){setMsg((e as Error).message);return false}finally{setBusy(false)}}
 const save=(a:Account,change:Partial<Account>,done:string)=>post({action:'opslaan',email:a.email,name:a.name,role:a.role,active:!!a.active,modules:a.modules,quick:!!a.quickLogin,...change,...('active' in change?{active:!!change.active}:{}),...('quickLogin' in change?{quick:!!change.quickLogin}:{})},done);
 return <div>
  <PageHead eyebrow="SYSTEEM" title="Toegang" sub="Wie mag inloggen op de backoffice, en wat mag iemand openen. Iedereen logt in met een eigen account (Google, of e-mail en wachtwoord) en daarna altijd met de code uit de Authenticator-app."/>
  <div className="notice info"><div><strong>{login?'Inloggen staat aan.':'Inloggen staat op deze server nog uit.'}</strong> Een eigenaar mag alles. Een medewerker mag alleen de onderdelen die je aanvinkt; de rest blijft dicht, ook als iemand het adres zelf intypt. Beheer (bedrijfsgegevens, koppelingen en deze lijst) is altijd alleen voor eigenaren. Een wijziging geldt bij de volgende keer inloggen (uiterlijk na 8 uur). Wie geen Google-account heeft, kiest op het inlogscherm „Account aanmaken” met hetzelfde e-mailadres.</div></div>
  <section className="card section-gap"><h3 className="card-title">Persoon toevoegen</h3>
   <form className="stack" onSubmit={async e=>{e.preventDefault();if(await post({action:'opslaan',email,name,role,active:true,modules:role==='eigenaar'?[]:mods},email+' kan nu inloggen.')){setEmail('');setName('');setMods([])}}}>
    <div className="action-row" style={{flexWrap:'wrap',alignItems:'flex-end'}}>
     <label>E-mailadres (Google-account of eigen adres)<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="naam@gmail.com"/></label>
     <label>Naam<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="bijv. Sanne"/></label>
     <label>Rol<select value={role} onChange={e=>setRole(e.target.value as 'eigenaar'|'medewerker')}><option value="medewerker">Medewerker</option><option value="eigenaar">Eigenaar (alles)</option></select></label>
    </div>
    {role==='medewerker'&&<Onderdelen value={mods} onChange={setMods}/>}
    <div><button className="btn" disabled={busy}>Toevoegen</button></div>
   </form>
  </section>
  <section className="card section-gap"><h3 className="card-title">Op de lijst</h3>
   {!list?<p>Laden…</p>:<div className="table-wrap"><table><thead><tr><th>E-mailadres</th><th>Naam</th><th>Rol</th><th>Onderdelen</th><th>Laatst ingelogd</th><th/></tr></thead><tbody>
    {list.map(a=><tr key={a.email}><td><strong>{a.email}</strong>{!a.active&&<> <Pill color="orange">uitgezet</Pill></>}{!!a.quickLogin&&<> <Pill color="blue">zonder code binnen</Pill></>}</td><td>{a.name}</td>
     <td><select aria-label={'Rol van '+a.email} value={a.role} disabled={busy} onChange={e=>void save(a,{role:e.target.value as Account['role']},'Rol aangepast.')}><option value="medewerker">Medewerker</option><option value="eigenaar">Eigenaar</option></select></td>
     <td>{a.role==='eigenaar'?<span className="small">Alles</span>:editing===a.email?<div className="stack"><Onderdelen value={editMods} onChange={setEditMods} disabled={busy}/>
       <div className="action-row"><button className="btn sm" disabled={busy} onClick={async()=>{if(await save(a,{modules:editMods},'Onderdelen van '+a.email+' opgeslagen.'))setEditing(null)}}>Opslaan</button><button className="btn sm secondary" onClick={()=>setEditing(null)}>Annuleren</button></div></div>
      :<div className="stack"><span className="small">{a.modules.length?a.modules.map(label).join(', '):'Nog geen'}</span><button className="btn sm secondary" disabled={busy} onClick={()=>{setEditing(a.email);setEditMods(a.modules)}}>Wijzigen</button></div>}</td>
     <td className="small">{when(a.lastLogin)}</td>
     <td><div className="action-row">
      {/* Zonder code binnenkomen (wens eigenaar 13 november 2026). Gevoelige handelingen vragen de code altijd wel. */}
      <button className="btn sm secondary" disabled={busy} title={a.quickLogin?'Bij binnenkomen weer de code uit de Authenticator-app vragen.':'Binnenkomen met alleen Google of wachtwoord. Gevoelige handelingen (toegang, bank, Bloei, koppelingen) vragen de code wel.'}
       onClick={()=>void save(a,{quickLogin:a.quickLogin?0:1},a.quickLogin?a.email+' vult bij binnenkomen weer de code in.':a.email+' komt binnen zonder code; gevoelige handelingen vragen de code wel.')}>{a.quickLogin?'Code bij binnenkomen':'Zonder code binnen'}</button>
      <button className="btn sm secondary" disabled={busy} onClick={()=>void save(a,{active:a.active?0:1},a.active?a.email+' is uitgezet.':a.email+' kan weer inloggen.')}>{a.active?'Uitzetten':'Weer aanzetten'}</button>
      {a.linked&&<button className="btn sm secondary" disabled={busy||!reset} title={reset?'Telefoon kwijt: de Authenticator weghalen; bij de volgende login koppelt deze persoon een nieuwe app.':'Vraagt SUPABASE_SERVICE_ROLE_KEY op de server'} onClick={()=>{if(confirm('Authenticator van '+a.email+' resetten? Bij de volgende keer inloggen koppelt deze persoon een nieuwe app.'))void post({action:'code-resetten',email:a.email},'De Authenticator van '+a.email+' is gereset.')}}>Authenticator resetten</button>}
      <button className="btn sm red" disabled={busy} onClick={()=>{if(confirm(a.email+' van de lijst halen?'))void post({action:'verwijderen',email:a.email},a.email+' staat niet meer op de lijst.')}}>Verwijderen</button>
     </div></td></tr>)}
   </tbody></table></div>}
  </section>
  {msg&&<p role="status" className="message">{msg}</p>}
  <Tablets/>
  <Telefoons/>
  <section className="card section-gap"><h3 className="card-title">Vastlegging van gevoelige handelingen</h3>
   <p className="small">Toegang wijzigen, bankverdeling en uitbetalen, Bloei, koppelingen, proefgegevens en handelen namens een lid. Hiervoor vraagt de backoffice opnieuw de code als de laatste langer dan 10 minuten geleden is. Deze lijst kan niet worden gewijzigd; de laatste 50 staan hier.</p>
   {!audit.length?<p className="small">Nog niets vastgelegd.</p>:<div className="table-wrap"><table><thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Details</th></tr></thead><tbody>
    {audit.map(r=><tr key={r.id}><td className="small">{when(r.at)}</td><td>{r.email||r.account}</td><td>{r.action}</td><td className="small" style={{maxWidth:360,overflowWrap:'anywhere'}}>{r.detail}</td></tr>)}
   </tbody></table></div>}
  </section>
 </div>;
}
