'use client';
// Kleine melding op de startpagina (besluit eigenaar 4 november 2026): een deelnemer heeft zelf een product toegevoegd
// (staat al live) of vraagt een nieuw rekeningnummer. Afhandelen gebeurt bij Boerderijwinkel → Deelnemers.
import Link from 'next/link';
import {useEffect,useState} from 'react';
type Req={id:string;kind:string;productName?:string|null};
export function DeelnemerMeldingen(){
 const [list,setList]=useState<Req[]>([]);
 useEffect(()=>{let on=true;fetch('/api/cooperatie?meldingen=1',{cache:'no-store'}).then(r=>r.ok?r.json():{requests:[]}).then(d=>{if(on)setList(Array.isArray(d.requests)?d.requests:[])}).catch(()=>{});return()=>{on=false}},[]);
 if(!list.length)return null;
 const fresh=list.filter(r=>r.kind==='nieuw-product'||r.kind==='product-gewijzigd'),gone=list.filter(r=>r.kind==='product-weg'),old=list.filter(r=>r.kind==='oude-voorraad'),other=list.length-fresh.length-gone.length-old.length;
 return <div className="notice info section-gap"><div><strong>{fresh.length?`${fresh.length} nieuw${fresh.length===1?'':'e'} of aangepast${fresh.length===1?'':'e'} product${fresh.length===1?'':'en'} van deelnemers`:''}{gone.length?`${fresh.length?' · ':''}${gone.length} product${gone.length===1?'':'en'} niet meer geleverd`:''}{old.length?`${fresh.length||gone.length?' · ':''}${old.length} antwoord${old.length===1?'':'en'} over oude voorraad`:''}{(fresh.length||gone.length||old.length)&&other?' · ':''}{other?`${other} verzoek${other===1?'':'en'} van deelnemers`:''}</strong>
  {fresh.length?<>{fresh.slice(0,3).map(r=>r.productName).join(', ')}{fresh.length>3?' …':''}. Staat al in de winkel; kijk even of naam, prijs, foto en allergenen kloppen. </>:null}
  <Link className="copylink" href="/financien/weekafsluiting">Bekijken →</Link></div></div>;
}
