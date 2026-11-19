import {withConnectionSettings} from '@/lib/connection-settings';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {amsterdamDate,upcomingWeek,validMessageText,validRequestId,validPhoto,photoText,hasPhoto,PHOTO_MAX_CHARS} from '@/lib/assistant-core';
import {aiConfigured,getThread,listThreads,startThread,addUserMessage,threadMessages,threadPending,weekMenus,threadExpired,weekTitle} from '@/lib/assistant-store';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
export const dynamic='force-dynamic';
class Fail extends Error{status:number;constructor(m:string,s:number){super(m);this.status=s}}
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof Fail?json({error:e.message},e.status):(console.error('[assistent]',e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
const unique=(e:unknown)=>/UNIQUE|PRIMARY KEY|duplicate key/i.test(String((e as Error)?.message));

async function answerLater(threadId:string,key:string){await enqueue('assistent:'+threadId+':'+key,'assistent-antwoord',{threadId});void tick()}

async function get(req:Request){try{
 authorizeSheet(req);
 const id=new URL(req.url).searchParams.get('thread');
 const week=upcomingWeek(amsterdamDate(new Date()));
 if(!id)return json({configured:await aiConfigured(),week,weekTitle:weekTitle(week),threads:await listThreads()});
 const thread=await getThread(id);if(!thread)throw new Fail('Dit gesprek bestaat niet meer. Gesprekken worden na 14 dagen verwijderd.',404);
 const messages=(await threadMessages(id)).filter(m=>m.role!=='tool'&&(m.role!=='assistant'||m.text)).map(m=>({id:m.id,role:m.role,account:m.account,text:m.text,created:m.created,foto:m.role==='user'&&hasPhoto(m.content),sources:m.role==='assistant'?(JSON.parse(m.sources).tools||[]):[]}));
 return json({configured:await aiConfigured(),thread,expired:threadExpired(thread),messages,pending:await threadPending(id),menu:await weekMenus(thread.week)});
}catch(e){return fail(e)}}

async function post(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>PHOTO_MAX_CHARS+20000)throw new Fail('Het bericht of de foto is te groot.',400);
 let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{throw new Fail('Ongeldige aanvraag.',400)}
 const account=req.headers.get('x-boer-bart-account')||'onbekend';
 if(!validRequestId(b.requestId))throw new Fail('Ongeldige aanvraag.',400);
 if(b.action==='start'){
  const week=upcomingWeek(amsterdamDate(new Date()));
  try{await startThread(b.requestId,week,account)}catch(e){if(!unique(e))throw e;return json({ok:true,thread:b.requestId,duplicate:true})}
  await answerLater(b.requestId,'start');
  return json({ok:true,thread:b.requestId});
 }
 if(b.action==='bericht'){
  // Foto (wens eigenaar 13 november 2026): optioneel; zonder tekst vraagt de foto zelf om uitleg.
  const photo=b.foto===undefined||b.foto===null?null:validPhoto(b.foto);
  if(b.foto&&!photo)throw new Fail('Deze foto kan niet worden gelezen. Kies een JPG- of PNG-foto.',400);
  const text=photoText(b.text,photo);
  if(typeof b.thread!=='string'||!validMessageText(text))throw new Fail('Schrijf eerst een bericht (maximaal 4000 tekens).',400);
  const thread=await getThread(b.thread);if(!thread)throw new Fail('Dit gesprek bestaat niet meer. Start een nieuw weekgesprek.',404);
  if(threadExpired(thread))throw new Fail('Dit gesprek is ouder dan twee weken. Start een nieuw weekgesprek.',409);
  try{await addUserMessage(b.requestId,thread.id,account,text,new Date(),photo)}catch(e){if(!unique(e))throw e;return json({ok:true,duplicate:true})}
  await answerLater(thread.id,b.requestId);
  return json({ok:true});
 }
 throw new Fail('Onbekende actie.',400);
}catch(e){return fail(e)}}

export async function GET(req:Request){try{authorizeSheet(req);return await withConnectionSettings(()=>get(req))}catch(e){return fail(e)}}
export async function POST(req:Request){try{authorizeSheet(req,true);return await withConnectionSettings(()=>post(req))}catch(e){return fail(e)}}
