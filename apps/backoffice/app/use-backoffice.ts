'use client';
import {useEffect,useState} from 'react';
import {priceCheckOpen,type SaleLine} from '@/lib/orders';
import type {Ops} from '@/lib/operations-core';
// Read-only access to the central backoffice data for overview pages. Nothing here is a second copy.
export type ProductData={name:string,department:string,priceCents:number,vat:string,station:string,available:boolean,photo:string,check:string,sourceCheck?:string,allergensChecked?:boolean,onStartscherm?:boolean,zelfkassa?:{at:string,labelName:string}};
export type ProductRow={id:string,version:number,draft:ProductData,published:ProductData|null};
// status/paymentStatus come from the order columns; counted and paid* follow the single revenue rule (lib/order-revenue.ts).
export type OrderRow={id:number,number:string,created:string,mode:string,reference:string,totalCents:number,lines:(SaleLine&{paidCents:number,paidVatCents:number})[],status:string,paymentStatus:string,statusLabel:string,counted:boolean,paidCents:number,paidVat9Cents:number,paidVat21Cents:number,paidWith?:{method:string,provider:string,cents:number}[]};
export type OpsPayload={state:Ops,today:string};
// orders: true = latest 100 (kassa view); {van,tot} = every order in that period (YYYY-MM-DD, Europe/Amsterdam).
export type OrderPeriod={van:string,tot:string};
export function useBackoffice(parts:{products?:boolean,orders?:boolean|OrderPeriod,operations?:boolean}){
 const ordersUrl=!parts.orders?null:parts.orders===true?'/api/orders':'/api/orders?'+new URLSearchParams(parts.orders).toString();
 const [products,setProducts]=useState<ProductRow[]>([]),[orders,setOrders]=useState<OrderRow[]>([]),[ops,setOps]=useState<OpsPayload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');const get=async(url:string)=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error();return r.json()};
  Promise.allSettled([parts.products?get('/api/products'):null,ordersUrl?get(ordersUrl):null,parts.operations?get('/api/operations'):null]).then(([p,o,x])=>{if(!live)return;
   if(p.status==='fulfilled'&&p.value)setProducts(p.value);if(o.status==='fulfilled'&&o.value)setOrders(o.value);if(x.status==='fulfilled'&&x.value)setOps(x.value);
   if([p,o,x].some(r=>r.status==='rejected'))setError('Niet alle gegevens konden worden geladen. Getoonde aantallen kunnen onvolledig zijn.');setLoading(false)});
  return()=>{live=false}},[parts.products,ordersUrl,parts.operations]);
 return {products,orders,ops,loading,error};
}
export const amsterdamDay=(iso:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(iso));
export const changed=(r:ProductRow)=>!!r.published&&JSON.stringify(r.draft)!==JSON.stringify(r.published);
// Attention points derived from the central product data, following the agreed product rules.
export function productAttention(products:ProductRow[]){
 const d=products.map(r=>r.draft);
 return [
  {key:'prijs',label:'Prijs controleren',count:d.filter(priceCheckOpen).length,hint:'Uit de oorspronkelijke productlijst'},
  {key:'btw',label:'Btw-tarief ontbreekt',count:d.filter(p=>!p.vat).length,hint:'Publiceren kan pas met btw'},
  {key:'werkafdeling',label:'Werkafdeling ontbreekt',count:d.filter(p=>!['kok','barista','winkel'].includes(p.station)&&!(p.station==='geen'&&(p as {pot?:string}).pot)).length,hint:'Nodig voor kassa en werkplekken; nooit gokken op naam'},
  {key:'allergenen',label:'Allergenen niet gecontroleerd',count:d.filter(p=>!p.allergensChecked).length,hint:'Suggesties zijn nooit een volledige lijst'},
  {key:'gewijzigd',label:'Wijziging niet gepubliceerd',count:products.filter(changed).length,hint:'Concept wijkt af van de gastweergave'},
 ];
}
