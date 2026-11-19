// Meldingen voor medewerkers (wens eigenaar 9 november 2026). Server only. Een medewerker zet meldingen aan in Gesprekken;
// per login en telefoon één aanmelding (staff_push). Sleutels (VAPID) zoals bij de bestelpagina (lib/push.ts): online uit Cloud Run.
// Alleen wie toegang heeft tot de klantgesprekken (GUEST_ACCESS) krijgt een melding; wie die toegang verliest, krijgt niets meer.
import webpush from 'web-push';
import {getDb} from '@/db';
import {staffPush} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {vapidKeys,subject,PushOff} from './push';
import {parseSubscription,testOrigins} from './push-core';
import {mailAccess,MailError} from './mail-store';
import {enqueue} from './outbox';
import {parseStaffMessage,type StaffMessage} from './staff-push-core';
const now=()=>new Date().toISOString();

/** De openbare sleutel, of null als pushmeldingen (online) uit staan; de pagina zegt dan dat het niet kan. */
export const staffPublicKey=()=>{try{return vapidKeys().publicKey}catch(e){if(e instanceof PushOff)return null;throw e}};
/** Deze telefoon aanmelden voor meldingen van deze login (dezelfde telefoon twee keer verandert niets). */
export async function subscribeStaff(account:string,raw:unknown){
 const s=parseSubscription(raw,testOrigins());
 await getDb().insert(staffPush).values({id:crypto.randomUUID(),account,endpoint:s.endpoint,p256dh:s.p256dh,auth:s.auth,created:now()})
  .onConflictDoUpdate({target:[staffPush.account,staffPush.endpoint],set:{p256dh:s.p256dh,auth:s.auth}});
}
export async function unsubscribeStaff(account:string,endpoint:unknown){
 if(typeof endpoint!=='string'||endpoint.length>1000)throw new MailError('Ongeldige aanvraag.');
 await getDb().delete(staffPush).where(and(eq(staffPush.account,account),eq(staffPush.endpoint,endpoint)));
}
export async function staffHasPush(account:string,endpoint:string){
 if(!endpoint||endpoint.length>1000)return false;
 return (await getDb().select({id:staffPush.id}).from(staffPush).where(and(eq(staffPush.account,account),eq(staffPush.endpoint,endpoint)))).length>0;
}

/** Een melding naar de telefoons van de medewerkers met toegang tot de klantgesprekken. Gooit nooit; geeft het aantal telefoons terug. */
export async function notifyStaff(message:StaffMessage){
 try{
  const db=getDb(),rows=(await db.select().from(staffPush)).filter(r=>mailAccess(r.account).view);if(!rows.length)return 0;
  const keys=vapidKeys();let sent=0;
  for(const r of rows){
   try{
    const d=webpush.generateRequestDetails({endpoint:r.endpoint,keys:{p256dh:r.p256dh,auth:r.auth}},JSON.stringify(message),
     {TTL:12*3600,urgency:'high',vapidDetails:{subject:subject(),publicKey:keys.publicKey,privateKey:keys.privateKey}});
    const res=await fetch(d.endpoint,{method:d.method,headers:d.headers as Record<string,string>,body:d.body as Uint8Array<ArrayBuffer>|null,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw Object.assign(Error('push '+res.status),{statusCode:res.status});
    await db.update(staffPush).set({lastSent:now()}).where(eq(staffPush.id,r.id));sent++;
   }catch(e){const code=(e as {statusCode?:number}).statusCode;if(code===404||code===410)await db.delete(staffPush).where(eq(staffPush.id,r.id))}
  }
  return sent;
 }catch{return 0}
}
/** Vanuit een openbare route (website-aanvraag): via de wachtrij, zodat de gast niet wacht en online niets verloren gaat. */
export async function queueStaffNotice(message:StaffMessage){try{await enqueue('medewerker-melding:'+message.tag,'medewerker-melding',message)}catch{}}
/** Taak in het werkproces (lib/assistant-jobs.ts). */
export async function runStaffNotice(payload:unknown){const m=parseStaffMessage(payload);if(m)await notifyStaff(m)}
