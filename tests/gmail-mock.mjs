// Simulated Google OAuth + Gmail API for automated tests. Nothing here talks to Google and nothing is ever sent:
// "sent" messages only change this in-memory mailbox. Used by tests/gmail.integration.mjs.
import http from 'node:http';
import {randomUUID} from 'node:crypto';

const b64=s=>Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
export const SCOPES='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';

export function createGmailMock({mailbox='info@example.nl'}={}){
 const s={mailbox,profileEmail:mailbox,labels:[{id:'INBOX',name:'INBOX'},{id:'Label_7731',name:'TODO Klanten'},{id:'Label_12',name:'TODO'}],
  messages:new Map(),drafts:new Map(),history:[],historyId:1000,minHistory:0,revoked:false,failNext:0,failSend:false,direct:[],calendars:[{id:'primary-cal',summary:'Sanne',primary:true},{id:'klanten-cal@group.calendar.google.com',summary:'Klanten'},{id:'evenementen-cal@group.calendar.google.com',summary:'Evenementen'}],events:new Map(),eventCalls:0,calls:[],sends:[],codes:new Map(),refresh:new Set(),access:new Set(),pageSize:2,scope:SCOPES,seq:0};
 const nextId=()=>(++s.seq).toString(16).padStart(16,'a');
 const bump=()=>++s.historyId;
 /** Adds a message (customer mail, our reply, or a draft) and records it in the history. */
 function add({thread,from,to=s.mailbox,subject='Vraag',text='Hallo',labels=['INBOX'],at=Date.now(),headers=[],parts=null,id=nextId()}){
  const hs=[{name:'From',value:from},{name:'To',value:to},{name:'Subject',value:subject},{name:'Message-ID',value:`<${id}@mock>`},...headers];
  const payload=parts?{mimeType:'multipart/mixed',headers:[...hs,{name:'Content-Type',value:'multipart/mixed; boundary=x'}],parts}:{mimeType:'text/plain',headers:hs,body:{size:text.length,data:b64(text)}};
  const m={id,threadId:thread,labelIds:labels,snippet:text.slice(0,80),internalDate:String(at),historyId:String(bump()),payload};
  s.messages.set(id,m);s.history.push({id:String(s.historyId),messagesAdded:[{message:{id,threadId:thread,labelIds:labels}}]});return m;
 }
 function removeLabel(thread,label){for(const m of s.messages.values())if(m.threadId===thread&&m.labelIds.includes(label)){m.labelIds=m.labelIds.filter(l=>l!==label);bump();s.history.push({id:String(s.historyId),labelsRemoved:[{message:{id:m.id,threadId:thread,labelIds:m.labelIds},labelIds:[label]}]})}}
 function draftFromRaw(raw,thread,draftId){
  const text=unb64(raw),[head,...rest]=text.split('\r\n\r\n'),headers=head.split('\r\n').map(l=>{const i=l.indexOf(':');return {name:l.slice(0,i),value:l.slice(i+1).trim()}});
  const body=Buffer.from(rest.join('\r\n\r\n').replace(/\r\n/g,''),'base64').toString('utf8');
  const id=nextId();const m={id,threadId:thread,labelIds:['DRAFT'],snippet:body.slice(0,80),internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers,body:{size:body.length,data:b64(body)}}};
  s.messages.set(id,m);s.drafts.set(draftId,id);bump();s.history.push({id:String(s.historyId),messagesAdded:[{message:{id,threadId:thread,labelIds:['DRAFT']}}]});return m;
 }
 function addDraft(thread,body,{html=false}={}){const draftId='r'+nextId();const id=nextId();
  const payload=html?{mimeType:'multipart/alternative',headers:[{name:'From',value:s.mailbox},{name:'To',value:'klant@example.nl'},{name:'Subject',value:'Re: Vraag'}],parts:[{partId:'0',mimeType:'text/plain',body:{data:b64(body)}},{partId:'1',mimeType:'text/html',body:{data:b64('<p>'+body+'</p>')}}]}
   :{mimeType:'text/plain',headers:[{name:'From',value:s.mailbox},{name:'To',value:'anna@example.nl'},{name:'Subject',value:'Re: Reservering zaterdag'}],body:{data:b64(body)}};
  s.messages.set(id,{id,threadId:thread,labelIds:['DRAFT'],snippet:body,internalDate:String(Date.now()),payload});s.drafts.set(draftId,id);return {draftId,messageId:id};
 }
 const threadOf=id=>{const ms=[...s.messages.values()].filter(m=>m.threadId===id);return ms.length?{id,historyId:String(s.historyId),messages:ms}:null};
 const send=(res,code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body))};

 const server=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
  const u=new URL(req.url,'http://x');s.calls.push(req.method+' '+u.pathname);
  // --- OAuth ---
  if(u.pathname==='/o/oauth2/v2/auth'){const code='code-'+randomUUID();s.codes.set(code,true);res.writeHead(302,{Location:u.searchParams.get('redirect_uri')+'?code='+code+'&state='+u.searchParams.get('state')});return res.end()}
  if(u.pathname==='/token'){const p=new URLSearchParams(raw);
   if(p.get('client_id')!=='test-client'||p.get('client_secret')!=='test-secret')return send(res,401,{error:'invalid_client'});
   if(p.get('grant_type')==='authorization_code'){if(!s.codes.delete(p.get('code')))return send(res,400,{error:'invalid_grant'});const rt='refresh-'+randomUUID(),at='access-'+randomUUID();s.refresh.add(rt);s.access.add(at);return send(res,200,{access_token:at,refresh_token:rt,expires_in:3600,scope:s.scope})}
   if(p.get('grant_type')==='refresh_token'){if(s.revoked||!s.refresh.has(p.get('refresh_token')))return send(res,400,{error:'invalid_grant'});const at='access-'+randomUUID();s.access.add(at);return send(res,200,{access_token:at,expires_in:3600})}
   return send(res,400,{error:'unsupported_grant_type'})}
  if(u.pathname==='/revoke'){s.refresh.delete(u.searchParams.get('token'));return send(res,200,{})}
  // --- Gmail ---
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!s.access.has(token)||s.revoked)return send(res,401,{error:{message:'Invalid Credentials'}});
  if(s.failNext>0&&req.method==='GET'){s.failNext--;return send(res,503,{error:{message:'Backend Error'}})}
  // --- Google Agenda ---
  if(u.pathname==='/calendar/v3/users/me/calendarList')return send(res,200,{items:s.calendars});
  let c;
  if((c=u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/))){
   s.eventCalls++;const cal=decodeURIComponent(c[1]),id=c[2]&&decodeURIComponent(c[2]),key=cal+'|'+id;
   if(!s.calendars.some(x=>x.id===cal))return send(res,404,{error:{message:'Not Found'}});
   if(req.method==='GET'){const e=s.events.get(key);return e?send(res,200,e):send(res,404,{error:{message:'Not Found'}})}
   if(req.method==='POST'){const b=JSON.parse(raw),k=cal+'|'+b.id;if(s.events.has(k))return send(res,409,{error:{message:'Duplicate'}});const e={...b,calendar:cal,etag:'"1"',status:b.status||'confirmed'};s.events.set(k,e);return send(res,200,e)}
   const e=s.events.get(key);if(!e)return send(res,404,{error:{message:'Not Found'}});if(req.headers['if-match']&&req.headers['if-match']!==e.etag)return send(res,412,{error:{message:'Precondition Failed'}});
   if(req.method==='PUT'){const b=JSON.parse(raw);const n={...b,id,calendar:cal,etag:'"'+(Number(e.etag.replace(/"/g,''))+1)+'"',status:b.status||'confirmed'};s.events.set(key,n);return send(res,200,n)}
   if(req.method==='DELETE'){s.events.delete(key);res.writeHead(204);return res.end()}
  }
  const p=u.pathname.replace('/gmail/v1/users/me','');
  if(p==='/profile')return send(res,200,{emailAddress:s.profileEmail,historyId:String(s.historyId)});
  if(p==='/labels')return send(res,200,{labels:s.labels});
  if(p==='/threads'&&req.method==='GET'){const label=u.searchParams.get('labelIds');const ids=[...new Set([...s.messages.values()].filter(m=>m.labelIds.includes(label)).map(m=>m.threadId))].sort();
   const start=Number(u.searchParams.get('pageToken')||0),page=ids.slice(start,start+s.pageSize);return send(res,200,{threads:page.map(id=>({id})),...(start+s.pageSize<ids.length?{nextPageToken:String(start+s.pageSize)}:{})})}
  let m;
  if((m=p.match(/^\/threads\/([^/]+)$/))){const t=threadOf(m[1]);return t?send(res,200,t):send(res,404,{error:{message:'Not Found'}})}
  if(p==='/history'){const start=Number(u.searchParams.get('startHistoryId'));if(start<s.minHistory)return send(res,404,{error:{message:'Requested entity was not found.'}});return send(res,200,{history:s.history.filter(h=>Number(h.id)>start),historyId:String(s.historyId)})}
  if(p==='/messages/send'&&req.method==='POST'){const b=JSON.parse(raw),text=unb64(b.message?b.message.raw:b.raw),[head,...rest]=text.split('\r\n\r\n');const headers=head.split('\r\n').map(l=>{const i=l.indexOf(':');return {name:l.slice(0,i),value:l.slice(i+1).trim()}});const id=nextId(),body=Buffer.from(rest.join('').replace(/\r\n/g,''),'base64').toString('utf8');
   const m={id,threadId:'n'+id.slice(1),labelIds:['SENT'],snippet:body.slice(0,80),internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers,body:{data:b64(body)}}};s.messages.set(id,m);s.direct.push({id,headers:Object.fromEntries(headers.map(h=>[h.name,h.value])),body});bump();return send(res,200,{id,threadId:m.threadId})}
  if(p==='/messages'&&req.method==='GET'){const q=u.searchParams.get('q')||'',mid=(q.match(/rfc822msgid:(\S+)/)||[])[1];const hits=[...s.messages.values()].filter(m=>m.labelIds.includes('SENT')&&(!mid||m.payload.headers.some(h=>h.name==='Message-ID'&&h.value===mid)));return send(res,200,{messages:hits.map(m=>({id:m.id,threadId:m.threadId}))})}
  if(p==='/drafts'&&req.method==='GET')return send(res,200,{drafts:[...s.drafts].map(([id,mid])=>({id,message:{id:mid,threadId:s.messages.get(mid).threadId}}))});
  if(p==='/drafts'&&req.method==='POST'){const b=JSON.parse(raw),draftId='r'+nextId(),msg=draftFromRaw(b.message.raw,b.message.threadId,draftId);return send(res,200,{id:draftId,message:{id:msg.id,threadId:msg.threadId}})}
  if(p==='/drafts/send'&&req.method==='POST'&&s.failSend){s.failSend=false;return send(res,503,{error:{message:'Backend Error'}})}
  if(p==='/drafts/send'&&req.method==='POST'){const b=JSON.parse(raw),mid=s.drafts.get(b.id);if(!mid)return send(res,404,{error:{message:'Not Found'}});const msg=s.messages.get(mid);s.drafts.delete(b.id);msg.labelIds=['SENT'];msg.internalDate=String(Date.now());bump();s.history.push({id:String(s.historyId),labelsRemoved:[{message:{id:mid,threadId:msg.threadId,labelIds:['SENT']},labelIds:['DRAFT']}]});s.sends.push({draftId:b.id,messageId:mid,threadId:msg.threadId});return send(res,200,{id:mid,threadId:msg.threadId,labelIds:['SENT']})}
  if((m=p.match(/^\/drafts\/([^/]+)$/))){const mid=s.drafts.get(m[1]);if(!mid)return send(res,404,{error:{message:'Not Found'}});
   if(req.method==='GET')return send(res,200,{id:m[1],message:s.messages.get(mid)});
   if(req.method==='PUT'){const b=JSON.parse(raw);s.messages.delete(mid);const msg=draftFromRaw(b.message.raw,b.message.threadId,m[1]);return send(res,200,{id:m[1],message:{id:msg.id,threadId:msg.threadId}})}}
  if((m=p.match(/^\/messages\/([^/]+)\/attachments\/([^/]+)$/)))return send(res,200,{size:11,data:b64('PDF-INHOUD!')});
  return send(res,404,{error:{message:'Unknown mock route '+req.method+' '+p}});
 })});
 return {state:s,add,addDraft,removeLabel,server,b64,listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port))),close:()=>{server.closeAllConnections();return new Promise(r=>server.close(r))}};
}
