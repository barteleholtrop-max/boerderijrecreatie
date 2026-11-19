// Toegangslijst (inloggen via Supabase: Google of e-mail en wachtwoord, altijd met Authenticator). Server only. Zie lib/login-core.ts.
import {getDb} from '@/db';
import {accessAccounts} from '@/db/schema';
import {eq,and,asc} from 'drizzle-orm';
import {normalizeEmail,validEmail,validRole,type Role} from './login-core';
import {validModules} from './onderdelen';
const parseList=(v:string)=>{try{return JSON.parse(v)}catch{return []}};

export class AccessError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
const now=()=>new Date().toISOString();

/** Het actieve account bij dit e-mailadres, of null (niet op de lijst of uitgezet). */
export async function activeAccount(email:string){
 const row=(await getDb().select().from(accessAccounts).where(and(eq(accessAccounts.email,normalizeEmail(email)),eq(accessAccounts.active,1))))[0];
 return row?{email:row.email,name:row.name,role:row.role as Role,modules:row.role==='eigenaar'?[]:validModules(parseList(row.modules)),quick:row.quickLogin===1}:null;
}
/** Na een geslaagde login (met code): tijdstip en de Supabase-gebruiker bij dit adres. */
export async function noteLogin(email:string,authId?:string){await getDb().update(accessAccounts).set({lastLogin:now(),...(authId?{authId}:{})}).where(eq(accessAccounts.email,normalizeEmail(email)))}
/** De Supabase-gebruiker bij dit adres (bekend na de eerste login), voor het weghalen van een Authenticator. */
export async function authIdOf(email:string){return (await getDb().select({authId:accessAccounts.authId}).from(accessAccounts).where(eq(accessAccounts.email,normalizeEmail(email))))[0]?.authId||''}
export async function listAccounts(){return getDb().select().from(accessAccounts).orderBy(asc(accessAccounts.email))}

/** Toevoegen of wijzigen. Er blijft altijd minstens één actieve eigenaar over. */
export async function saveAccount(input:{email:unknown;name:unknown;role:unknown;active:unknown;modules?:unknown;quick?:unknown},by:string){
 const email=normalizeEmail(input.email),name=typeof input.name==='string'?input.name.trim().slice(0,80):'';
 if(!validEmail(email))throw new AccessError('Vul een geldig e-mailadres in (Google-account of eigen adres).');
 if(!validRole(input.role))throw new AccessError('Kies eigenaar of medewerker.');
 if(typeof input.active!=='boolean')throw new AccessError('Ongeldige aanvraag.');
 const active=input.active?1:0,role=input.role;
 // Onderdelen alleen voor een medewerker; een eigenaar mag alles. Niet meegegeven = ongewijzigd laten.
 const modules=input.modules===undefined?undefined:JSON.stringify(role==='eigenaar'?[]:validModules(input.modules));
 if(input.modules!==undefined&&!Array.isArray(input.modules))throw new AccessError('Ongeldige onderdelen.');
 // Zonder code binnenkomen (wens eigenaar 13 november 2026). Niet meegegeven = ongewijzigd laten.
 if(input.quick!==undefined&&typeof input.quick!=='boolean')throw new AccessError('Ongeldige aanvraag.');
 const quick=input.quick===undefined?undefined:input.quick?1:0;
 if(role!=='eigenaar'||!active)await keepOwner(email);
 const at=now();
 await getDb().insert(accessAccounts).values({email,name,role,active,modules:modules??'[]',quickLogin:quick??0,created:at,createdBy:by,updated:at,updatedBy:by})
  .onConflictDoUpdate({target:accessAccounts.email,set:{name,role,active,...(modules!==undefined?{modules}:{}),...(quick!==undefined?{quickLogin:quick}:{}),updated:at,updatedBy:by}});
}
export async function removeAccount(emailInput:unknown){
 const email=normalizeEmail(emailInput);if(!validEmail(email))throw new AccessError('Ongeldig e-mailadres.');
 await keepOwner(email);
 await getDb().delete(accessAccounts).where(eq(accessAccounts.email,email));
}
async function keepOwner(changing:string){
 const owners=(await getDb().select().from(accessAccounts).where(and(eq(accessAccounts.role,'eigenaar'),eq(accessAccounts.active,1)))).filter(r=>r.email!==changing);
 if(!owners.length)throw new AccessError('Er moet altijd minstens één eigenaar overblijven, anders kan niemand de lijst meer beheren.',409);
}
