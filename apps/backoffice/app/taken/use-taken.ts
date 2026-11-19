'use client';
// Vandaag & taken: dezelfde gegevens voor de backoffice (app/taken/page.tsx) en het tabblad Vandaag in de managementapp
// (app/taken/telefoon, wens eigenaar 11 november 2026). Alles komt uit de centrale backoffice; niets wordt hier bewaard.
import {useEffect,useState} from 'react';
import {useBackoffice,productAttention} from '../use-backoffice';
export function useTaken(){
 const {products,ops,loading}=useBackoffice({products:true,operations:true});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 const low=(ops?.state.ingredients||[]).filter(i=>i.known&&i.stock<i.min),attention=productAttention(products).filter(a=>a.count>0);
 return {loading,today,low,attention};
}
export const takenDayLabel=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
