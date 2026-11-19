import {withConnectionSettings} from '@/lib/connection-settings';
import {connectionSetting} from '@/lib/connection-runtime';
import {z} from 'zod';
import {authorizeSheet} from '@/lib/sheet-access';
import {loadGuest,saveGuest,editGuest,guestProcessed} from '@/lib/guest-store';
import {saveMeeting,linkMeeting} from '@/lib/meetings';
import {groupDaySchema,appointmentSchema,reservationSchema,dateSchema,timeSchema,hoursSchema,daypartSchema,validateBooking,alternatives,audit,versionOf,today,type Conversation,contactSchema,opening} from '@/lib/guest-core';
import {exampleEvents,exampleGroups} from '@/lib/guest-examples';
import {permissions,requireEditor} from '@/lib/guest-google';
import {isOwnerRequest} from '@/lib/owner';
import {mailAccess,mailConversations,mailThreadExists} from '@/lib/mail-store';
import {mailThreadOf} from '@/lib/mail-core';
import {mollieKey} from '@/lib/online-payments';
import {onlinePickups} from '@/lib/pickup-orders';
import {listSignups,setSignupStatus,setSignupPaid,resendConfirmation} from '@/lib/event-signups';
import {customerCards,saveCustomer,customerView} from '@/lib/guest-customers';
import {env} from '@/lib/portable/env';
import {saveQuote,deleteQuote} from '@/lib/quotes';
import {visitSchema,weatherForecast,predict} from '@/lib/guest-forecast';
export const dynamic='force-dynamic';
// Edits carry the row revision the form was opened with; a newer revision means a colleague changed it meanwhile.
const stale=(current:unknown,sent:unknown,what:string)=>{const now=(current as {rev?:number}|undefined)?.rev,rev=(sent as {rev?:unknown}|undefined)?.rev;if(now!==undefined&&typeof rev==='number'&&rev!==now)throw Error(what+' is intussen door iemand anders gewijzigd. Ververs en controleer de gegevens.')};
// Eigen Nederlandse foutmelding uit het schema (ook binnen een keuze), niet de Engelse standaardtekst van zod.
const dutchIssue=(issues:readonly any[]):string=>{for(const i of issues){if(i.message&&!/^(Invalid|Expected|Too)/.test(i.message))return i.message;for(const nested of i.errors||[]){const m=dutchIssue(nested);if(m)return m}}return ''};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const account=(r:Request)=>r.headers.get('x-boer-bart-account')||'';
async function get(req:Request){try{authorizeSheet(req);const who=account(req),p=permissions(who,isOwnerRequest(req)),loaded=await loadGuest();loaded.state=customerView(loaded.state,p);
 // One inbox: Gmail conversations come from the Gmail connection (/api/mail), as references only (no message text).
 // Older Gmail copies in this workspace document are left untouched but no longer shown.
 loaded.state.threads=[...loaded.state.threads.filter(t=>t.channel!=='gmail'),...(mailAccess(who).view?await mailConversations():[])];
 // Online afhaalbestellingen van de winkel (alleen weergave; de bestelling zelf staat in orders). Zie lib/pickup-orders.ts.
 loaded.state.pickups=[...loaded.state.pickups,...await onlinePickups().catch(()=>[])];
 // Event sign-ups from the website, only for employees who manage the planning.
 const signups=p.manage?(await listSignups()).map(x=>({id:x.id,event_id:x.eventId,name:x.name,email:x.email,phone:x.phone,people:x.people,note:x.note,status:x.status,created:x.created,amount_cents:x.amountCents,payment_status:x.paymentStatus,paid_by:x.paidBy,hold_until:x.holdUntil,confirmation:x.confirmation,confirmation_error:x.confirmationError})):[];
 // Klantenkaart uit bestellingen (8 november 2026): alleen van gasten die toestemming gaven, alleen voor beheer.
 const orderCards=p.manage?await (await import('@/lib/order-customers')).orderCustomers().catch(()=>[]):[];
 return json({...loaded,account:who,permissions:p,mail:mailAccess(who),ai:!!connectionSetting('ANTHROPIC_API_KEY'),signups,orderCards,mollie:!!mollieKey()});}catch{return json({error:'Gegevens niet beschikbaar. Controleer de serverconfiguratie.'},503)}}
async function post(req:Request){try{
 authorizeSheet(req,true);const raw=await req.text();if(raw.length>500000)throw Error('Aanvraag te groot.');const b=JSON.parse(raw),who=account(req),p=permissions(who,isOwnerRequest(req));const action=z.string().max(40).parse(b.action);
 // Voorspelling (wens eigenaar 6 november 2026): dezelfde, bijgestelde voorspelling als in de personeelsplanning (lib/forecast.ts).
 if(action==='forecast'){
  // De gekozen periode (van … tot, hoogstens 400 dagen); zonder periode de komende 16 dagen. Verder dan 16 dagen vooruit: seizoensgemiddelde.
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),from=typeof b.from==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.from)?b.from:now;
  const span=typeof b.to==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.to)?Math.round((Date.parse(b.to)-Date.parse(from))/86400000)+1:16;
  const {forecastsFor}=await import('@/lib/forecast'),f=await forecastsFor(from,Math.max(1,Math.min(400,span)),{log:from<=now});
  return json({weather:{error:f.weatherError,at:new Date().toISOString()},forecasts:f.days.filter(d=>d.expected!==null||d.override).map(d=>({date:d.date,expected:d.expected,samples:d.samples,reason:d.how==='eigen getal'?`Eigen getal${d.override?.note?': '+d.override.note:''}`:d.how==='bijgesteld'?`${d.reason} Bijgesteld: basis ${d.base}${f.calibration.factor!==null?` × ${String(f.calibration.factor).replace('.',',')}`:''}${f.settings.manualPct?` ${f.settings.manualPct>0?'+':''}${f.settings.manualPct}%`:''}.`:d.reason}))})}






 if(action==='knowledge-add'){
 if(!p.manage)throw Error('Geen toestemming voor kennisbeheer.');
 const {knowledgeSchema}=await import('@/lib/group-advice');const example=knowledgeSchema.parse(b.example);
 await editGuest(s=>{const examples=s.groupKnowledge??=[];if(examples.some(e=>e.id===example.id))throw Error('Dossiernummer bestaat al. Gebruik een nieuw versienummer; oude broninformatie blijft behouden.');examples.push(example);});return json({ok:true});
 }
 // Offerte naar de gast sturen (wens eigenaar 5 november 2026): vanaf de gastenmailbox, met de persoonlijke link.
 if(action==='quote-send'){if(!p.manage)throw Error('Geen toestemming voor offertes.');const {sendQuote}=await import('@/lib/quote-mail');return json(await sendQuote(b,who||'backoffice'))}
 if(action==='ai'){const {createGuestDraft}=await import('@/lib/guest-ai');const text=await createGuestDraft(who,z.string().max(100).parse(b.id));return json({text})}
 if(['sync','draft','send','check-send','attachment'].includes(action))throw Error('Gmail-gesprekken lopen via de Gmail-koppeling in Gesprekken.');
 // Klantgegevens uit bestellingen vergeten op verzoek van de gast (AVG). De bestellingen zelf blijven, zonder naam en e-mail.
 if(action==='klant-vergeten'){if(!p.manage)throw Error('Geen toestemming voor klantbeheer.');const {forgetOrderCustomer}=await import('@/lib/order-customers');return json({ok:true,orders:await forgetOrderCustomer(z.email().parse(b.email))})}
 if(action==='signup-paid'){if(!p.manage)throw Error('Geen toestemming voor planningbeheer.');await setSignupPaid(z.uuid().parse(b.id),z.boolean().parse(b.paid),who);return json({ok:true})}
 if(action==='signup-confirm'){if(!p.manage)throw Error('Geen toestemming voor planningbeheer.');await resendConfirmation(z.uuid().parse(b.id));return json({ok:true})}
 if(action==='signup-status'){if(!p.manage)throw Error('Geen toestemming voor planningbeheer.');await setSignupStatus(z.uuid().parse(b.id),z.enum(['aangemeld','geannuleerd']).parse(b.status),who);return json({ok:true})}
 if(action==='calendar'){if(!p.calendar&&!p.manage)throw Error('Geen toestemming voor agendabeheer.');const {syncCalendars}=await import('@/lib/mail-calendar');return json(await syncCalendars())}
 const requestId=z.uuid().parse(b.requestId);if(await guestProcessed(requestId))return json({ok:true,duplicate:true});const loaded=await loadGuest();if(loaded.version!==b.version)return json({error:'Er is elders iets gewijzigd. Ververs eerst.'},409);const s=loaded.state;
 if(['claim','thread','import-chat','thread-delete'].includes(action)){
 if(action==='import-chat'){
 if(!p.manage)throw Error('Geen toestemming.');const chat=z.object({id:z.string().min(1).max(70),customer:z.string().max(300),summary:z.string().max(10000),transcript:z.string().max(30000),messages:z.array(z.object({id:z.string().max(100),from:z.string().max(300),text:z.string().max(30000),at:z.iso.datetime()})).max(200),request:reservationSchema.optional()}).parse(b.chat);
 const id='chat:'+chat.id,old=s.threads.find(t=>t.id===id);if(old)throw Error('Dit chatgesprek is al ontvangen.');if(s.deletedThreads?.includes(id))throw Error('Dit chatgesprek is eerder verwijderd.');const t:Conversation={id,mailbox:'',externalId:chat.id,channel:'chat',subject:chat.summary.slice(0,150)||'Websitegesprek',sender:chat.customer,status:'nieuw',assigned:'',messages:chat.messages.map(m=>({...m,to:'',subject:'',internetId:'',attachments:[]})),draft:'',draftId:'',draftBase:'',draftVersion:0,editingBy:'',editingUntil:0,summary:chat.summary,transcript:chat.transcript,customer:chat.customer,updated:new Date().toISOString()};s.threads.push(t);if(chat.request){const {exception:_e,override:_o,...request}=chat.request;s.reservations.push({...request,id:crypto.randomUUID(),status:'aanvraag',threadId:id,tables:[]});}
 }else{const t=s.threads.find(t=>t.id===b.id);if(!t)throw Error('Gesprek onbekend.');if(t.channel==='gmail')throw Error('Gmail-gesprekken lopen via de Gmail-koppeling in Gesprekken.');if(!p.manage)throw Error('Geen toegang.');if(t.editingBy&&t.editingBy!==who&&t.editingUntil>Date.now())throw Error(t.editingBy+' werkt aan dit gesprek.');if(action==='thread-delete'){
  // Verwijderen (wens eigenaar 8 november 2026): het gesprek en het interne advies gaan weg; gekoppelde aanvragen en
  // reserveringen blijven bestaan. De verwijdering staat in het logboek.
  if(b.confirm!==true)throw Error('Bevestig eerst dat dit gesprek verwijderd mag worden.');
  s.threads=s.threads.filter(x=>x.id!==t.id);if(s.groupAdvice)delete s.groupAdvice[t.id];(s.deletedThreads??=[]).push(t.id);s.deletedThreads=s.deletedThreads.slice(-2000);
 }else if(action==='claim'){t.editingBy=who;t.editingUntil=Date.now()+300000;t.assigned=who;t.status='in behandeling';}else{requireEditor(t,who);const v=z.object({status:z.enum(['nieuw','in behandeling','wacht op gast','afgehandeld']),assigned:z.string().max(100),summary:z.string().max(10000),transcript:z.string().max(30000),customer:z.string().max(300),customerId:z.string().max(400).optional()}).parse(b.thread);if(v.customerId&&!customerCards(customerView(s,p)).some(c=>c.id===v.customerId))throw Error('Klantenkaart niet gevonden.');if(v.customerId&&!s.customers.some(c=>c.id===v.customerId)){const card=customerCards(s).find(c=>c.id===v.customerId)!;saveCustomer(s,card);}Object.assign(t,v);}}
 }else{
 if(!p.manage)throw Error('Geen toestemming voor planningbeheer.');
 switch(action){
 case 'customer':{stale(s.customers.find(c=>c.id===b.customer?.id),b.customer,'Deze klantenkaart');saveCustomer(s,b.customer);break}
 case 'reservation':{const r=reservationSchema.parse(b.reservation);if(r.status==='optie'&&(!Number.isFinite(Date.parse(r.expires))||Date.parse(r.expires)<=Date.now()))throw Error('Kies een toekomstige vervaldatum.');if(r.threadId&&!(mailThreadOf(r.threadId)?mailAccess(who).view&&await mailThreadExists(r.threadId):s.threads.some(t=>t.id===r.threadId&&t.channel==='chat')))throw Error('Geen toegang tot het gekoppelde gesprek.');const previous=s.reservations.find(v=>v.id===r.id);stale(previous,r,'Deze boeking');if(r.customerId&&!customerCards(s).some(c=>c.id===r.customerId))throw Error('Klantenkaart niet gevonden.');const exception=r.exception??previous?.exception,override=r.override??previous?.override;// Handmatig ingeboekt in de backoffice (besluit eigenaar 18 november 2026): openingstijden houden dit niet tegen (manualBooking).
  const next=validateBooking(s,{...r,manual:true,customerId:r.customerId??previous?.customerId,...(exception?{exception}:{}),...(override&&exception?{override:true}:{})});s.reservations=s.reservations.filter(v=>v.id!==r.id);s.reservations.push(next);break}
 // Afspraken (wens eigenaar 9 november 2026): een gesprek met een klant in de agenda. Geen boeking, houdt geen plaats vast.
 case 'appointment':{const a=appointmentSchema.parse(b.appointment),list=s.appointments??=[],old=list.find(x=>x.id===a.id);stale(old,a,'Deze afspraak');
  if(!old&&a.date<today())throw Error('Kies een datum vanaf vandaag.');
  if(a.customerId&&!customerCards(s).some(c=>c.id===a.customerId))throw Error('Klantenkaart niet gevonden.');
  const {rev:_,...clean}=a;s.appointments=[...list.filter(x=>x.id!==a.id),{...clean,created:old?.created||new Date().toISOString(),createdBy:old?.createdBy||who}];break}
 // Overleggen met gasten (wens eigenaar 9 november 2026): notities en actiepunten, met optie in Planning en offerte.
 case 'meeting':{const m=b.meeting as {customerId?:unknown}|undefined;if(typeof m?.customerId==='string'&&m.customerId&&!customerCards(s).some(c=>c.id===m.customerId))throw Error('Klantenkaart niet gevonden.');s.meetings=saveMeeting(s.meetings||[],b.meeting,who||'backoffice').list;break}
 case 'meeting-delete':{const id=z.string().min(1).max(100).parse(b.id);s.meetings=(s.meetings||[]).filter(x=>x.id!==id);break}
 case 'meeting-option':{const m=(s.meetings||[]).find(x=>x.id===b.id);if(!m)throw Error('Overleg niet gevonden.');stale(m,{rev:b.rev},'Dit overleg');
  if(m.reservationId&&s.reservations.some(r=>r.id===m.reservationId&&r.status!=='geannuleerd'))throw Error('Dit overleg heeft al een optie in Planning.');
  const o=z.object({date:dateSchema,from:timeSchema,to:timeSchema,people:z.number().int().min(1).max(1000),activity:z.enum(['bezoek','groep']),expires:z.string().max(40)}).parse(b.option);
  if(!Number.isFinite(Date.parse(o.expires))||Date.parse(o.expires)<=Date.now())throw Error('Kies een toekomstige vervaldatum.');
  const card=customerCards(s).find(c=>c.id===m.customerId),r=reservationSchema.parse({id:crypto.randomUUID(),name:card?.name||m.customerName,email:card?.email||'',phone:card?.phone||'',...o,sharing:false,status:'optie',notes:'Optie uit overleg „'+m.subject+'” van '+m.date+'.',threadId:'',tables:[],...(card?{customerId:card.id}:{}),manual:true});
  s.reservations.push(validateBooking(s,r));s.meetings=linkMeeting(s.meetings!,m.id,{reservationId:r.id},who||'backoffice');break}
 // Boeking verwijderen (wens eigenaar 12 november 2026: „ik kan een reservering niet verwijderen”). Alleen na bevestiging;
 // een boeking met een offerte blijft staan (de offerte verwijst ernaar), die annuleer je. Een overleg dat ernaar verwees
 // verliest alleen die koppeling. De verwijdering staat in het logboek.
 case 'reservation-delete':{const id=z.string().min(1).max(100).parse(b.id);if(b.confirm!==true)throw Error('Bevestig eerst dat deze boeking verwijderd mag worden.');
  if(!s.reservations.some(r=>r.id===id))throw Error('Deze boeking bestaat niet (meer). Ververs de pagina.');
  if((s.quotes||[]).some(q=>q.reservationId===id))throw Error('Bij deze boeking hoort een offerte. Zet de boeking op geannuleerd, of verwijder eerst de offerte.');
  s.reservations=s.reservations.filter(r=>r.id!==id);if(s.meetings)s.meetings=s.meetings.map(m=>m.reservationId===id?{...m,reservationId:''}:m);break}
 // Groepsdag (wens eigenaar 13 november 2026): op één datum groepen ontvangen terwijl het onderdeel uit staat of de dag dicht is.
 // Daggasten en online reserveringen blijven dicht; de gesloten periode zelf verandert niet. De reden staat in de agenda.
 case 'group-day':{const v=groupDaySchema.parse(b.groupDay);if(v.date<today())throw Error('Kies een datum vanaf vandaag.');
  const candidate={...s,groupDays:[...(s.groupDays||[]).filter(g=>g.date!==v.date),v]};
  for(const r of s.reservations.filter(r=>r.date===v.date&&r.activity==='groep'))try{validateBooking(candidate,r)}catch(e){throw Error('De groep '+r.name+' past dan niet meer: '+(e as Error).message)}
  s.groupDays=candidate.groupDays.filter(g=>g.date>=today()).sort((a,b)=>a.date.localeCompare(b.date));audit(s,who,'groepsdag',v.date);break}
 case 'group-day-delete':{const date=dateSchema.parse(b.date);const candidate={...s,groupDays:(s.groupDays||[]).filter(g=>g.date!==date)};
  for(const r of s.reservations.filter(r=>r.date===date&&r.activity==='groep'&&r.status!=='geannuleerd'))try{validateBooking(candidate,r)}catch{throw Error('Op deze dag staat de groep '+r.name+'. Annuleer of verplaats die eerst, of geef die boeking een eigen reden als uitzondering.')}
  s.groupDays=candidate.groupDays;audit(s,who,'groepsdag verwijderd',date);break}
 case 'appointment-delete':{const id=z.string().min(1).max(100).parse(b.id);s.appointments=(s.appointments||[]).filter(x=>x.id!==id);break}
 case 'alternatives':return json({alternatives:alternatives(s,reservationSchema.parse(b.reservation))});
 case 'services':{s.services=z.object({speelboerderij:z.boolean(),winkel:z.boolean(),yte:z.boolean()}).strict().parse(b.services);
  // Uit van … tot en met … per onderdeel (wens eigenaar 6 november 2026). null = geen periode. Bestaande reserveringen blijven bewaard.
  if(b.pauses!==undefined){const pause=z.object({from:dateSchema,to:dateSchema}).strict().refine(p=>p.from<=p.to,{message:'De einddatum ligt vóór de begindatum.'}).nullable();
   s.servicePauses=z.object({speelboerderij:pause,winkel:pause,yte:pause}).strict().parse(b.pauses)}
  break}
 case 'hours':{const h=z.array(hoursSchema).length(7).parse(b.hours);const candidate={...s,hours:h};if(s.reservations.filter(r=>r.date>=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())).some(r=>{try{validateBooking(candidate,r);return false}catch{return true}}))throw Error('Deze tijden conflicteren met bestaande opties of boekingen. Pas die eerst aan.');s.hours=h;break}
 case 'exception':{const v=z.object({date:dateSchema,hours:hoursSchema,note:z.string().max(500)}).parse(b.exception);const candidate={...s,exceptions:[...s.exceptions.filter(e=>e.date!==v.date),v]};if(s.reservations.filter(r=>r.date===v.date).some(r=>{try{validateBooking(candidate,r);return false}catch{return true}}))throw Error('Deze uitzondering conflicteert met bestaande boekingen. Pas die eerst aan.');s.exceptions=candidate.exceptions;break}
 // Offertes (wens eigenaar 5 november 2026): concept dat Sanne aanpast, gekoppeld aan de klantenkaart.
 case 'quote':{const r=saveQuote(s.quotes||[],b.quote,who||'backoffice');s.quotes=r.list;
  // Offerte uit een overleg (9 november 2026): in dezelfde opslag aan dat overleg gekoppeld, eenmalig.
  const m=typeof b.meetingId==='string'?(s.meetings||[]).find(x=>x.id===b.meetingId):undefined;if(m&&!m.quoteId)s.meetings=linkMeeting(s.meetings!,m.id,{quoteId:r.quote.id},who||'backoffice');break}
 case 'quote-delete':{s.quotes=deleteQuote(s.quotes||[],z.string().max(64).parse(b.id));break}
 case 'contact':{const c=contactSchema.safeParse(b.contact);if(!c.success)throw Error(dutchIssue(c.error.issues)||'Controleer de bedrijfsgegevens.');s.contact=c.data;break}
 case 'capacity':{const v=z.object({bezoek:z.number().int().min(0).max(10000),groep:z.number().int().min(0).max(10000)}).parse(b.capacity);const candidate={...s,capacity:v};for(const r of s.reservations.filter(r=>r.date>=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())))validateBooking(candidate,r);s.capacity=v;break}
 case 'yte-service':{const v=z.object({weekday:z.number().int().min(0).max(6),from:timeSchema,to:timeSchema,configured:z.literal(true)}).refine(v=>v.from<v.to).parse(b.service);const candidate={...s,yteService:v};for(const r of s.reservations.filter(r=>r.activity==='yte'&&r.date>=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())))validateBooking(candidate,r);s.yteService=v;break}
 case 'visit':{const v=visitSchema.parse(b.visit);dateSchema.parse(v.date);s.visits=s.visits.filter(o=>o.date!==v.date);s.visits.push(v);break}
 case 'table':{const t=z.object({id:z.string().regex(/^[0-9]{1,3}$/),seats:z.number().int().min(1).max(100)}).parse(b.table);if(s.tables.length>=20)throw Error('Maximaal twintig tafels.');if(s.tables.some(v=>v.id===t.id))throw Error('Tafelnummer bestaat al.');s.tables.push(t);break}
 case 'dayparts':{const v=z.array(daypartSchema).min(1).max(6).refine(d=>new Set(d.map(x=>x.id)).size===d.length,'Twee tijdblokken hebben hetzelfde kenmerk.').parse(b.dayparts);
 const candidate={...s,dayparts:v};
 for(const r of s.reservations.filter(r=>r.activity!=='yte'&&r.date>=today()))try{validateBooking(candidate,r)}catch(e){throw Error('Deze tijdblokken passen niet bij de '+r.activity+' van '+r.name+' op '+r.date+': '+(e instanceof Error?e.message:'')+' Pas die boeking eerst aan.')}
 s.dayparts=v;break}
 case 'event-remove':{const id=z.string().max(100).parse(b.id);s.events=s.events.filter(e=>e.id!==id||e.holiday);break}
 case 'examples':{const v=z.object({kind:z.enum(['events','groups']),add:z.boolean()}).parse(b);
 if(v.kind==='events')s.events=v.add?[...s.events.filter(e=>!e.example),...exampleEvents(today())]:s.events.filter(e=>!e.example);
 else s.reservations=v.add?[...s.reservations.filter(r=>!r.example),...exampleGroups({...s,reservations:s.reservations.filter(r=>!r.example)},today())]:s.reservations.filter(r=>!r.example);
 break}
 case 'event':{const v=z.object({id:z.uuid(),date:dateSchema,from:timeSchema,to:timeSchema,title:z.string().min(1).max(300),holiday:z.boolean(),description:z.string().max(1000).optional(),signup:z.boolean().optional(),capacity:z.number().int().min(0).max(10000).optional(),priceCents:z.number().int().min(0).max(1000000).optional(),paymentInfo:z.string().max(500).optional(),payOnline:z.boolean().optional(),photo:z.string().max(2000).refine(v=>v===''||/^https:\/\//i.test(v)||/^\/api\/media\/[a-f0-9-]{36}$/.test(v),'Kies een foto uit de beeldbank of een https-link.').optional()}).refine(v=>v.from<v.to).parse(b.event);stale(s.events.find(e=>e.id===v.id),b.event,'Dit evenement');s.events=s.events.filter(e=>e.id!==v.id);s.events.push(v);break}
 case 'pickup':{const v=z.object({id:z.uuid(),date:dateSchema,time:timeSchema,name:z.string().min(1).max(300),description:z.string().min(1).max(3000),status:z.enum(['besteld','afgehaald'])}).parse(b.pickup);// Afhalen alleen tijdens de openingstijden (besluit eigenaar 4 november 2026), inclusief gesloten dagen en afwijkende tijden.
 {const h=opening(s,v.date,'winkel');if(!h?.open)throw Error('Op deze dag zijn we gesloten. Afhalen kan alleen tijdens de openingstijden.');if(v.time<h.from||v.time>=h.to)throw Error(`Afhalen kan op deze dag tussen ${h.from} en ${h.to} uur.`);}stale(s.pickups.find(e=>e.id===v.id),b.pickup,'Deze afhaalbestelling');s.pickups=s.pickups.filter(e=>e.id!==v.id);s.pickups.push(v);break}
 default:throw Error('Onbekende actie.');}}
 audit(s,who,action,String(b.id||b.reservation?.id||''));await saveGuest(loaded.version,s,requestId);
 // Reservations and events feed the linked Google calendars (concepts and events); the sync runs in the background.
 if(['reservation','reservation-delete','appointment','appointment-delete','meeting-option','event','event-remove','examples','import-chat'].includes(action)){try{const {hasLinkedCalendars}=await import('@/lib/mail-calendar');if(await hasLinkedCalendars()){const {enqueue}=await import('@/lib/outbox');const {tick}=await import('@/lib/assistant-jobs');await enqueue('agenda-sync:wijziging:'+Date.now(),'agenda-sync');void tick()}}catch{}}
 // Openingstijden, afwijkende dagen en evenementen gaan ook naar het Google Bedrijfsprofiel (als dat gekoppeld is).
 if(['hours','exception','event','event-remove'].includes(action)){try{const {profileReady}=await import('@/lib/google-profile');if(await profileReady()){const {enqueue}=await import('@/lib/outbox');const {tick}=await import('@/lib/assistant-jobs');await enqueue('google-profiel-sync:wijziging:'+Date.now(),'google-profiel-sync');void tick()}}catch{}}
 return json({ok:true});
 }catch(e){return json({error:e instanceof z.ZodError?dutchIssue(e.issues)||'Controleer alle velden en tijden.':e instanceof Error?e.message:'Actie mislukt.'},400)}}

export async function GET(req:Request){try{authorizeSheet(req);return await withConnectionSettings(()=>get(req))}catch{return json({error:'Gegevens niet beschikbaar. Controleer de toegang en de beveiligde instellingen.'},503)}}
export async function POST(req:Request){try{authorizeSheet(req,true);return await withConnectionSettings(()=>post(req))}catch{return json({error:'Actie niet uitgevoerd. Controleer de toegang en de beveiligde instellingen.'},403)}}
