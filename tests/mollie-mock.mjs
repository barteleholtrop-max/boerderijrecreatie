// Nagebootste Mollie-API voor automatische tests. Er gaat geen geld om en er wordt niets naar Mollie gestuurd.
// Gebruikt door tests/betalen.integration.mjs.
import http from 'node:http';

export function createMollieMock({key}){
 const s={payments:new Map(),idempotency:new Map(),created:0,calls:[],seq:0,customers:new Map(),customerIdempotency:new Map(),mandates:new Map(),lostRecurringResponse:false,loseNextRecurringResponse:false,nextRecurringStatus:null,amountOverride:new Map(),routes:new Map(),routeIdempotency:new Map(),loseNextRouteResponse:false,loseNextPaymentResponse:false};
 let port=0;
 const view=p=>({resource:'payment',id:p.id,mode:key.startsWith('live_')?'live':'test',status:p.status,amount:{currency:'EUR',value:s.amountOverride.get(p.id)??p.amount.value},description:p.description,sequenceType:p.sequenceType||'oneoff',customerId:p.customerId||null,mandateId:p.mandateId||null,method:p.method||null,...(p.amountRefunded?{amountRefunded:p.amountRefunded}:{}),...(p.amountChargedBack?{amountChargedBack:p.amountChargedBack}:{}),
  metadata:p.metadata,redirectUrl:p.redirectUrl,...(p.webhookUrl?{webhookUrl:p.webhookUrl}:{}),_links:{checkout:p.status==='open'?{href:`http://127.0.0.1:${port}/checkout/${p.id}`}:undefined}});
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;
  s.calls.push({method:req.method,url:req.url,headers:req.headers,body});
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/hal+json'});res.end(JSON.stringify(data))};
  if(req.headers.authorization!=='Bearer '+key)return send(401,{status:401,title:'Unauthorized Request',detail:'Missing authentication, or failed to authenticate'});
  const url=new URL(req.url,'http://localhost');
  if(req.method==='POST'&&url.pathname==='/v2/customers'){
   const idem=req.headers['idempotency-key'];if(idem&&s.customerIdempotency.has(idem))return send(201,s.customers.get(s.customerIdempotency.get(idem)));
   const c={id:'cst_mock'+String(s.customers.size+1).padStart(4,'0'),resource:'customer',...body};s.customers.set(c.id,c);if(idem)s.customerIdempotency.set(idem,c.id);return send(201,c);
  }
  const cp=/^\/v2\/customers\/(cst_[A-Za-z0-9]+)\/payments$/.exec(url.pathname);
  if(req.method==='GET'&&cp)return send(200,{_embedded:{payments:[...s.payments.values()].filter(p=>p.customerId===cp[1]).reverse().map(view)},_links:{next:null}});
  const cm=/^\/v2\/customers\/(cst_[A-Za-z0-9]+)\/mandates(?:\/(mdt_[A-Za-z0-9]+))?$/.exec(url.pathname);
  if(req.method==='GET'&&cm){if(cm[2]){const m=s.mandates.get(cm[2]);return m&&m.customerId===cm[1]?send(200,m):send(404,{detail:'Mandate missing'})}return send(200,{_embedded:{mandates:[...s.mandates.values()].filter(m=>m.customerId===cm[1])},_links:{next:null}})}
  if(req.method==='POST'&&req.url==='/v2/payments'){
   const idem=req.headers['idempotency-key'];
   if(idem&&s.idempotency.has(idem))return send(201,view(s.payments.get(s.idempotency.get(idem))));
   if(!/^\d+\.\d{2}$/.test(body?.amount?.value||'')||body.amount.currency!=='EUR'||(!body.redirectUrl&&body.sequenceType!=='recurring'))return send(422,{status:422,detail:'Ongeldige betaling'});
   if(body.sequenceType==='first'&&(!s.customers.has(body.customerId)||body.method!=='ideal'))return send(422,{detail:'First payment needs customer and iDEAL'});
   if(body.sequenceType==='recurring'&&(!s.customers.has(body.customerId)||s.mandates.get(body.mandateId)?.status!=='valid'||s.mandates.get(body.mandateId)?.customerId!==body.customerId||body.method!=='directdebit'))return send(422,{detail:'Valid mandate required'});
   const p={id:'tr_mock'+(++s.seq).toString().padStart(4,'0'),status:body.sequenceType==='recurring'?(s.nextRecurringStatus||'pending'):'open',...body};s.nextRecurringStatus=null;
   s.payments.set(p.id,p);s.created++;if(idem)s.idempotency.set(idem,p.id);
   if(body.sequenceType==='recurring'&&s.loseNextRecurringResponse){s.loseNextRecurringResponse=false;s.lostRecurringResponse=true;res.destroy();return}
   if(s.loseNextPaymentResponse){s.loseNextPaymentResponse=false;res.destroy();return}
   return send(201,view(p));
  }
  const routes=/^\/v2\/payments\/(tr_[A-Za-z0-9]+)\/routes$/.exec(url.pathname);
  if(routes){
   const payment=s.payments.get(routes[1]);if(!payment)return send(404,{detail:'Missing payment'});
   if(req.method==='GET')return send(200,{_embedded:{routes:[...s.routes.values()].filter(r=>r.paymentId===payment.id)},_links:{next:null}});
   if(req.method==='POST'){
    const idem=req.headers['idempotency-key'];if(idem&&s.routeIdempotency.has(idem))return send(201,s.routes.get(s.routeIdempotency.get(idem)));
    if(payment.status!=='paid'||body?.amount?.value!==payment.amount.value||body?.destination?.type!=='organization')return send(422,{detail:'Invalid route'});
    if([...s.routes.values()].some(r=>r.paymentId===payment.id))return send(422,{detail:'Amount already routed'});
    const route={resource:'route',id:'crt_mock'+String(s.routes.size+1).padStart(4,'0'),paymentId:payment.id,...body};s.routes.set(route.id,route);if(idem)s.routeIdempotency.set(idem,route.id);
    if(s.loseNextRouteResponse){s.loseNextRouteResponse=false;res.destroy();return}return send(201,route);
   }
  }
  const m=/^\/v2\/payments\/(tr_[A-Za-z0-9]+)$/.exec(req.url||'');
  if(req.method==='GET'&&m){const p=s.payments.get(m[1]);return p?send(200,view(p)):send(404,{status:404,detail:'No payment exists with token '+m[1]})}
  send(404,{status:404,detail:'Not found'});
 });
 return {state:s,
  listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>{port=server.address().port;r(port)})),
  close:()=>new Promise(r=>{server.closeAllConnections?.();server.close(r)}),
  setStatus:(id,status)=>{const p=s.payments.get(id);p.status=status;if(status==='paid'&&p.sequenceType==='first'&&!p.mandateId){const m={id:'mdt_mock'+String(s.mandates.size+1).padStart(4,'0'),customerId:p.customerId,mode:'test',status:'valid',method:'directdebit'};s.mandates.set(m.id,m);p.mandateId=m.id}},
  last:()=>[...s.payments.values()].at(-1)};
}
