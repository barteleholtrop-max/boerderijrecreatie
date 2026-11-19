'use client';
// Vandaag & taken: dezelfde gegevens voor de backoffice (app/taken/page.tsx) en het tabblad Vandaag in de managementapp
// (app/taken/telefoon, wens eigenaar 11 november 2026). Alles komt uit de centrale backoffice; niets wordt hier bewaard.
import {useEffect,useState} from 'react';
import {useBackoffice,productAttention} from '../use-backoffice';
export type OverlegTasks={actions:{id:string;text:string;owner:string;due:string|null}[];waiting:{id:string;title:string;status:string;potName:string;needsPotChange:boolean}[]};
export type StaffSignal={pot:string;potName:string;day:string;text:string;items:string[]};
export function useTaken(){
 const {products,ops,loading}=useBackoffice({products:true,operations:true});
 const [overleg,setOverleg]=useState<OverlegTasks|null>(null),[staff,setStaff]=useState<StaffSignal[]>([]);
 useEffect(()=>{fetch('/api/overleg?taken=1',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(setOverleg).catch(()=>{})},[]);
 // Personeelsplanning (wens eigenaar 6 november 2026): extra open dagen en groepen op een dag zonder diensten.
 useEffect(()=>{fetch('/api/pot-planning?signalen=1',{cache:'no-store'}).then(r=>r.ok?r.json():{signals:[]}).then(d=>setStaff(d.signals||[])).catch(()=>{})},[]);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 const low=(ops?.state.ingredients||[]).filter(i=>i.known&&i.stock<i.min),attention=productAttention(products).filter(a=>a.count>0);
 return {loading,today,overleg,staff,low,attention};
}
export const takenDayLabel=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
export const overlegStatus=(status:string)=>status==='aangehouden'?'er is een beter voorstel: kies welke geldt':status==='concept'?'concept: nog versturen naar de leden':'vastgesteld over de verdeling: pas de pot-afspraak aan';
