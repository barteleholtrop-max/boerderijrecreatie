// Nagebootste bunq (sandbox) voor tests van de bankverdeling (6 november 2026). Controleert de handtekening van elk POST-verzoek,
// houdt eigen rekeningen, betalingen en conceptbetalingen bij, en kan storingen nabootsen.
import http from 'node:http';
import {createVerify} from 'node:crypto';
export const USER=42;
export function bunqMock(){
 const state={clientKey:'',installToken:'inst-token',sessions:0,expire:false,fail:null,loseNext:false,calls:[],nextId:1000,
  accounts:[{id:1,description:'Main',iban:'NL11BUNQ0000000001'},{id:2,description:'BB-tegoed leden',iban:'NL22BUNQ0000000002'},{id:3,description:'Btw-reserve',iban:'NL33BUNQ0000000003'},
   {id:4,description:'Onderdeelpotten',iban:'NL44BUNQ0000000004'},{id:5,description:'Coöperatie',iban:'NL55BUNQ0000000005'},
   {id:6,description:'Rente & vaste kosten',iban:'NL66BUNQ0000000006'}],
  payments:{1:[],2:[],3:[],4:[],5:[],6:[]},drafts:new Map(),tabs:new Map()};
 const fmt=d=>d.toISOString().replace('T',' ').replace('Z','').padEnd(26,'0');
 const add=(acc,cents,o={})=>{const p={id:state.nextId++,created:fmt(o.at||new Date()),amount:{value:(cents/100).toFixed(2),currency:'EUR'},description:o.description||'',counterparty_alias:{iban:o.iban||'',display_name:o.name||''}};state.payments[acc].unshift(p);return p.id};
 const balance=acc=>state.payments[acc].reduce((n,p)=>n+Math.round(Number(p.amount.value)*100),0);
 const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
 const err=(res,status,text)=>send(res,status,{Error:[{error_description:text,error_description_translated:text}]});
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const url=new URL(req.url,'http://x'),path=url.pathname;state.calls.push(req.method+' '+path);
  if(req.method==='POST'&&path!=='/v1/installation'){
   const ok=state.clientKey&&createVerify('SHA256').update(body).verify(state.clientKey,String(req.headers['x-bunq-client-signature']||''),'base64');
   if(!ok)return err(res,400,'Ongeldige handtekening.');
  }
  const json=body?JSON.parse(body):null;
  if(path==='/v1/installation'){state.clientKey=json.client_public_key;return send(res,200,{Response:[{Id:{id:1}},{Token:{token:state.installToken}},{ServerPublicKey:{server_public_key:'x'}}]})}
  if(path==='/v1/device-server'){if(req.headers['x-bunq-client-authentication']!==state.installToken)return err(res,401,'Geen installatie.');return send(res,200,{Response:[{Id:{id:7}}]})}
  if(path==='/v1/session-server'){if(json.secret!==state.apiKey)return err(res,401,'Sleutel onbekend.');state.sessions++;state.expire=false;return send(res,200,{Response:[{Id:{id:9}},{Token:{token:'sess-'+state.sessions}},{UserCompany:{id:USER}}]})}
  if(req.headers['x-bunq-client-authentication']!=='sess-'+state.sessions||state.expire)return err(res,401,'Sessie verlopen.');
  {const f=state.fail&&state.fail(req.method,path);if(f)return err(res,typeof f==='number'?f:500,typeof f==='number'&&f<500?'Geweigerd door bunq.':'Storing bij bunq.')}
  let m;
  if(req.method==='GET'&&path===`/v1/user/${USER}/monetary-account`)return send(res,200,{Response:state.accounts.map(a=>({MonetaryAccountBank:{id:a.id,description:a.description,status:'ACTIVE',balance:{value:(balance(a.id)/100).toFixed(2),currency:'EUR'},alias:[{type:'IBAN',value:a.iban,name:'Boerderijrecreatie'}]}}))});
  if(req.method==='GET'&&(m=path.match(/^\/v1\/user\/42\/monetary-account\/(\d+)\/payment\/(\d+)$/))){const p=(state.payments[Number(m[1])]||[]).find(x=>x.id===Number(m[2]));return p?send(res,200,{Response:[{Payment:p}]}):err(res,404,'Onbekend.')}
  if((m=path.match(/^\/v1\/user\/42\/monetary-account\/(\d+)\/payment$/))){const acc=Number(m[1]);if(!state.payments[acc])return err(res,404,'Onbekend.');
   if(req.method==='GET')return send(res,200,{Response:state.payments[acc].map(p=>({Payment:p})),Pagination:{older_url:null}});
   const to=state.accounts.find(a=>a.iban===json.counterparty_alias.value);if(!to)return err(res,400,'Mock: alleen eigen rekeningen.');
   const cents=Math.round(Number(json.amount.value)*100);if(balance(acc)<cents)return err(res,400,'Onvoldoende saldo.');
   const id=add(acc,-cents,{description:json.description,iban:to.iban,name:to.description});add(to.id,cents,{description:json.description,iban:state.accounts.find(a=>a.id===acc).iban,name:'Main'});
   if(state.loseNext){state.loseNext=false;return err(res,500,'Antwoord verloren.')}
   return send(res,200,{Response:[{Id:{id}}]});
  }
  if((m=path.match(/^\/v1\/user\/42\/monetary-account\/(\d+)\/draft-payment(?:\/(\d+))?$/))){
   if(req.method==='POST'){const id=state.nextId++;state.drafts.set(id,{status:'PENDING',from:Number(m[1]),entry:json.entries[0],entries:json.entries,accepts:json.number_of_required_accepts,paymentId:null});
    if(state.loseDraft){state.loseDraft=false;return err(res,504,'Antwoord verloren.')}return send(res,200,{Response:[{Id:{id}}]})}
   const view=(id,d)=>({DraftPayment:{id,status:d.status,entries:d.entries,...(d.paymentId?{object:{Payment:{id:d.paymentId}}}:{})}});
   if(!m[2])return send(res,200,{Response:[...state.drafts].filter(([,d])=>d.from===Number(m[1])).map(([id,d])=>view(id,d)).reverse()});
   const d=state.drafts.get(Number(m[2]));if(!d)return err(res,404,'Onbekend.');return send(res,200,{Response:[view(Number(m[2]),d)]});
  }
  // Betaalverzoek (bunq.me) voor gasten (10 november 2026).
  if((m=path.match(/^\/v1\/user\/42\/monetary-account\/(\d+)\/bunqme-tab(?:\/(\d+))?$/))){
   if(req.method==='POST'&&!m[2]){const id=state.nextId++;state.tabs.set(id,{account:Number(m[1]),status:'WAITING_FOR_PAYMENT',entry:json.bunqme_tab_entry,results:[]});return send(res,200,{Response:[{Id:{id}}]})}
   const t=state.tabs.get(Number(m[2]));if(!t)return err(res,404,'Onbekend.');
   if(req.method==='PUT'){t.status=json.status;return send(res,200,{Response:[{Id:{id:Number(m[2])}}]})}
   return send(res,200,{Response:[{BunqMeTab:{id:Number(m[2]),status:t.status,bunqme_tab_share_url:'https://bunq.me/t/'+m[2],bunqme_tab_entry:t.entry,result_inquiries:t.results.map(p=>({payment:{Payment:p}}))}}]});
  }
  err(res,404,'Mock kent '+req.method+' '+path+' niet.');
 })});
 /** Bevestigen in de app. pay=false: bevestigd, maar de betaling mislukte (bijvoorbeeld te weinig saldo). */
 const accept=(id,pay=true)=>{const d=state.drafts.get(id);d.status='ACCEPTED';if(!pay)return;
  // Elke regel wordt een afschrijving; naar een eigen rekening komt het daar ook bij (zoals bunq een concept met meerdere regels uitvoert).
  const ids=d.entries.map(e=>{const cents=Math.round(Number(e.amount.value)*100),to=state.accounts.find(a=>a.iban===e.counterparty_alias.value);
   if(to)add(to.id,cents,{description:e.description,iban:state.accounts.find(a=>a.id===d.from).iban,name:'Main'});
   return add(d.from,-cents,{description:e.description,iban:e.counterparty_alias.value,name:e.counterparty_alias.name})});
  d.paymentId=ids[0]};
 /** Een gast betaalt een betaalverzoek. silent: bunq werkt het verzoek (nog) niet bij, alleen de bijschrijving op de rekening. */
 const payTab=(id,cents,{silent=false}={})=>{const t=state.tabs.get(id);const pid=add(t.account,cents,{description:t.entry.description,name:'Gast',iban:'NL99INGB0000000099'});
  if(!silent)t.results.push(state.payments[t.account].find(p=>p.id===pid));return pid};
 return {state,add,balance,accept,payTab,start:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${server.address().port}`))),stop:()=>new Promise(r=>server.close(r))};
}
