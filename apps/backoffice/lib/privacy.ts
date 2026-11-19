// Privacy voor alle sites (wens eigenaar 15 november 2026): opslaan en lezen. De regels zelf staan in lib/privacy-core.ts.
import {getDb} from '@/db';
import {privacyPolicy} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {env} from './portable/env';
import {companyProfile} from './company';
import type {Contact} from './guest-core';
import {DEFAULT_POLICY,PrivacyError,normalizePolicy,parsePolicy,publicPolicy,type Controller,type Policy} from './privacy-core';

export type Stored={policy:Policy;version:number;updated:string;updatedBy:string};

export async function getPrivacy():Promise<Stored>{
 const [row]=await getDb().select().from(privacyPolicy).where(eq(privacyPolicy.id,'main'));
 if(!row)return {policy:DEFAULT_POLICY,version:0,updated:'',updatedBy:''};
 return {policy:parsePolicy(row.data),version:row.version,updated:row.updated,updatedBy:row.updatedBy};
}

/** Alleen wat een site mag tonen uit Bedrijfsgegevens: naam, adres, KvK en het algemene e-mailadres. */
export async function controller():Promise<Controller>{
 const row=await env.DB.prepare('SELECT data FROM guest_settings WHERE id=1').first() as {data:string}|null;
 let contact:Partial<Contact>={};try{contact=(JSON.parse(row?.data||'{}') as {contact?:Partial<Contact>}).contact||{}}catch{}
 const c=companyProfile(contact);
 return {name:c.tradeName,street:c.street,postalCode:c.postalCode,city:c.city,kvk:c.kvk,email:c.email};
}

export async function publicPrivacy(){
 const [p,c]=await Promise.all([getPrivacy(),controller()]);
 return publicPolicy(p.policy,c,p.updated);
}

/** Slaat op als niemand het intussen wijzigde (versie). Opslaan = meteen op alle sites, binnen twee minuten. */
export async function savePrivacy(input:unknown,version:unknown,by:string){
 const policy=normalizePolicy(input);
 if(typeof version!=='number'||!Number.isInteger(version)||version<0)throw new PrivacyError('Ongeldige aanvraag.');
 const db=getDb(),updated=new Date().toISOString(),data=JSON.stringify(policy),who=String(by||'eigenaar').slice(0,120);
 const conflict=new PrivacyError('Iemand anders heeft het privacybeleid net gewijzigd. Ververs en probeer opnieuw.',409);
 if(version===0){
  const r=await db.insert(privacyPolicy).values({id:'main',data,version:1,updated,updatedBy:who}).onConflictDoNothing().returning({id:privacyPolicy.id});
  if(!r.length)throw conflict;
  return {version:1,updated};
 }
 const r=await db.update(privacyPolicy).set({data,version:version+1,updated,updatedBy:who}).where(and(eq(privacyPolicy.id,'main'),eq(privacyPolicy.version,version))).returning({id:privacyPolicy.id});
 if(!r.length)throw conflict;
 return {version:version+1,updated};
}
