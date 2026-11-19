'use client';
// Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek waar alles over het bedrijf staat. Naam, adres, contact,
// KvK, vestigingsnummer, btw, IBAN, BIC en online kanalen. Facturen, verkoopoverzicht en de website lezen het hier;
// daarom geen kopieën elders (centrale backoffice als enige bron). Alleen de eigenaar kan wijzigen.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {PageHead,Pill} from '../ui';
import {useGuests} from '../use-guests';
import {LEGAL_FORMS} from '@/lib/guest-core';
type Field={key:string;label:string;placeholder?:string;type?:string;max?:number;mode?:'numeric'|'decimal'|'email'|'tel'|'url';hint?:string;options?:readonly string[]};
type Section={title:string;use:string;fields:Field[]};
const SECTIONS:Section[]=[
 {title:'Bedrijf',use:'Op facturen, het verkoopoverzicht en in de kop van documenten.',fields:[
  {key:'tradeName',label:'Handelsnaam',placeholder:'Boerderijrecreatie',max:100,hint:'Leeg = Boerderijrecreatie.'},
  {key:'legalName',label:'Statutaire of juridische naam',placeholder:'Zoals bij de KvK ingeschreven',max:150,hint:'Alleen invullen als die anders is dan de handelsnaam; dan staat die er op de factuur tussen haakjes bij.'},
  {key:'legalForm',label:'Rechtsvorm',options:LEGAL_FORMS},
  {key:'owners',label:'Eigenaren of contactpersonen',placeholder:'Jan en Sanne Jansen',max:150}]},
 {title:'Adres',use:'Onderaan elke websitepagina, voor zoekmachines en op facturen.',fields:[
  {key:'street',label:'Straat en huisnummer',placeholder:'Dorpsstraat 1',max:120},
  {key:'postalCode',label:'Postcode',placeholder:'1234 AB',max:7},
  {key:'city',label:'Plaats',placeholder:'Rotstergaast',max:80}]},
 {title:'Contact',use:'Telefoon, e-mail en WhatsApp staan onderaan elke websitepagina en op facturen. Leeg = niet tonen.',fields:[
  {key:'phone',label:'Telefoon',type:'tel',placeholder:'0513 123 456',max:20},
  {key:'email',label:'E-mail voor gasten',type:'email',placeholder:'info@example.nl',max:200},
  {key:'whatsapp',label:'WhatsApp',type:'tel',placeholder:'06 12 34 56 78',max:20},
  {key:'adminEmail',label:'E-mail administratie',type:'email',placeholder:'administratie@example.nl',max:200,hint:'Voor leveranciers en de boekhouding. Niet op de website.'}]},
 {title:'Registratie',use:'Op facturen. Niet op de website.',fields:[
  {key:'kvk',label:'KvK-nummer',mode:'numeric',placeholder:'12345678',max:8},
  {key:'establishmentNumber',label:'Vestigingsnummer',mode:'numeric',placeholder:'12 cijfers',max:12},
  {key:'vatNumber',label:'Btw-nummer',placeholder:'NL123456789B01',max:14}]},
 {title:'Bank',use:'Op elke factuur, naast de betaallink, zodat klanten ook kunnen overmaken.',fields:[
  {key:'iban',label:'IBAN',placeholder:'NL91 ABNA 0417 1643 00',max:42},
  {key:'ibanName',label:'Ten name van',placeholder:'Boerderijrecreatie',max:70,hint:'Zoals de bank de rekening kent.'},
  {key:'bic',label:'BIC',placeholder:'BUNQNL2A',max:11,hint:'Alleen nodig voor betalingen uit het buitenland.'}]},
 {title:'Tarieven op de website',use:'Vaste prijzen die de website noemt en die geen product in de kassa of webwinkel zijn. Bedrag in euro, bijvoorbeeld 9 of 62,50. Leeg = de website noemt geen prijs.',fields:[
  {key:'priceEntreeKind',label:'Entree speelboerderij, per kind (1–10 jaar)',mode:'decimal',placeholder:'9',max:8},
  {key:'priceKinderfeest',label:'Kinderfeest, per kind',mode:'decimal',placeholder:'14',max:8},
  {key:'priceSchoolreisje',label:'Schoolreisje, per kind',mode:'decimal',placeholder:'17',max:8},
  {key:'priceIte',label:'Ite by Boerderijrecreatie, per persoon (exclusief wijn)',mode:'decimal',placeholder:'62,50',max:8}]},
 {title:'Online',use:'Voor de website en marketing. Alleen adressen die met https:// beginnen.',fields:[
  {key:'website',label:'Website',type:'url',placeholder:'https://www.example.nl',max:300},
  {key:'instagram',label:'Instagram',type:'url',placeholder:'https://www.instagram.com/…',max:300},
  {key:'facebook',label:'Facebook',type:'url',placeholder:'https://www.facebook.com/…',max:300}]},
];
const KEYS=SECTIONS.flatMap(s=>s.fields.map(f=>f.key));
const clean=(k:string,v:string)=>k==='vatNumber'||k==='bic'?v.replace(/\s/g,'').toUpperCase():k==='iban'?v.replace(/\s/g,'').toUpperCase():v.trim();
type Company={iban:string;ibanName:string;ibanFromSettings:boolean};
export default function Bedrijfsgegevens(){
 const {data,error,busy,act}=useGuests(),[values,setValues]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[fallback,setFallback]=useState<Company|null>(null);
 const can=!!data?.permissions.manage;
 useEffect(()=>{if(!data)return;const c=(data.state.contact||{}) as Record<string,string>;setValues(Object.fromEntries(KEYS.map(k=>[k,String(c[k]||'')])));},[data]);
 // Een IBAN dat nog bij Koppelingen & printers → Facturen stond, vullen we voor: dan hoeft het niet opnieuw getypt.
 useEffect(()=>{fetch('/api/bedrijfsgegevens',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d?.company&&setFallback(d.company)).catch(()=>{})},[]);
 useEffect(()=>{if(fallback?.ibanFromSettings)setValues(v=>v.iban?v:{...v,iban:fallback.iban,ibanName:v.ibanName||fallback.ibanName})},[fallback,data]);
 async function save(){setMessage('');try{await act({action:'contact',contact:Object.fromEntries(KEYS.map(k=>[k,clean(k,values[k]||'')]))});setMessage('Bedrijfsgegevens opgeslagen. Facturen en de website gebruiken ze meteen.');setFallback(f=>f&&{...f,ibanFromSettings:false})}catch{}}
 const filled=KEYS.filter(k=>values[k]).length;
 return <div data-bb-view="bedrijfsgegevens">
  <PageHead eyebrow="HET FUNDAMENT" title="Bedrijfsgegevens" sub="Eén plek voor naam, adres, contact, KvK, btw, IBAN en online kanalen. Facturen, het verkoopoverzicht en de website halen het hier vandaan."><Pill color={filled>=12?'green':'orange'}>{filled} van {KEYS.length} ingevuld</Pill></PageHead>
  {!data&&!error&&<p className="small">Laden…</p>}
  {error&&<div className="message" role="alert">{error}</div>}
  {message&&!error&&<div className="message" role="status">{message}</div>}
  {data&&!can&&<p className="notice warn">Alleen de eigenaar kan de bedrijfsgegevens wijzigen. Je kunt ze hier wel bekijken.</p>}
  {fallback?.ibanFromSettings&&<p className="notice">Het IBAN {fallback.iban} stond nog bij Koppelingen & printers → Facturen. Het staat hieronder al ingevuld; sla op om het hier te bewaren.</p>}
  {data&&<form onSubmit={e=>{e.preventDefault();save()}}>
   <div className="grid two">{SECTIONS.map(s=><section className="card" key={s.title}><h2>{s.title}</h2><p className="small">{s.use}</p>
    <div className="guest-form" style={{alignItems:"start"}}>{s.fields.map(f=><label key={f.key}>{f.label}
     {f.options?<select aria-label={f.label} value={values[f.key]||''} disabled={!can} onChange={e=>setValues({...values,[f.key]:e.target.value})}><option value="">Kies…</option>{f.options.map(o=><option key={o} value={o}>{o}</option>)}</select>
     :<input name={f.key} type={f.type||'text'} inputMode={f.mode} maxLength={f.max} placeholder={f.placeholder} value={values[f.key]||''} disabled={!can} onChange={e=>setValues({...values,[f.key]:e.target.value})}/>}
     {f.hint&&<small className="small">{f.hint}</small>}</label>)}</div></section>)}</div>
   <div className="section-gap" style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button className="btn" disabled={busy||!can}>{busy?'Bezig…':'Bedrijfsgegevens opslaan'}</button><Link className="btn secondary" href="/financien/facturen">Facturen bekijken</Link></div>
  </form>}
 </div>;
}
