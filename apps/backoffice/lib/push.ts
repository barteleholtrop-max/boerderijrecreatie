// Pushmelding "Je bestelling staat klaar": opslag en versturen. Regels in lib/push-core.ts.
// Sleutels (VAPID): VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY uit .env.local als die er staan; anders maakt de backoffice
// ze één keer zelf aan in de gegevensmap op deze computer (push-sleutels.json, alleen leesbaar voor de eigenaar).
// Online (Cloud Run) nooit zelf aanmaken (#157): de schijf daar is tijdelijk en elke server zou eigen sleutels krijgen, zodat
// aangemelde telefoons na een herstart stil niets meer ontvangen. Zonder de twee instellingen staan pushmeldingen daar uit.
// De geheime sleutel komt nooit in Git en wordt nooit naar de browser gestuurd.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import webpush from 'web-push';
import {env} from '@/lib/portable/env';
import {durableRequired} from '@/lib/portable/durable';
import {RETENTION_MS,readyMessage,sentList,withSent,withoutSent,type PushSubscription} from './push-core';

type Keys={publicKey:string;privateKey:string};
export class PushOff extends Error{constructor(){super('Pushmeldingen staan uit: VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY zijn online niet ingesteld (zie docs/CLOUD-RUN.md).')}}
let cached:Keys|null=null;
export function vapidKeys():Keys{
 if(cached)return cached;
 const pub=process.env.VAPID_PUBLIC_KEY?.trim(),priv=process.env.VAPID_PRIVATE_KEY?.trim();
 if(pub&&priv)return cached={publicKey:pub,privateKey:priv};
 if(durableRequired())throw new PushOff();
 const dir=path.resolve(process.env.APP_DATA_DIR||path.join(process.cwd(),'var')),file=path.join(dir,'push-sleutels.json');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 try{fs.writeFileSync(file,JSON.stringify(webpush.generateVAPIDKeys()),{mode:0o600,flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}
 const k=JSON.parse(fs.readFileSync(file,'utf8')) as Keys;
 if(!k.publicKey||!k.privateKey)throw Error('push-sleutels.json is onvolledig.');
 return cached=k;
}
export const subject=()=>process.env.VAPID_SUBJECT?.trim()||'https://www.boerbart.nl';

async function removeExpired(now=new Date()){await env.DB.prepare(`DELETE FROM push_subscriptions WHERE expires<?`).bind(now.toISOString()).run()}

/** Saves the guest's subscription for one order (the same phone twice changes nothing). */
export async function subscribe(orderId:number,s:PushSubscription,now=new Date()){
 await removeExpired(now);
 await env.DB.prepare(`INSERT INTO push_subscriptions(id, order_id, endpoint, p256dh, auth, created, expires, sent) VALUES(?,?,?,?,?,?,?,'')
  ON CONFLICT(order_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`)
  .bind(randomUUID(),orderId,s.endpoint,s.p256dh,s.auth,now.toISOString(),new Date(now.getTime()+RETENTION_MS).toISOString()).run();
}

/** Een eigen melding naar de telefoons van één bestelling, één keer per tag (bijvoorbeeld meebetalen aan een rekening).
 *  url: de pagina die opent als de gast op de melding tikt (alleen binnen de bestelpagina). Gooit nooit. */
export async function notifyOrder(orderId:number,tag:string,message:{title:string;body:string;url?:string}){
 try{
  await removeExpired();
  const rows=(await env.DB.prepare(`SELECT id, endpoint, p256dh, auth, sent FROM push_subscriptions WHERE order_id=?`).bind(orderId).all()).results as {id:string;endpoint:string;p256dh:string;auth:string;sent:string}[];
  const keys=vapidKeys();let sent=0;
  for(const r of rows.filter(x=>!sentList(x.sent).includes(tag))){
   const claim=await env.DB.prepare(`UPDATE push_subscriptions SET sent=? WHERE id=? AND sent=?`).bind(withSent(r.sent,tag),r.id,r.sent).run();
   if(claim.meta.changes!==1)continue;
   try{
    const d=webpush.generateRequestDetails({endpoint:r.endpoint,keys:{p256dh:r.p256dh,auth:r.auth}},JSON.stringify({...message,tag}),
     {TTL:86400,urgency:'normal',vapidDetails:{subject:subject(),publicKey:keys.publicKey,privateKey:keys.privateKey}});
    const res=await fetch(d.endpoint,{method:d.method,headers:d.headers as Record<string,string>,body:d.body as Uint8Array<ArrayBuffer>|null,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw Object.assign(Error('push '+res.status),{statusCode:res.status});
    sent++;
   }catch(e){const code=(e as {statusCode?:number}).statusCode;if(code===404||code===410)await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id=?`).bind(r.id).run()}
  }
  return sent;
 }catch{return 0}
}

/** A work station pressed Gereed: tell the guest, once per station. Never throws; a failure only means no notification. */
/** Terughalen (melding eigenaar 14 november 2026: „na een foutje terughalen stuurt hij geen berichtje meer”): vergeet dat deze
 *  werkplek al een melding stuurde, zodat het volgende Gereed er weer een stuurt. Gooit nooit. */
export async function resetReady(orderId:number,station:string){
 try{
  const rows=(await env.DB.prepare(`SELECT id, sent FROM push_subscriptions WHERE order_id=?`).bind(orderId).all()).results as {id:string;sent:string}[];
  for(const r of rows.filter(x=>sentList(x.sent).includes(station)))await env.DB.prepare(`UPDATE push_subscriptions SET sent=? WHERE id=? AND sent=?`).bind(withoutSent(r.sent,station),r.id,r.sent).run();
 }catch{}
}
export async function notifyReady(orderId:number,station:string,round?:number){
 try{
  await removeExpired();
  const rows=(await env.DB.prepare(`SELECT id, endpoint, p256dh, auth, sent FROM push_subscriptions WHERE order_id=?`).bind(orderId).all()).results as {id:string;endpoint:string;p256dh:string;auth:string;sent:string}[];
  const todo=rows.filter(r=>!sentList(r.sent).includes(station));if(!todo.length)return 0;
  const keys=vapidKeys(),message=readyMessage(station,'P'+String(orderId).padStart(5,'0'),round);
  let sent=0;
  for(const r of todo){
   // Claim first, so two quick clicks never send twice.
   const claim=await env.DB.prepare(`UPDATE push_subscriptions SET sent=? WHERE id=? AND sent=?`).bind(withSent(r.sent,station),r.id,r.sent).run();
   if(claim.meta.changes!==1)continue;
   try{
    // web-push encrypts and signs; we send it ourselves: no redirects, at most 5 seconds.
    const d=webpush.generateRequestDetails({endpoint:r.endpoint,keys:{p256dh:r.p256dh,auth:r.auth}},JSON.stringify(message),
     {TTL:3600,urgency:'high',vapidDetails:{subject:subject(),publicKey:keys.publicKey,privateKey:keys.privateKey}});
    const res=await fetch(d.endpoint,{method:d.method,headers:d.headers as Record<string,string>,body:d.body as Uint8Array<ArrayBuffer>|null,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw Object.assign(Error('push '+res.status),{statusCode:res.status});
    sent++;
   }catch(e){
    const code=(e as {statusCode?:number}).statusCode;
    console.error('Pushmelding niet afgeleverd',{orderId,station,code:code??null,error:(e as Error).message});
    // Gone at the push service (the guest switched notifications off): forget this phone.
    if(code===404||code===410)await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id=?`).bind(r.id).run();
   }
  }
  return sent;
 }catch{return 0}
}
