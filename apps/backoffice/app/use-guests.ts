'use client';
import {useEffect,useState,useCallback} from 'react';
import type {GuestState} from '@/lib/guest-core';
export type GuestData={state:GuestState;version:number;account:string;permissions:{manage:boolean;send:boolean;calendar:boolean;mailboxes:string[]};mail:{view:boolean;send:boolean};ai:boolean;mollie?:boolean;orderCards?:import('@/lib/guest-customers').CardOrders[];signups?:{id:string;event_id:string;name:string;email:string;phone:string;people:number;note:string;status:string;created:string;amount_cents:number;payment_status:string;paid_by:string;hold_until:string|null;confirmation:string;confirmation_error:string|null}[]};
export function useGuests(){const [data,setData]=useState<GuestData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await fetch('/api/gasten',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);},[]);
 useEffect(()=>{load().catch(e=>setError(e.message))},[load]);
 async function act(body:Record<string,unknown>){if(busy)throw Error('Er loopt al een actie.');setBusy(true);setError('');try{const r=await fetch('/api/gasten',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:data?.version,requestId:crypto.randomUUID(),...body})}),d=await r.json();if(!r.ok)throw Error(d.error);await load();return d}catch(e){setError(e instanceof Error?e.message:'Actie mislukt.');throw e}finally{setBusy(false)}}
 const reload=useCallback(()=>load().catch(e=>setError(e.message)),[load]);
 return {data,error,busy,act,reload};
}
