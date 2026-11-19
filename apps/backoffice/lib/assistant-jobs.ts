// Background jobs of the Weekassistent and the worker loop that runs them.
import {env} from '@/lib/portable/env';
import {enqueue,runDueJobs,type JobHandler} from './outbox';
import {retentionCutoff,amsterdamDate,CLEANUP_AUDIO_SQL,CLEANUP_SQL,CLEANUP_JOBS_SQL} from './assistant-core';

/** Removes conversations, transcripts and voice recordings older than 14 days. Menus, proposals and decisions stay. */
export async function cleanupConversations(now=new Date()){
 const cutoff=retentionCutoff(now);
 const audio=await env.DB.prepare(CLEANUP_AUDIO_SQL).bind(cutoff).all();
 for(const r of audio.results as {k:string}[])await env.BUCKET.delete(r.k); // files first: a retry after a crash finds the rows again
 const statements=[
  ...CLEANUP_SQL.map(q=>env.DB.prepare(q).bind(cutoff)),
  env.DB.prepare(CLEANUP_JOBS_SQL).bind(retentionCutoff(now,30)),
 ];
 await env.DB.batch(statements);
}

export const jobHandlers:Record<string,JobHandler>={
 // Betaalverzoeken van bunq (10 november 2026): open verzoeken nakijken, zodat betaalde bestellingen ook doorgaan als de gast de pagina sloot.
 'online-betalingen':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {refreshOpenBunqPayments}=await import('./online-payments');await refreshOpenBunqPayments();const {refreshOpenBunqShares}=await import('./group-bill');await refreshOpenBunqShares()})},
 'opruimen-gesprekken':async()=>cleanupConversations(),
 // Google Bedrijfsprofiel: openingstijden, afwijkende dagen en evenementen (lib/google-profile.ts).
 'google-profiel-sync':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {syncProfile}=await import('./google-profile');await syncProfile()})},
 // Google Agenda's: concept-aanvragen/opties en evenementen (lib/mail-calendar.ts).
 'agenda-sync':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {syncCalendars}=await import('./mail-calendar');await syncCalendars()})},
 // Bevestigingsmail voor een aanmelding bij een evenement (lib/event-signups.ts).
 'aanmelding-bevestiging':async payload=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {sendConfirmation}=await import('./event-signups');await sendConfirmation(String((payload as {id?:unknown})?.id||''))})},
 // Annuleringsmail als een evenement van een lid niet doorgaat (lib/event-signups.ts, wens eigenaar 9 november 2026).
 'aanmelding-annulering':async payload=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {sendCancellation}=await import('./event-signups');await sendCancellation(payload)})},
 // Klantgesprekken: Gmail synchronisation (idempotent per 5-minute window; see lib/mail-store.ts).
 'gmail-sync':async payload=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {syncMailbox}=await import('./mail-store');const r=await syncMailbox({full:(payload as {full?:boolean})?.full===true});if(!r.ok&&r.error)throw Error(r.error)})},
 // Meldingen voor medewerkers bij een nieuwe aanvraag via de website (lib/staff-push.ts, wens eigenaar 9 november 2026).
 'medewerker-melding':async payload=>{const {runStaffNotice}=await import('./staff-push');await runStaffNotice(payload)},
 // Facturen uit de mail: nieuwe mails met het label „Inkoop” in de factuurmailbox ophalen (lib/invoice-mail.ts).
 'factuurmail-sync':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {syncInvoiceMail}=await import('./invoice-mail');const r=await syncInvoiceMail();if(!r.ok&&r.error)throw Error(r.error)})},
 // Google Drive als beeldbank: nieuwe foto's uit de Drive-map naar de beeldbibliotheek (lib/drive.ts).
 'drive-sync':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {syncDrive}=await import('./drive');const r=await syncDrive();if(!r.ok&&'error' in r&&r.error)throw Error(r.error)})},
 // Factuurmail van een gezamenlijke rekening (lib/group-bill.ts): voldaan, of nog te betalen de dag na het bezoek.
 'rekening-mail':async payload=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {sendBillMail}=await import('./group-bill');const p=payload as {id?:unknown;kind?:unknown;attempt?:unknown};await sendBillMail(String(p?.id||''),p?.kind==='open'?'open':'voldaan',String(p?.attempt||'1'))})},
 'rekeningen-ronde':async()=>{const {withConnectionSettings}=await import('./connection-settings');await withConnectionSettings(async()=>{const {mailOverdueBills}=await import('./group-bill');await mailOverdueBills()})},
 'assistent-antwoord':async payload=>{const {answerThread}=await import('./assistant-store');await answerThread(String((payload as {threadId?:unknown})?.threadId||''))},
 // Backoffice-assistent (typbalk onderaan elk scherm, lib/hulp-store.ts).
 'hulp-antwoord':async payload=>{const {answerHulpThread}=await import('./hulp-store');await answerHulpThread(String((payload as {threadId?:unknown})?.threadId||''))},
};

const shared=globalThis as typeof globalThis&{__boerBartWorker?:ReturnType<typeof setInterval>};
let busy=false,again=false;
/** Runs due jobs until none are left. A call while busy is remembered, so a new job never waits for the interval. */
export async function tick(){
 if(busy){again=true;return}busy=true;
 try{
  do{
   again=false;
   await enqueue('opruimen-gesprekken:'+amsterdamDate(new Date()),'opruimen-gesprekken'); // once per day
   await enqueueMailSync();
   await enqueue('online-betalingen:'+Math.floor(Date.now()/60000),'online-betalingen');
   await enqueue('rekeningen-ronde:'+Math.floor(Date.now()/3600000),'rekeningen-ronde'); // elk uur: open rekeningen van gisteren mailen
   while(await runDueJobs(jobHandlers)>0){}
  }while(again);
 }catch(e){console.error('[outbox] werkproces:',e instanceof Error?e.message:e)}
 finally{busy=false}
}
export function startWorker(intervalMs=30000){
 if(shared.__boerBartWorker)return;
 shared.__boerBartWorker=setInterval(()=>{void tick()},intervalMs);shared.__boerBartWorker.unref?.();
 setTimeout(()=>{void tick()},5000).unref?.();
}

/** Every 5 minutes one Gmail synchronisation, only while a mailbox is connected (MAIL_SYNC=0 turns it off). */
export async function enqueueMailSync(at=new Date()){
 if(process.env.MAIL_SYNC==='0')return;
 // Factuurmailbox (Inkoop › Facturen) elke 15 minuten, alleen als die gekoppeld is.
 try{const {isInvoiceMailConnected}=await import('./invoice-mail');if(await isInvoiceMailConnected())await enqueue('factuurmail-sync:'+Math.floor(at.getTime()/900000),'factuurmail-sync')}catch{}
 // Drive-beeldbank elk uur, alleen als administratie@ met Drive gekoppeld is en de map is ingevuld.
 try{const {withConnectionSettings}=await import('./connection-settings');const {driveReady}=await import('./drive');if(await withConnectionSettings(()=>driveReady()))await enqueue('drive-sync:'+Math.floor(at.getTime()/3600000),'drive-sync')}catch{}
 // Google Bedrijfsprofiel elke 30 minuten (vangnet; wijzigingen in Planning starten meteen een ronde), alleen als het gekoppeld is.
 try{const {withConnectionSettings}=await import('./connection-settings');const {profileReady}=await import('./google-profile');if(await withConnectionSettings(()=>profileReady()))await enqueue('google-profiel-sync:'+Math.floor(at.getTime()/1800000),'google-profiel-sync')}catch{}
 // Met de opgeslagen instellingen (Systeem & koppelingen), anders kijkt dit naar de standaardmailbox i.p.v. GMAIL_MAILBOX.
 const {withConnectionSettings}=await import('./connection-settings');
 try{const {isConnected}=await import('./mail-store');if(!await withConnectionSettings(()=>isConnected()))return}catch{return}
 await enqueue('gmail-sync:'+Math.floor(at.getTime()/300000),'gmail-sync');
 // Linked Google calendars every 15 minutes; changes in Planning also start one right away (see /api/gasten).
 try{const {hasLinkedCalendars}=await import('./mail-calendar');if(await withConnectionSettings(()=>hasLinkedCalendars()))await enqueue('agenda-sync:'+Math.floor(at.getTime()/900000),'agenda-sync')}catch{}
}
