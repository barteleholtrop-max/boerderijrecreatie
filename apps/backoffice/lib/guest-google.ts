import {connectionSetting} from './connection-runtime';
import {z} from 'zod';
import type {Conversation} from './guest-core';
// Access rules of the guest workspace (Planning, chats, customer cards). Gmail itself runs through the Gmail connection
// (lib/gmail-api.ts, lib/mail-store.ts) and Google Agenda through lib/mail-calendar.ts, both with the OAuth login on Gesprekken.
const configured=z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,40}$/),email:z.email(),tokenEnv:z.string().regex(/^[A-Z][A-Z0-9_]+$/),calendarId:z.string().max(300).optional()})).max(10);
export type Mailbox=z.infer<typeof configured>[number];
export function mailboxes():Mailbox[]{try{return configured.parse(JSON.parse(connectionSetting('GUEST_GOOGLE_MAILBOXES')||'[]'))}catch{return []}}
/** owner: is dit een eigenaar (lib/owner.ts)? Zonder GUEST_ACCESS heeft alleen een eigenaar alle mailboxen. */
export function permissions(account:string,owner=false){
 const raw=process.env.GUEST_ACCESS;if(raw){const p=JSON.parse(raw)[account];return {mailboxes:Array.isArray(p?.mailboxes)?p.mailboxes as string[]:[],send:p?.send===true,calendar:p?.calendar===true,manage:p?.manage===true};}
 return {mailboxes:owner?mailboxes().map(m=>m.id):[],send:owner,calendar:owner,manage:owner};
}
export function requireEditor(t:Conversation,account:string){if(t.editingBy!==account||t.editingUntil<Date.now())throw Error('Neem eerst het gesprek in behandeling. Een andere medewerker kan eraan werken.');}
