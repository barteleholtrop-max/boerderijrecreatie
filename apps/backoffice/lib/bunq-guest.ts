// bunq voor gastbetalingen (betaalverzoek): de sessie en de rekening waarop gasten betalen.
// Overgenomen uit de Boer Bart-backoffice (lib/bank-split.ts), zonder de bankverdeling van de coöperatie.
// De rekening: GUEST_BUNQ_ACCOUNT_ID (Koppelingen → bunq); leeg = de eerste actieve rekening.
import {getDb} from '@/db';
import {bunqSession} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {seal,unseal} from './sheets';
import {connectionSetting} from './connection-runtime';
const now=()=>new Date().toISOString();
import {bunqClient,listAccounts,type BunqClient,type BunqSession,type SessionStore} from './bunq';
const sessionStore:SessionStore={
 async load(){const r=(await getDb().select().from(bunqSession).where(eq(bunqSession.id,'main')))[0];if(!r)return null;try{return JSON.parse(await unseal(r.dataSealed)) as BunqSession}catch{return null}},
 async save(s){const data=await seal(JSON.stringify(s)),t=now();
  await getDb().insert(bunqSession).values({id:'main',fingerprint:s.fingerprint,dataSealed:data,updated:t}).onConflictDoUpdate({target:bunqSession.id,set:{fingerprint:s.fingerprint,dataSealed:data,updated:t}})},
};
export async function bunq():Promise<BunqClient>{return bunqClient((connectionSetting('GUEST_BUNQ_API_KEY')||'').trim(),sessionStore)}
/** De rekening waarop gasten betalen; null als bunq geen actieve rekening teruggeeft. */
export async function guestAccountId(c:BunqClient):Promise<number|null>{
 const set=Number((connectionSetting('GUEST_BUNQ_ACCOUNT_ID')||'').trim());if(Number.isSafeInteger(set)&&set>0)return set;
 const list=await listAccounts(c);return list.find(a=>a.status==='ACTIVE')?.id??list[0]?.id??null;
}
