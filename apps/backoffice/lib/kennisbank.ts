// Kennisbank voor gastmail (wens eigenaar 9 november 2026). Server only. Regels en teksten: lib/kennisbank-core.ts.
import {getDb} from '@/db';
import {guestKb} from '@/db/schema';
import {and,eq,desc,ne} from 'drizzle-orm';
import {aiChoice,generateText} from './ai-text';
import {connectionSetting} from './connection-runtime';
import {MailError} from './mail-store';
import {parseKbItem,checkProposals,assistantKnowledge,KB_SYSTEM,CHUNK_CHARS,type KbStatus} from './kennisbank-core';
const now=()=>new Date().toISOString();
const SOURCES=['trello','wix','tekst','whatsapp'] as const;

export async function listKb(){
 const rows=await getDb().select().from(guestKb).where(ne(guestKb.status,'afgewezen')).orderBy(desc(guestKb.updated)).limit(2000);
 return rows.map(r=>({id:r.id,kind:r.kind,title:r.title,answer:r.answer,source:r.source,sourceNote:r.sourceNote,status:r.status as KbStatus,version:r.version,updated:r.updated,updatedBy:r.updatedBy}));
}
/** Nieuw item (meteen goedgekeurd: iemand typte het zelf) of een wijziging, beveiligd met het versienummer. */
export async function saveKb(by:string,raw:unknown){
 const b=(raw&&typeof raw==='object'?raw:{}) as {id?:unknown;version?:unknown};const item=parseKbItem(raw),at=now();
 if(typeof b.id!=='string'||!b.id){await getDb().insert(guestKb).values({id:crypto.randomUUID(),...item,source:'handmatig',status:'goedgekeurd',created:at,createdBy:by,updated:at,updatedBy:by});return}
 const got=await getDb().update(guestKb).set({...item,status:'goedgekeurd',version:Number(b.version)+1,updated:at,updatedBy:by}).where(and(eq(guestKb.id,b.id),eq(guestKb.version,Number(b.version)))).returning({id:guestKb.id});
 if(!got.length)throw new MailError('Dit item is intussen door iemand anders gewijzigd. Ververs de pagina.',409);
}
export async function setKbStatus(by:string,id:unknown,version:unknown,status:unknown){
 if(typeof id!=='string'||!['goedgekeurd','afgewezen'].includes(String(status)))throw new MailError('Ongeldige aanvraag.');
 const got=await getDb().update(guestKb).set({status:String(status),version:Number(version)+1,updated:now(),updatedBy:by}).where(and(eq(guestKb.id,id),eq(guestKb.version,Number(version)))).returning({id:guestKb.id});
 if(!got.length)throw new MailError('Dit item is intussen door iemand anders gewijzigd. Ververs de pagina.',409);
}
/** Eén stuk uit een export: de assistent stelt kennisitems voor; ze wachten op goedkeuring. De tekst zelf wordt niet bewaard. */
export async function proposeFromChunk(by:string,source:unknown,note:unknown,text:unknown){
 const src=SOURCES.find(s=>s===source);if(!src)throw new MailError('Kies de bron: Trello, Wix, WhatsApp of tekst.');
 if(typeof text!=='string'||!text.trim()||text.length>CHUNK_CHARS+2000)throw new MailError('Ongeldig stuk tekst.');
 const choice=aiChoice(connectionSetting);if(choice.missing)throw new MailError(choice.missing,409);
 const existing=(await getDb().select({t:guestKb.title}).from(guestKb)).map(r=>r.t);
 const raw=await generateText(choice,{system:KB_SYSTEM,user:JSON.stringify({bestaandeTitels:existing.slice(0,300),bron:text}),maxTokens:4000,timeoutMs:90000});
 const items=checkProposals(raw,existing),at=now(),sourceNote=typeof note==='string'?note.slice(0,200):'';
 for(const i of items)await getDb().insert(guestKb).values({id:crypto.randomUUID(),...i,source:src,sourceNote,status:'voorstel',created:at,createdBy:by,updated:at,updatedBy:by});
 return items.length;
}
/** Goedgekeurde kennis voor de assistent (lib/guest-ai.ts). Gooit nooit: zonder kennisbank gewoon zonder. */
export async function approvedKnowledge(){
 try{return assistantKnowledge(await getDb().select({kind:guestKb.kind,title:guestKb.title,answer:guestKb.answer,updated:guestKb.updated}).from(guestKb).where(eq(guestKb.status,'goedgekeurd')))}catch{return []}
}
