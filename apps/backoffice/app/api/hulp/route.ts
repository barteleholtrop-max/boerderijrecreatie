import {withConnectionSettings} from '@/lib/connection-settings';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {validMessageText,validRequestId,validPhoto,photoText,hasPhoto,PHOTO_MAX_CHARS} from '@/lib/assistant-core';
import {threadExpired,threadMessages} from '@/lib/assistant-store';
import {aiConfigured,startHulpThread,addHulpMessage,hulpThread,recentHulpThreads,threadActions,hulpPending,answerHulpLater,decideAction,HulpError} from '@/lib/hulp-store';
export const dynamic='force-dynamic';
// Backoffice-assistent (opdracht eigenaar 6 november 2026): de typbalk onderaan elk scherm. Alleen voor beheerders (eigenaar).
// Een bericht wordt in de achtergrond beantwoord; een actie voert de assistent meteen uit (lib/hulp-store.ts, wens eigenaar 13 november 2026).
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof HulpError?json({error:e.message},e.status):(console.error('[hulp]',e),json({error:'Er ging iets mis. Probeer het opnieuw.'},500));
const unique=(e:unknown)=>/UNIQUE|PRIMARY KEY|duplicate key/i.test(String((e as Error)?.message));
const PAGE=/^\/[A-Za-z0-9/_-]{0,100}$/;

/** Alleen beheerders: aangemeld als eigenaar, en bij inloggen met Google de rol eigenaar (niet medewerker). */
function admin(req:Request,write=false){
 authorizeSheet(req,write);
 const role=req.headers.get('x-boer-bart-role');
 if(role&&role!=='eigenaar')throw new HulpError('De assistent is alleen voor beheerders.',403);
 return req.headers.get('x-boer-bart-account')||'eigenaar';
}

async function get(req:Request){
 const account=admin(req),id=new URL(req.url).searchParams.get('gesprek');
 if(!id)return json({configured:await aiConfigured(),threads:await recentHulpThreads(account)});
 const thread=await hulpThread(id,account);if(!thread)throw new HulpError('Dit gesprek bestaat niet meer. Gesprekken worden na 14 dagen verwijderd.',404);
 const messages=(await threadMessages(id)).filter(m=>m.role!=='tool'&&(m.role!=='assistant'||m.text))
  .map(m=>({id:m.id,role:m.role==='user'&&m.account==='systeem'?'systeem':m.role,text:m.text,created:m.created,foto:m.role==='user'&&hasPhoto(m.content)}));
 return json({configured:await aiConfigured(),thread:{id:thread.id,title:thread.title},expired:threadExpired(thread),messages,actions:await threadActions(id),pending:await hulpPending(id)});
}

async function post(req:Request){
 const account=admin(req,true);
 const raw=await req.text();if(raw.length>PHOTO_MAX_CHARS+20000)throw new HulpError('Het bericht of de foto is te groot.');
 let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{throw new HulpError('Ongeldige aanvraag.')}
 if(!validRequestId(b.requestId))throw new HulpError('Ongeldige aanvraag.');
 const page=typeof b.pagina==='string'&&PAGE.test(b.pagina)?b.pagina:'';
 // Foto (wens eigenaar 13 november 2026): optioneel bij elk bericht; zonder tekst vraagt de foto zelf om uitleg.
 const photo=b.foto===undefined||b.foto===null?null:validPhoto(b.foto);
 if(b.foto&&!photo)throw new HulpError('Deze foto kan niet worden gelezen. Kies een JPG- of PNG-foto.');
 const text=photoText(b.text,photo);
 if(b.action==='start'){
  if(!validMessageText(text))throw new HulpError('Typ eerst een vraag (maximaal 4000 tekens).');
  try{await startHulpThread(b.requestId,account,page,text,new Date(),photo)}catch(e){if(!unique(e))throw e;return json({ok:true,gesprek:b.requestId,duplicate:true})}
  await answerHulpLater(b.requestId,'start');
  return json({ok:true,gesprek:b.requestId});
 }
 if(typeof b.gesprek!=='string')throw new HulpError('Ongeldige aanvraag.');
 const thread=await hulpThread(b.gesprek,account);if(!thread)throw new HulpError('Dit gesprek bestaat niet meer. Begin een nieuw gesprek.',404);
 if(b.action==='bericht'){
  if(!validMessageText(text))throw new HulpError('Typ eerst een vraag (maximaal 4000 tekens).');
  if(threadExpired(thread))throw new HulpError('Dit gesprek is ouder dan twee weken. Begin een nieuw gesprek.',409);
  try{await addHulpMessage(b.requestId,thread.id,account,page,text,new Date(),photo)}catch(e){if(!unique(e))throw e;return json({ok:true,duplicate:true})}
  await answerHulpLater(thread.id,b.requestId);
  return json({ok:true});
 }
 if(b.action==='uitvoeren'||b.action==='annuleren'){
  if(typeof b.actie!=='string'||!/^[a-f0-9-]{36}$/.test(b.actie))throw new HulpError('Ongeldige aanvraag.');
  const origin=new URL(process.env.APP_ORIGIN||req.url).origin;
  return json({ok:true,...await decideAction({id:b.actie,threadId:thread.id,requestId:b.requestId,account,decision:b.action,origin})});
 }
 throw new HulpError('Onbekende actie.');
}

export async function GET(req:Request){try{admin(req);return await withConnectionSettings(()=>get(req))}catch(e){return fail(e)}}
export async function POST(req:Request){try{admin(req,true);return await withConnectionSettings(()=>post(req))}catch(e){return fail(e)}}
