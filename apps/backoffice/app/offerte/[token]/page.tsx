// Offerte voor de gast (wens eigenaar 5 november 2026): de persoonlijke link uit de mail is de toegang. Alleen lezen;
// de gast ziet altijd de laatst opgeslagen versie. Online akkoord of een wijziging vragen (wens eigenaar 5 november 2026).
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {quoteByToken} from '@/lib/quote-mail';
import {publicQuote,respondProblem} from '@/lib/quotes';
import {loadGuest} from '@/lib/guest-store';
import {companyProfile} from '@/lib/company';
import {QuoteSheet} from '../../offertes/sheet';
import {PrintButton} from './print';
import {Respond} from './respond';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Offerte · Boer Bart',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function GuestQuote({params}:{params:Promise<{token:string}>}){
 const {token}=await params,q=await quoteByToken(token);if(!q)notFound();
 const {state}=await loadGuest(),co=companyProfile(state.contact),p=publicQuote(q);
 return <div className="sales-doc-page guest-quote" data-bb-view="guest-quote">
  <div className="sales-doc-bar no-print"><PrintButton/><span className="small">Kies bij het afdrukken „Opslaan als PDF”.</span></div>
  {['afgewezen','vervallen'].includes(p.status)&&<p className="message no-print">Deze offerte is niet meer geldig. Neem contact met ons op voor een nieuw voorstel.</p>}
  <QuoteSheet q={p} co={co}/>
  <Respond token={token} rev={p.rev} totalCents={p.totals.totalCents} name={q.customer.name} problem={q.accepted?'':respondProblem(q,new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()))} accepted={p.accepted} question={p.question}/>
 </div>;
}
