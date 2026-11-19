import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAddress,addressEmails,summarizeThread,waiting,messageContent,htmlToText,replyContext,buildReply,replaceDraftText,decodeBase64Url,encodeBase64Url,isAutomated,simpleTextDraft,sendBlocker,validThreadId,GMAIL_SCOPES} from '../lib/mail-core.ts';
const ME='sanne@example.nl',LABEL='Label_42';
const b64=s=>encodeBase64Url(s);
const msg=(id,at,from,extra={})=>({id,threadId:'t1',internalDate:String(Date.parse(at)),labelIds:extra.labels||[LABEL,'INBOX'],snippet:extra.snippet||'',payload:{mimeType:extra.mime||'text/plain',headers:[{name:'From',value:from},{name:'To',value:extra.to||ME},{name:'Subject',value:extra.subject||'Reservering zaterdag'},{name:'Message-ID',value:'<'+id+'@mail>'},...(extra.headers||[])],body:extra.parts?{size:0}:{size:10,data:b64(extra.text||'Hallo')},...(extra.parts?{parts:extra.parts}:{})}});

test('adressen: naam, aanhalingstekens, lijsten',()=>{
 assert.deepEqual(parseAddress('"Jansen, Anna" <Anna@Example.nl>'),{name:'Jansen, Anna',email:'anna@example.nl'});
 assert.deepEqual(parseAddress('piet@example.nl'),{name:'',email:'piet@example.nl'});
 assert.deepEqual(addressEmails('"A, B" <a@x.nl>, c@y.nl'),['a@x.nl','c@y.nl']);
});
test('samenvatting: klant, wie wacht, ongelezen, label, concepten',()=>{
 const t={id:'t1',messages:[msg('m1','2026-11-01T09:00:00Z','Anna <anna@example.nl>',{labels:[LABEL,'INBOX','UNREAD']}),msg('m2','2026-11-01T10:00:00Z',ME,{labels:['SENT'],to:'anna@example.nl'}),msg('d1','2026-11-01T11:00:00Z',ME,{labels:['DRAFT'],to:'anna@example.nl'})]};
 const {summary,messages}=summarizeThread(t,ME,LABEL);
 assert.equal(summary.customerEmail,'anna@example.nl');assert.equal(summary.customerName,'Anna');
 assert.equal(summary.lastMessageId,'m2','concept telt niet als laatste bericht');assert.equal(summary.lastFromUs,1);
 assert.equal(summary.unread,1);assert.equal(summary.labeled,1);assert.equal(summary.messageCount,2);assert.equal(summary.draftCount,1);
 assert.equal(messages.length,3);assert.equal(messages.find(m=>m.messageId==='d1').isDraft,1);
 assert.equal(waiting(summary,null),'wij-wachten');
 assert.equal(waiting({...summary,lastFromUs:0},null),'klant-wacht');
 assert.equal(summarizeThread(t,ME,'Label_ander').summary.labeled,0);
});
test('afgehandeld gaat weer open als de klant daarna schrijft',()=>{
 assert.equal(waiting({lastFromUs:1,lastCustomerAt:'2026-11-01T09:00:00Z'},{status:'afgehandeld',updated:'2026-11-01T12:00:00Z'}),'afgehandeld');
 assert.equal(waiting({lastFromUs:0,lastCustomerAt:'2026-11-02T09:00:00Z'},{status:'afgehandeld',updated:'2026-11-01T12:00:00Z'}),'opnieuw-open');
});
test('automatische berichten en boekingsbevestigingen herkennen',()=>{
 assert.ok(isAutomated(msg('a','2026-11-01T09:00:00Z','Booking <noreply@platform.nl>')));
 assert.ok(isAutomated(msg('a','2026-11-01T09:00:00Z','x@y.nl',{headers:[{name:'Auto-Submitted',value:'auto-replied'}]})));
 assert.ok(isAutomated(msg('a','2026-11-01T09:00:00Z','x@y.nl',{headers:[{name:'List-Unsubscribe',value:'<mailto:u@y.nl>'}]})));
 assert.ok(!isAutomated(msg('a','2026-11-01T09:00:00Z','Anna <anna@example.nl>',{headers:[{name:'Auto-Submitted',value:'no'}]})));
 const t={id:'t1',messages:[msg('m1','2026-11-01T09:00:00Z','Reserveren <no-reply@reserveren.nl>')]};
 assert.equal(summarizeThread(t,ME,LABEL).summary.automated,1);
});
test('tekst en bijlagen: platte tekst voorrang, HTML alleen als tekst, bijlagen zonder inhoud',()=>{
 const m=msg('m1','2026-11-01T09:00:00Z','anna@example.nl',{mime:'multipart/mixed',parts:[{partId:'0',mimeType:'multipart/alternative',parts:[{partId:'0.0',mimeType:'text/plain',body:{data:b64('Kunnen we met 12 personen komen?')}},{partId:'0.1',mimeType:'text/html',body:{data:b64('<p>Kunnen <b>we</b></p>')}}]},{partId:'1',mimeType:'application/pdf',filename:'plattegrond.pdf',body:{attachmentId:'ATT1',size:2048}}]});
 const c=messageContent(m);assert.equal(c.text,'Kunnen we met 12 personen komen?');assert.equal(c.html,false);
 assert.deepEqual(c.attachments,[{partId:'1',filename:'plattegrond.pdf',mimeType:'application/pdf',size:2048,attachmentId:'ATT1'}]);
 assert.equal(htmlToText('<style>x</style><p>Hoi &amp; welkom</p><script>alert(1)</script>Tot&nbsp;ziens'),'Hoi & welkom\nTot ziens');
 assert.equal(decodeBase64Url(b64('café')),'café');
 assert.equal(summarizeThread({id:'t1',messages:[m]},ME,LABEL).summary.attachmentCount,1);
});
test('antwoord in hetzelfde gesprek: ontvanger, onderwerp, threading-kopregels, UTF-8',()=>{
 const t={id:'t1',messages:[msg('m1','2026-11-01T09:00:00Z','Anna <anna@example.nl>',{headers:[{name:'Reply-To',value:'anna.prive@example.nl'}]})]};
 const c=replyContext(t,ME);
 assert.deepEqual(c.to,['anna.prive@example.nl']);assert.equal(c.subject,'Re: Reservering zaterdag');assert.equal(c.inReplyTo,'<m1@mail>');assert.equal(c.references,'<m1@mail>');
 const raw=decodeBase64Url(buildReply({...c,from:ME,body:'Graag gedaan, tot zaterdag! Groet, Sanne – Boerderijrecreatie'}));
 assert.match(raw,/^From: sanne@example.nl\r\nTo: anna.prive@example.nl\r\n/);assert.match(raw,/In-Reply-To: <m1@mail>/);
 const body=raw.split('\r\n\r\n')[1];assert.equal(Buffer.from(body.replace(/\r\n/g,''),'base64').toString('utf8'),'Graag gedaan, tot zaterdag! Groet, Sanne – Boerderijrecreatie');
 assert.throws(()=>buildReply({...c,to:[],from:ME,body:'x'}),/geen ontvanger/);
 assert.match(decodeBase64Url(buildReply({...c,subject:'Re: Bezoek én lunch',from:ME,body:'x'})),/Subject: =\?UTF-8\?B\?/);
 assert.doesNotMatch(decodeBase64Url(buildReply({...c,to:['a@b.nl\r\nBcc: evil@x.nl'],from:ME,body:'x'})),/\r\nBcc:/,'geen extra kopregels via invoer');
});
test('laatste bericht van ons: antwoord gaat naar dezelfde ontvangers',()=>{
 const t={id:'t1',messages:[msg('m1','2026-11-01T09:00:00Z','anna@example.nl'),msg('m2','2026-11-01T10:00:00Z',ME,{labels:['SENT'],to:'anna@example.nl',headers:[{name:'Cc',value:'piet@example.nl, '+ME}]})]};
 const c=replyContext(t,ME);assert.deepEqual(c.to,['anna@example.nl']);assert.deepEqual(c.cc,['piet@example.nl']);
});
test('bestaand concept: alleen eenvoudige tekst is te bewerken, kopregels blijven',()=>{
 const plain=msg('d1','2026-11-01T11:00:00Z',ME,{labels:['DRAFT'],to:'anna@example.nl'});
 assert.ok(simpleTextDraft(plain));
 assert.ok(!simpleTextDraft(msg('d2','2026-11-01T11:00:00Z',ME,{labels:['DRAFT'],mime:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:b64('a')}},{mimeType:'text/html',body:{data:b64('<p>a</p>')}}]})));
 const raw=decodeBase64Url(replaceDraftText(plain,'Nieuwe tekst'));assert.match(raw,/To: anna@example.nl/);assert.match(raw,/Subject: Reservering zaterdag/);
});
test('controle vlak voor verzenden',()=>{
 const seen={lastMessageId:'m2',draftMessageId:'d1',threadId:'t1'};
 assert.equal(sendBlocker({lastMessageId:'m2',draftMessageId:'d1',draftThreadId:'t1'},seen),null);
 assert.match(sendBlocker({lastMessageId:'m3',draftMessageId:'d1',draftThreadId:'t1'},seen),/nieuw bericht/);
 assert.match(sendBlocker({lastMessageId:'m2',draftMessageId:'d9',draftThreadId:'t1'},seen),/elders gewijzigd/);
 assert.match(sendBlocker({lastMessageId:'m2',draftMessageId:null,draftThreadId:null},seen),/bestaat niet meer/);
 assert.match(sendBlocker({lastMessageId:'m2',draftMessageId:'d1',draftThreadId:'t9'},seen),/ander gesprek/);
});
test('minimale Gmail-rechten: geen wijzigen, archiveren of verwijderen',()=>{
 assert.deepEqual(GMAIL_SCOPES,['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose']);
 assert.ok(validThreadId('18c2f0a1b2c3d4e5'));assert.ok(!validThreadId('../x'));
});

test('gastenmailbox: standaard info@example.nl (eigenaar 11 november 2026)',async()=>{
 const {MAILBOX_DEFAULT}=await import('../lib/mail-core.ts');assert.equal(MAILBOX_DEFAULT,'info@example.nl');
 const fs=await import('node:fs');
 const jobs=fs.readFileSync(new URL('../lib/assistant-jobs.ts',import.meta.url),'utf8');
 assert.match(jobs,/withConnectionSettings\(\(\)=>isConnected\(\)\)/,'werkproces kijkt met de opgeslagen instellingen of Gmail gekoppeld is');
 const avail=fs.readFileSync(new URL('../app/api/public/availability/route.ts',import.meta.url),'utf8');
 assert.match(avail,/withConnectionSettings\(\(\)=>isConnected\(\)\)/,'website kijkt met de opgeslagen instellingen of bevestigingsmail kan');
});

test('facturen: bij elke factuur met e-mailadres kan de mail (opnieuw) verstuurd worden (eigenaar 11 november 2026)',async()=>{
 const fs=await import('node:fs');const page=fs.readFileSync(new URL('../app/financien/facturen/page.tsx',import.meta.url),'utf8');
 const all=page.slice(page.indexOf('Alle facturen'));
 assert.match(all,/b\.holderEmail&&<button[^>]*onClick=\{\(\)=>send\(b\)\}/,'knop bij Alle facturen');
 assert.match(all,/b\.paidAt\?b\.mailPaid:b\.mailOpen/,'voldaan-mail telt bij betaalde rekeningen');
});
