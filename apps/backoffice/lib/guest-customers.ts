import {z} from 'zod';
import type {Conversation,GuestState,Reservation} from './guest-core';
export const customerSchema=z.object({id:z.string().min(1).max(400),name:z.string().trim().min(1).max(300),email:z.union([z.literal(''),z.email()]).transform(v=>v.trim().toLowerCase()),phone:z.string().trim().max(100),company:z.string().trim().max(300),address:z.string().trim().max(1000),notes:z.string().max(5000),updated:z.string().max(40).optional()});
export type Customer=z.infer<typeof customerSchema>;
/** Bestellingen van een gast die „Onthoud mij als klant” aanvinkte (lib/order-customers.ts), per e-mailadres. */
export type CardOrders={email:string;name:string;phone:string;count:number;totalCents:number;first:string;last:string;favorites:{name:string;quantity:number}[];recent:{id:number;created:string;cents:number;reference:string}[]};
export type CustomerCard=Customer&{threadIds:string[];reservationIds:string[];signupIds:string[];source:'opgeslagen'|'bestaande gegevens';orders?:CardOrders};
/** An event sign-up from the website, as it counts for the customer cards (matched on e-mail address). */
export type CardSignup={id:string;name:string;email:string;phone:string};
export function contactEmail(raw:string){const value=raw.trim(),match=value.match(/<([^<>]+)>/);const address=(match?match[1]:value).trim().toLowerCase();return z.email().safeParse(address).success?address:'';}
const emailKey=(email:string)=>'email:'+email;
export function threadContact(t:Conversation){const email=contactEmail(t.sender)||contactEmail(t.customer);const label=t.customer&&!contactEmail(t.customer)?t.customer:t.sender.replace(/<[^<>]+>/g,'').replace(/^"|"$/g,'').trim();return {email,name:label||email||'Onbekende gast'};}
/** Read model over existing records. Names/phone numbers alone never merge people automatically. */
export function customerCards(s:GuestState,signups:CardSignup[]=[],orderCards:CardOrders[]=[]):CustomerCard[]{
 const cards=new Map<string,CustomerCard>();for(const c of s.customers||[])cards.set(c.id,{...c,threadIds:[],reservationIds:[],signupIds:[],source:'opgeslagen'});
 function find(id:string|undefined,email:string){if(id&&cards.has(id))return id;const saved=email?[...cards.values()].filter(c=>c.email.toLowerCase()===email):[];return saved.length===1?saved[0].id:email?emailKey(email):'';}
 function add(key:string,name:string,email:string,phone=''){let c=cards.get(key);if(!c){c={id:key,name,email,phone,company:'',address:'',notes:'',updated:'',threadIds:[],reservationIds:[],signupIds:[],source:'bestaande gegevens'};cards.set(key,c)}if(!c.phone)c.phone=phone;return c;}
 for(const t of s.threads){const info=threadContact(t),key=find(t.customerId,info.email)||'gesprek:'+t.id;add(key,info.name,info.email).threadIds.push(t.id)}
 for(const r of s.reservations){const email=contactEmail(r.email),linkedThread=r.threadId?[...cards.values()].find(c=>c.threadIds.includes(r.threadId)):undefined;const key=find(r.customerId,email)||(linkedThread?.id||'reservering:'+r.id);add(key,r.name,email,r.phone).reservationIds.push(r.id)}
 // Event sign-ups join the card with the same e-mail address automatically (3 November 2026).
 for(const x of signups){const email=contactEmail(x.email);const key=find(undefined,email)||'aanmelding:'+x.id;add(key,x.name,email,x.phone).signupIds.push(x.id)}
 // Bestellingen met toestemming (8 november 2026): op de kaart met hetzelfde e-mailadres, anders een eigen kaart.
 for(const o of orderCards){const email=contactEmail(o.email);if(!email)continue;add(find(undefined,email)||emailKey(email),o.name,email,o.phone).orders=o}
 return [...cards.values()].sort((a,b)=>a.name.localeCompare(b.name,'nl'));
}
export function cardForThread(cards:CustomerCard[],id:string){return cards.find(c=>c.threadIds.includes(id));}
export function cardForReservation(cards:CustomerCard[],id:string){return cards.find(c=>c.reservationIds.includes(id));}
export function saveCustomer(s:GuestState,input:unknown){
 const c=customerSchema.parse(input),cards=customerCards(s),old=cards.find(v=>v.id===c.id);
 const duplicate=c.email&&cards.find(v=>v.id!==c.id&&v.email===c.email);if(duplicate)throw Error('Er bestaat al een klantenkaart met dit e-mailadres. Open die kaart om de gegevens aan te passen.');
 // Materialize an existing card without copying or rewriting its historical booking records.
 if(old){for(const t of s.threads)if(old.threadIds.includes(t.id))t.customerId=c.id;for(const r of s.reservations)if(old.reservationIds.includes(r.id))r.customerId=c.id;}
 const saved={...c,updated:new Date().toISOString()};s.customers=[...(s.customers||[]).filter(v=>v.id!==c.id),saved];return saved;
}
export function customerContext(s:GuestState,t:Conversation){return cardForThread(customerCards(s),t.id)||null;}

export function customerView(s:GuestState,access:{manage:boolean;mailboxes:string[]}){const visible=structuredClone(s);delete visible.groupAdvice;if(!access.manage){delete visible.groupKnowledge;delete visible.quotes}visible.threads=visible.threads.filter(t=>t.channel==='chat'?access.manage:access.mailboxes.includes(t.mailbox));if(!access.manage){visible.reservations=visible.reservations.filter(r=>r.threadId&&visible.threads.some(t=>t.id===r.threadId));visible.customers=visible.customers.filter(c=>visible.threads.some(t=>t.customerId===c.id||c.email&&threadContact(t).email===c.email)||visible.reservations.some(r=>r.customerId===c.id||c.email&&contactEmail(r.email)===c.email));}return visible;}
