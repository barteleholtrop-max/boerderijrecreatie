// Berichten van Meta in Gesprekken (akkoord eigenaar 9 november 2026): opslaan, lijst, gesprek, afhandeling en verzenden.
// Server only. Meta is de bron voor wat er binnenkomt (webhook); de backoffice bewaart alles bij de klant (besluit eigenaar:
// voor altijd), plus de eigen afhandeling: status, verantwoordelijke en klantenkaart. Verzenden alleen na bevestiging, nooit dubbel.
import {getDb} from '@/db';
import {createHash,randomUUID} from 'node:crypto';
import {env} from './portable/env';
import {metaThreads,metaMessages,metaSends} from '@/db/schema';
import {and,eq,desc,asc,sql,inArray} from 'drizzle-orm';
import {connectionSetting} from './connection-runtime';
import {MailError} from './mail-store';
import {queueStaffNotice} from './staff-push';
import {metaStaffMessage} from './staff-push-core';
import {parseWebhook,threadId,threadRef,describe,windowLeft,waitingFor,sendBlocker,usableTemplates,fillTemplate,outgoing,sentId,metaMediaUrl,
 HISTORY_DAYS_DEFAULT,CHANNELS,type Channel,type MetaMessage,type MetaEvent,type Template,type Media} from './meta-core';

const now=()=>new Date().toISOString();
const unique=(e:unknown)=>/UNIQUE|PRIMARY KEY|duplicate key/i.test(String((e as Error)?.message)+String((e as {cause?:Error})?.cause?.message||''));
const setting=(k:string)=>(connectionSetting(k)||'').trim();

// ---- Instellingen (Systeem & koppelingen → WhatsApp, Messenger en Instagram) ---------------------------------------------
export const metaConfig=()=>({
 appSecret:setting('META_APP_SECRET'),verifyToken:setting('META_VERIFY_TOKEN'),
 phoneId:setting('GUEST_WHATSAPP_PHONE_ID'),wabaId:setting('META_WHATSAPP_WABA_ID'),waToken:setting('GUEST_WHATSAPP_TOKEN'),
 pageId:setting('META_PAGE_ID'),pageToken:setting('META_PAGE_TOKEN'),instagramId:setting('META_INSTAGRAM_ID'),
 historyDays:Math.min(180,Math.max(0,Number(setting('META_HISTORY_DAYS')||HISTORY_DAYS_DEFAULT)||0)),
});
/** Verzenden staat uit tenzij META_SEND_ENABLED=1, zodat test- en proefomgevingen nooit echte klanten berichten sturen. */
export const metaSendEnabled=()=>process.env.META_SEND_ENABLED==='1';
const graphBase=()=>(process.env.META_GRAPH_BASE||'https://graph.facebook.com').replace(/\/$/,'');
const graphVersion=()=>/^v\d{1,3}\.\d$/.test(setting('META_GRAPH_VERSION'))?setting('META_GRAPH_VERSION'):'v23.0';
const testBase=()=>!!process.env.META_GRAPH_BASE;
function tokenFor(channel:Channel){const c=metaConfig();return channel==='whatsapp'?c.waToken:c.pageToken}
export function channelReady(channel:Channel){const c=metaConfig();return channel==='whatsapp'?!!(c.phoneId&&c.waToken):channel==='messenger'?!!(c.pageId&&c.pageToken):!!(c.instagramId&&c.pageToken)}

export class MetaApiError extends MailError{}
async function graph(path:string,token:string,init:{method?:string;body?:unknown}={}){
 if(!token)throw new MailError('De koppeling met Meta is nog niet ingesteld (toegangssleutel ontbreekt).',409);
 let res:Response;
 try{res=await fetch(`${graphBase()}/${graphVersion()}/${path}`,{method:init.method||'GET',headers:{Authorization:'Bearer '+token,...(init.body!==undefined?{'Content-Type':'application/json'}:{})},
  body:init.body!==undefined?JSON.stringify(init.body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)})}
 catch(e){const why=(e as Error)?.name==='TimeoutError'?' (geen antwoord binnen 15 seconden)':(e as Error)?.message?' ('+String((e as Error).message).slice(0,80)+')':'';throw Object.assign(new MetaApiError('Meta is nu niet bereikbaar'+why+'.',503),{uncertain:true})}
 const data=await res.json().catch(()=>({})) as {error?:{message?:string;error_user_msg?:string;code?:number;error_subcode?:number;error_data?:{details?:string}}};
 // De code van Meta (en waar het kan de uitleg) erbij, zodat een fout op te zoeken is (wens eigenaar 14 november 2026).
 if(!res.ok){const e=data.error,code=e?.code?' (code '+e.code+(e.error_subcode?'/'+e.error_subcode:'')+')':'',details=e?.error_data?.details&&e.error_data.details!==e.message?' '+e.error_data.details:'';
  const msg=(e?.error_user_msg||e?.message||'Meta gaf een fout ('+res.status+').')+details+code;throw Object.assign(new MetaApiError('Meta: '+msg.slice(0,300),res.status>=500?503:400),{uncertain:res.status>=500})}
 return data as Record<string,unknown>;
}

// ---- Binnenkomen (webhook) ----------------------------------------------------------------------------------------------
/** Slaat de berichten uit één webhook op. Herhaalde webhooks zijn onschadelijk: elk bericht staat er één keer in. */
export async function ingestWebhook(body:unknown){
 const c=metaConfig(),events=parseWebhook(body,{historySince:Date.now()-c.historyDays*86400_000});
 return ingest(events);
}
export async function ingest(events:MetaEvent[]){
 const db=getDb();let added=0;
 for(const e of events){
  if(e.kind==='status'){if(e.status)await db.update(metaMessages).set({status:e.error?e.status+': '+e.error.slice(0,200):e.status}).where(eq(metaMessages.id,e.id));continue}
  const id=threadId(e.channel,e.contact);
  await db.insert(metaThreads).values({id,channel:e.channel,contact:e.contact,name:e.name,phone:e.phone,created:now()}).onConflictDoNothing();
  if(e.name)await db.update(metaThreads).set({name:e.name}).where(eq(metaThreads.id,id));
  let inserted=true;
  try{await db.insert(metaMessages).values({id:e.id,threadId:id,fromUs:e.fromUs?1:0,kind:e.type,text:e.text,media:e.media?JSON.stringify(e.media):'',at:e.at,source:e.source,status:e.fromUs?'sent':''})}
  catch(err){if(unique(err))inserted=false;else throw err}
  if(!inserted)continue;
  added++;await touch(id,e);
  if(!e.fromUs&&e.source==='webhook'){const t=(await db.select().from(metaThreads).where(eq(metaThreads.id,id)))[0];if(t)await queueStaffNotice(metaStaffMessage(t,describe(e.type,e.text)))}
 }
 return added;
}
/** Laatste bericht, venster en ongelezen bijwerken; een ouder bericht (geschiedenis) verandert het laatste bericht niet. */
async function touch(id:string,e:Pick<MetaMessage,'id'|'at'|'fromUs'|'type'|'text'|'source'>){
 const db=getDb(),t=(await db.select().from(metaThreads).where(eq(metaThreads.id,id)))[0];if(!t)return;
 const set:Partial<typeof metaThreads.$inferInsert>={};
 if(!t.lastMessageAt||e.at>=t.lastMessageAt)Object.assign(set,{lastMessageId:e.id,lastMessageAt:e.at,lastFromUs:e.fromUs?1:0,snippet:describe(e.type,e.text).slice(0,200)});
 if(!e.fromUs&&e.at>t.lastCustomerAt)set.lastCustomerAt=e.at;
 if(!e.fromUs&&e.source==='webhook')set.unread=t.unread+1;
 if(e.fromUs&&e.source!=='history'&&e.source!=='import')set.unread=0;
 if(Object.keys(set).length)await db.update(metaThreads).set(set).where(eq(metaThreads.id,id));
}

// ---- Lijst en gesprek ---------------------------------------------------------------------------------------------------
export type MetaRow=ReturnType<typeof row>;
function row(t:typeof metaThreads.$inferSelect){
 return {id:t.id,ref:threadRef(t.id),channel:t.channel as Channel,contact:t.contact,name:t.name,phone:t.phone,customerId:t.customerId,lastMessageId:t.lastMessageId,lastMessageAt:t.lastMessageAt,
  lastFromUs:!!t.lastFromUs,unread:t.unread,snippet:t.snippet,status:t.status,assigned:t.assigned,version:t.version,statusBy:t.statusBy,statusAt:t.statusAt,
  waiting:waitingFor(t),windowLeft:windowLeft(t.lastCustomerAt)};
}
export async function metaStatus(){
 const c=metaConfig(),n=(await getDb().select({n:sql<number>`count(*)`}).from(metaThreads))[0];
 const last=(await getDb().select({at:metaMessages.at}).from(metaMessages).orderBy(desc(metaMessages.at)).limit(1))[0];
 return {channels:Object.fromEntries(CHANNELS.map(ch=>[ch,channelReady(ch)])) as Record<Channel,boolean>,webhookReady:!!(c.appSecret&&c.verifyToken),
  templatesReady:!!(c.wabaId&&c.waToken),historyDays:c.historyDays,sendEnabled:metaSendEnabled(),threads:Number(n?.n||0),lastMessageAt:last?.at||null,
  webhookUrl:(process.env.APP_ORIGIN||'').replace(/\/$/,'')+'/api/public/meta'};
}
export async function listMetaThreads(){return (await getDb().select().from(metaThreads).orderBy(desc(metaThreads.lastMessageAt)).limit(2000)).map(row)}
async function find(id:string){
 if(!/^(whatsapp|messenger|instagram):\d{1,40}$/.test(id))throw new MailError('Onbekend gesprek.',404);
 const t=(await getDb().select().from(metaThreads).where(eq(metaThreads.id,id)))[0];if(!t)throw new MailError('Onbekend gesprek.',404);return t;
}
/** Het hele gesprek, oud naar nieuw. Openen zet alleen onze eigen teller op gelezen; bij de klant verandert niets. */
export async function metaThread(id:string){
 const db=getDb(),t=await find(id);
 if(t.unread)await db.update(metaThreads).set({unread:0}).where(eq(metaThreads.id,id));
 const messages=(await db.select().from(metaMessages).where(eq(metaMessages.threadId,id)).orderBy(asc(metaMessages.at))).map(m=>{
  const media=m.media?JSON.parse(m.media) as Media:null;
  // Een bijlage uit een WhatsApp-export die (nog) niet is meegestuurd, tonen we als tekst in plaats van een lege speler.
  if(media?.pending)return {id:m.id,fromUs:!!m.fromUs,kind:'text',text:[m.text,'📎 '+(media.filename||'bijlage')+' (niet in de export)'].filter(Boolean).join('\n'),media:null,at:m.at,status:m.status,by:m.by,source:m.source};
  return {id:m.id,fromUs:!!m.fromUs,kind:m.kind,text:m.text,media:media?{mime:media.mime,filename:media.filename,available:true}:null,at:m.at,status:m.status,by:m.by,source:m.source}});
 const sends=(await db.select().from(metaSends).where(eq(metaSends.threadId,id)).orderBy(desc(metaSends.created)).limit(20)).map(s=>({requestId:s.requestId,kind:s.kind,status:s.status,error:s.error,by:s.by,created:s.created}));
 return {thread:{...row({...t,unread:0})},messages,sends,sendEnabled:metaSendEnabled()&&channelReady(t.channel as Channel)};
}
/** Voor het advies van de assistent (wens eigenaar 11 november 2026): het gesprek alleen lezen, zonder het als gelezen te markeren. */
export async function metaThreadForAdvice(id:string){
 const t=await find(id),messages=await getDb().select().from(metaMessages).where(eq(metaMessages.threadId,id)).orderBy(asc(metaMessages.at));
 return {thread:row(t),messages:messages.map(m=>({id:m.id,fromUs:!!m.fromUs,kind:m.kind,text:m.text,at:m.at,filename:m.media?String((JSON.parse(m.media) as Media).filename||m.kind):''}))};
}
/** Klantgesprekken per klantenkaart (voor altijd bewaard): alle gesprekken van deze klant via Meta. */
export async function metaThreadsFor(ids:string[]){return ids.length?(await getDb().select().from(metaThreads).where(inArray(metaThreads.customerId,ids))).map(row):[]}

// ---- Afhandeling --------------------------------------------------------------------------------------------------------
export async function metaWork(id:string,input:{status?:unknown;assigned?:unknown;customerId?:unknown;name?:unknown;version?:unknown},by:string){
 const t=await find(id);
 if(Number(input.version)!==t.version)throw new MailError('Dit gesprek is intussen gewijzigd. Het is opnieuw geladen; controleer en sla nog eens op.',409);
 const status=input.status==='afgehandeld'?'afgehandeld':'open',assigned=String(input.assigned??t.assigned).trim().slice(0,100),customerId=String(input.customerId??t.customerId).slice(0,400);
 const name=input.name===undefined?t.name:String(input.name).trim().slice(0,200);
 const r=await getDb().update(metaThreads).set({status,assigned,customerId,name,version:t.version+1,statusBy:by,statusAt:now()}).where(and(eq(metaThreads.id,id),eq(metaThreads.version,t.version))).returning({id:metaThreads.id});
 if(!r.length)throw new MailError('Dit gesprek is intussen gewijzigd. Ververs en probeer opnieuw.',409);
}

// ---- Verzenden ----------------------------------------------------------------------------------------------------------
export async function metaTemplates():Promise<Template[]>{
 const c=metaConfig();if(!c.wabaId)throw new MailError('Vul eerst het WhatsApp Business-account-ID in bij Systeem & koppelingen.',409);
 return usableTemplates(await graph(`${encodeURIComponent(c.wabaId)}/message_templates?status=APPROVED&limit=200&fields=name,language,status,category,components`,c.waToken));
}
type SendInput={confirm?:unknown;requestId?:unknown;lastMessageId?:unknown;mode?:unknown;text?:unknown;template?:unknown;language?:unknown;values?:unknown};
/**
 * Eén antwoord versturen. Alleen na bevestiging, met een eigen aanvraag-id (dubbelklikken, herladen of een tweede tabblad
 * verstuurt niets extra), alleen als er intussen geen nieuw bericht is en, voor gewone tekst, binnen het venster van 24 uur.
 * Is onzeker of Meta het bericht kreeg (time-out), dan blijft het gesprek op slot tot iemand het controleert en vrijgeeft.
 */
export async function metaSend(id:string,input:SendInput,by:string){
 if(input.confirm!==true)throw new MailError('Bevestig eerst dat het bericht weg mag. Er is niets verzonden.');
 const requestId=String(input.requestId||'');if(!/^[0-9a-f-]{36}$/i.test(requestId))throw new MailError('Ongeldige aanvraag.');
 const db=getDb(),old=(await db.select().from(metaSends).where(eq(metaSends.requestId,requestId)))[0];
 if(old){if(old.status==='verzonden')return {status:'verzonden',already:true};throw new MailError(old.status==='mislukt'?'Dit bericht is niet verzonden: '+old.error:'Deze verzending loopt al of is onzeker. Er is niets extra verzonden.',409)}
 const t=await find(id),channel=t.channel as Channel;
 if(!metaSendEnabled())throw new MailError('Verzenden staat uit in deze omgeving (META_SEND_ENABLED). Er is niets verzonden.',409);
 if(!channelReady(channel))throw new MailError('De koppeling voor dit kanaal is nog niet ingesteld. Er is niets verzonden.',409);
 const mode=input.mode==='sjabloon'?'sjabloon':'tekst',block=sendBlocker(t,String(input.lastMessageId||''),mode,channel);if(block)throw new MailError(block,409);
 let payload:unknown,shown:string;
 if(mode==='tekst'){const text=String(input.text||'').trim();if(!text||text.length>4096)throw new MailError('Schrijf een bericht van hooguit 4096 tekens.');payload=outgoing(channel,t.contact,{mode:'tekst',text});shown=text}
 else{
  const name=String(input.template||''),template=(await metaTemplates()).find(x=>x.name===name&&x.language===String(input.language||x.language));
  if(!template)throw new MailError('Dit sjabloon is niet (meer) goedgekeurd door Meta. Er is niets verzonden.',409);
  const values=Array.isArray(input.values)?input.values.map(v=>String(v).trim().slice(0,500)):[];
  if(values.length!==template.params||values.some(v=>!v))throw new MailError('Vul alle invulvelden van het sjabloon in.');
  payload=outgoing(channel,t.contact,{mode:'sjabloon',template,values});shown=fillTemplate(template.body,values);
 }
 try{await db.insert(metaSends).values({requestId,threadId:id,kind:mode,body:shown,status:'verzenden',by,created:now(),updated:now()})}
 catch(e){if(unique(e))throw new MailError('Er loopt al een verzending in dit gesprek, of een eerdere is onzeker. Controleer eerst; er is niets verzonden.',409);throw e}
 const c=metaConfig(),path=channel==='whatsapp'?`${encodeURIComponent(c.phoneId)}/messages`:'me/messages';
 try{
  const res=await graph(path,tokenFor(channel),{method:'POST',body:payload}),messageId=sentId(res)||'onbekend:'+requestId;
  await db.update(metaSends).set({status:'verzonden',messageId,updated:now()}).where(eq(metaSends.requestId,requestId));
  const at=now();
  try{await db.insert(metaMessages).values({id:messageId,threadId:id,fromUs:1,kind:mode==='sjabloon'?'template':'text',text:shown,at,status:'sent',by,source:'backoffice'})}catch(e){if(!unique(e))throw e}
  await touch(id,{id:messageId,at,fromUs:true,type:mode==='sjabloon'?'template':'text',text:shown,source:'webhook'});
  return {status:'verzonden'};
 }catch(e){
  const uncertain=!!(e as {uncertain?:boolean}).uncertain;
  await db.update(metaSends).set({status:uncertain?'onzeker':'mislukt',error:(e as Error).message.slice(0,300),updated:now()}).where(eq(metaSends.requestId,requestId));
  throw new MailError(uncertain?'Onzeker of het bericht is aangekomen. Kijk in WhatsApp of Meta Business Suite en geef het gesprek daarna vrij; er wordt niets opnieuw verzonden.':(e as Error).message+' Er is niets verzonden.',uncertain?503:400);
 }
}
/** Na controle bij Meta: een onzekere verzending afsluiten, zodat er weer verzonden kan worden. */
export async function metaRelease(id:string,requestId:unknown,arrived:boolean,by:string){
 const r=await getDb().update(metaSends).set({status:arrived?'verzonden':'mislukt',error:arrived?'':'Na controle niet aangekomen ('+by+')',updated:now()})
  .where(and(eq(metaSends.threadId,id),eq(metaSends.requestId,String(requestId||'')),eq(metaSends.status,'onzeker'))).returning({id:metaSends.requestId});
 if(!r.length)throw new MailError('Er is geen onzekere verzending om vrij te geven.',409);
}

/** Oude WhatsApp-gesprekken uit de app ophalen (kan alleen kort na het koppelen; Meta stuurt ze daarna via de webhook). */
export async function requestHistory(){
 const c=metaConfig();if(!c.phoneId)throw new MailError('Vul eerst het WhatsApp-telefoonnummer-ID in.',409);
 await graph(`${encodeURIComponent(c.phoneId)}/smb_app_data`,c.waToken,{method:'POST',body:{messaging_product:'whatsapp',sync_type:'history'}});
}

/** Foto, spraakbericht of document van een bericht, opgehaald bij Meta (alleen bij Meta zelf, met limiet). */
export async function metaMedia(messageId:string){
 const m=(await getDb().select().from(metaMessages).where(eq(metaMessages.id,messageId)))[0];if(!m?.media)throw new MailError('Geen bijlage.',404);
 const t=await find(m.threadId),media=JSON.parse(m.media) as Media,channel=t.channel as Channel;
 if(media.blob){
  const o=await env.BUCKET.get(media.blob);if(!o)throw new MailError('Deze bijlage is niet (meer) beschikbaar.',404);
  return {body:new Uint8Array(await new Response(o.body).arrayBuffer()),mime:media.mime||o.httpMetadata.contentType,filename:media.filename||''};
 }
 if(media.pending)throw new MailError('Deze bijlage zat niet in de export.',404);
 let url=media.url||'',mime=media.mime||'',auth=false;
 if(media.id){const info=await graph(encodeURIComponent(media.id),tokenFor(channel));url=String(info.url||'');mime=String(info.mime_type||mime);auth=true}
 if(!url||!(metaMediaUrl(url)||testBase()&&url.startsWith(graphBase())))throw new MailError('Deze bijlage is niet (meer) beschikbaar bij Meta.',404);
 const res=await fetch(url,{headers:auth?{Authorization:'Bearer '+tokenFor(channel)}:{},redirect:'error',signal:AbortSignal.timeout(20000)}).catch(()=>null);
 if(!res?.ok)throw new MailError('Deze bijlage is niet (meer) beschikbaar bij Meta.',404);
 const size=Number(res.headers.get('content-length')||0);if(size>25*1048576)throw new MailError('Bijlage te groot om te tonen.',413);
 const body=new Uint8Array(await res.arrayBuffer());if(body.byteLength>25*1048576)throw new MailError('Bijlage te groot om te tonen.',413);
 return {body,mime:/^[a-z]+\/[a-z0-9.+-]+$/i.test(mime)?mime:(res.headers.get('content-type')||'application/octet-stream'),filename:media.filename||''};
}

// ---- Koppeling controleren en afronden (Systeem & koppelingen) ---------------------------------------------------------
// Controleren vraagt alleen gegevens op bij Meta. Koppelen voert de laatste stappen uit die alleen via de Graph API kunnen:
// het WhatsApp-account op de app abonneren (anders stuurt Meta geen berichten naar de webhook), het nummer aanmelden met de
// pincode (verificatie in twee stappen) en de Facebook-pagina op de app abonneren voor Messenger en Instagram.
// De pincode wordt alleen doorgegeven aan Meta en nergens bewaard.
export type MetaCheckStep={id:string;label:string;ok:boolean|null;detail:string};
const fail=(e:unknown)=>(e as Error).message.replace(/^Meta: /,'');
const listed=(r:Record<string,unknown>)=>(Array.isArray(r.data)?r.data:[]) as Record<string,unknown>[];
export async function metaCheck():Promise<MetaCheckStep[]>{
 const c=metaConfig(),steps:MetaCheckStep[]=[];
 const add=(id:string,label:string,ok:boolean|null,detail:string)=>steps.push({id,label,ok,detail});
 add('webhook','Webhook (app-geheim en verificatiecode)',c.appSecret&&c.verifyToken?true:false,
  !c.appSecret||!c.verifyToken?'Vul het Meta app-geheim en een verificatiecode in.':c.verifyToken.length<20?'Ingesteld; kies liever een verificatiecode van minstens 20 tekens.':'Ingesteld. Plak het webhookadres en dezelfde code in de Meta-app.');
 if(!c.phoneId||!c.waToken)add('whatsapp-nummer','WhatsApp-nummer',null,'Telefoonnummer-ID of WhatsApp-toegangssleutel ontbreekt.');
 else try{
  const n=await graph(`${encodeURIComponent(c.phoneId)}?fields=display_phone_number,verified_name,name_status,quality_rating,platform_type,status`,c.waToken);
  const registered=String(n.platform_type||'')==='CLOUD_API';
  add('whatsapp-nummer','WhatsApp-nummer',registered,[n.display_phone_number,n.verified_name&&'naam '+n.verified_name+(n.name_status?' ('+n.name_status+')':''),n.quality_rating&&'kwaliteit '+n.quality_rating,
   registered?'aangemeld bij de backoffice':'nog niet aangemeld: kies Koppelen bij Meta met de pincode'].filter(Boolean).join(' · '));
 }catch(e){add('whatsapp-nummer','WhatsApp-nummer',false,fail(e))}
 if(!c.wabaId||!c.waToken)add('whatsapp-abonnement','WhatsApp-berichten naar de webhook',null,'WhatsApp Business-account-ID ontbreekt.');
 else try{const apps=listed(await graph(`${encodeURIComponent(c.wabaId)}/subscribed_apps`,c.waToken));
  add('whatsapp-abonnement','WhatsApp-berichten naar de webhook',apps.length>0,apps.length?'De app ontvangt de berichten van dit WhatsApp-account.':'Nog niet geabonneerd: kies Koppelen bij Meta.')}
 catch(e){
  // Geeft Meta geen antwoord op deze controle, dan telt wat er echt binnenkomt: een WhatsApp-bericht via de webhook.
  const last=(await getDb().select({at:metaMessages.at}).from(metaMessages).innerJoin(metaThreads,eq(metaThreads.id,metaMessages.threadId))
   .where(and(eq(metaThreads.channel,'whatsapp'),eq(metaMessages.source,'webhook'))).orderBy(desc(metaMessages.at)).limit(1))[0];
  add('whatsapp-abonnement','WhatsApp-berichten naar de webhook',last?true:false,last?'Berichten komen binnen (laatste: '+new Date(last.at).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'})+'). Meta gaf geen antwoord op de controle: '+fail(e):fail(e));
 }
 if(!c.pageId||!c.pageToken)add('messenger','Messenger (Facebook-pagina)',null,'Facebook-pagina-ID of paginasleutel ontbreekt.');
 else try{
  // De paginanaam vraagt pages_read_engagement; die heeft een paginasleutel voor berichten niet altijd. Alleen het abonnement telt.
  const apps=listed(await graph(`${encodeURIComponent(c.pageId)}/subscribed_apps`,c.pageToken));
  const ok=apps.some(a=>Array.isArray(a.subscribed_fields)&&(a.subscribed_fields as unknown[]).includes('messages'));
  add('messenger','Messenger (Facebook-pagina)',ok,'Pagina '+c.pageId+' · '+(ok?'berichten komen naar de backoffice':'pagina nog niet geabonneerd op berichten: kies Koppelen bij Meta'));
 }catch(e){add('messenger','Messenger (Facebook-pagina)',false,fail(e))}
 if(!c.instagramId||!c.pageToken)add('instagram','Instagram',null,'Instagram-account-ID of paginasleutel ontbreekt.');
 else try{const i=await graph(`${encodeURIComponent(c.instagramId)}?fields=username`,c.pageToken);add('instagram','Instagram',true,'@'+String(i.username||c.instagramId)+' · bereikbaar met de paginasleutel')}
 catch(e){add('instagram','Instagram',false,fail(e))}
 add('verzenden','Antwoorden versturen',metaSendEnabled(),metaSendEnabled()?'Aan.':'Uit in deze omgeving (META_SEND_ENABLED). Lezen werkt wel; zet het aan na de proef.');
 return steps;
}
export async function metaConnect(input:{pin?:unknown}){
 const c=metaConfig(),done:string[]=[],errors:string[]=[];
 const pin=String(input.pin??'').trim();if(pin&&!/^\d{6}$/.test(pin))throw new MailError('De pincode bestaat uit 6 cijfers.');
 if(c.wabaId&&c.waToken){try{await graph(`${encodeURIComponent(c.wabaId)}/subscribed_apps`,c.waToken,{method:'POST'});done.push('WhatsApp-account geabonneerd op de app')}catch(e){errors.push('WhatsApp-abonnement: '+fail(e))}}
 if(c.phoneId&&c.waToken&&pin){try{await graph(`${encodeURIComponent(c.phoneId)}/register`,c.waToken,{method:'POST',body:{messaging_product:'whatsapp',pin}});done.push('WhatsApp-nummer aangemeld')}catch(e){errors.push('Nummer aanmelden: '+fail(e))}}
 if(c.pageId&&c.pageToken){try{await graph(`${encodeURIComponent(c.pageId)}/subscribed_apps?subscribed_fields=messages,message_echoes`,c.pageToken,{method:'POST'});done.push('Facebook-pagina geabonneerd op berichten (Messenger en Instagram)')}catch(e){errors.push('Pagina-abonnement: '+fail(e))}}
 if(!done.length&&!errors.length)throw new MailError('Vul eerst de ID\'s en sleutels in bij de koppeling hierboven.',409);
 return {done,errors,steps:await metaCheck()};
}

// ---- WhatsApp-export importeren (wens eigenaar 13 november 2026) ----------------------------------------------------------
// De export uit de WhatsApp Business-app (tekst en media) komt bij het gesprek met dat telefoonnummer, als oude berichten:
// geen meldingen, geen ongelezen teller, en een nieuw gesprek staat meteen op afgehandeld. Elk bericht krijgt een vaste
// sleutel uit zijn inhoud, zodat dezelfde export nog eens importeren niets dubbel zet. Bijlagen stuurt de browser daarna
// één voor één (de export zelf wordt in de browser uitgepakt), en ze staan in de eigen privé-opslag van de backoffice.
export const IMPORT_MAX_MESSAGES=20000,IMPORT_MAX_MEDIA=25*1048576;
type ImportInput={phone?:unknown;name?:unknown;us?:unknown;messages?:unknown};
export async function importWhatsapp(input:ImportInput,by:string){
 const {normalizePhone}=await import('./meta-core'),{mediaType}=await import('./whatsapp-export');
 const phone=normalizePhone(String(input.phone||''));if(!phone)throw new MailError('Vul het telefoonnummer van de klant in, met landcode (bijvoorbeeld +31 6 12345678).');
 const us=String(input.us||'').trim(),name=String(input.name||'').trim().slice(0,200);
 if(!us)throw new MailError('Kies wie in de export Boer Bart is.');
 if(!Array.isArray(input.messages)||!input.messages.length)throw new MailError('Er staan geen berichten in deze export.');
 if(input.messages.length>IMPORT_MAX_MESSAGES)throw new MailError(`Hooguit ${IMPORT_MAX_MESSAGES} berichten per export.`);
 const msgs=input.messages.map(v=>{const m=(v||{}) as Record<string,unknown>;return {at:String(m.at||''),author:String(m.author||'').slice(0,120),text:String(m.text||'').slice(0,8000),attachment:String(m.attachment||'').replace(/[\\/\r\n]/g,'_').slice(0,200),omitted:m.omitted===true}})
  .filter(m=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(m.at)&&m.author);
 if(!msgs.length)throw new MailError('Er staan geen leesbare berichten in deze export.');
 const db=getDb(),id=threadId('whatsapp',phone),now=new Date().toISOString();
 const existed=!!(await db.select({id:metaThreads.id}).from(metaThreads).where(eq(metaThreads.id,id)))[0];
 if(!existed)await db.insert(metaThreads).values({id,channel:'whatsapp',contact:phone,name,phone,created:now,status:'afgehandeld',statusBy:by,statusAt:now}).onConflictDoNothing();
 else if(name)await db.update(metaThreads).set({name}).where(and(eq(metaThreads.id,id),eq(metaThreads.name,'')));
 const seen=new Map<string,number>(),media:{messageId:string;filename:string}[]=[];let added=0,skipped=0;
 for(const m of msgs){
  const base=[id,m.at,m.author,m.text,m.attachment].join('\u0001'),n=(seen.get(base)||0)+1;seen.set(base,n);
  const messageId='import:'+createHash('sha256').update(base+'\u0001'+n).digest('hex').slice(0,40);
  const fromUs=m.author===us,t=m.attachment?mediaType(m.attachment):null;
  const text=m.omitted?[m.text,'📎 bijlage (niet in de export)'].filter(Boolean).join('\n'):m.text;
  const values={id:messageId,threadId:id,fromUs:fromUs?1:0,kind:t?t.kind:'text',text,media:t?JSON.stringify({filename:m.attachment,mime:t.mime,pending:true}):'',at:m.at,status:fromUs?'sent':'',by:fromUs?m.author+' (import)':'',source:'import'};
  let inserted=true;try{await db.insert(metaMessages).values(values)}catch(e){if(unique(e))inserted=false;else throw e}
  if(!inserted){skipped++;const old=(await db.select({media:metaMessages.media}).from(metaMessages).where(eq(metaMessages.id,messageId)))[0];if(t&&old?.media&&(JSON.parse(old.media) as Media).pending)media.push({messageId,filename:m.attachment});continue}
  added++;if(t)media.push({messageId,filename:m.attachment});
  await touch(id,{id:messageId,at:m.at,fromUs,type:values.kind,text:text||describe(values.kind,''),source:'import'});
 }
 return {thread:threadRef(id),added,skipped,media};
}
/** Eén bijlage uit de export bij het geïmporteerde bericht zetten (alleen als die nog ontbreekt en de bestandsnaam klopt). */
export async function importWhatsappMedia(messageId:unknown,file:File){
 if(typeof messageId!=='string'||!/^import:[0-9a-f]{40}$/.test(messageId))throw new MailError('Onbekend bericht.',404);
 const db=getDb(),m=(await db.select().from(metaMessages).where(eq(metaMessages.id,messageId)))[0];if(!m?.media)throw new MailError('Onbekend bericht.',404);
 const media=JSON.parse(m.media) as Media;if(!media.pending)return {already:true};
 if(file.name!==media.filename)throw new MailError('Dit bestand hoort niet bij dit bericht.');
 if(file.size<1||file.size>IMPORT_MAX_MEDIA)throw new MailError('Bijlage te groot (hooguit 25 MB) of leeg.',413);
 const key=randomUUID();await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:media.mime||'application/octet-stream'}});
 const r=await db.update(metaMessages).set({media:JSON.stringify({filename:media.filename,mime:media.mime,blob:key})}).where(and(eq(metaMessages.id,messageId),eq(metaMessages.media,m.media))).returning({id:metaMessages.id});
 if(!r.length){await env.BUCKET.delete(key).catch(()=>{});return {already:true}}
 return {ok:true};
}
