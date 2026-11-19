// Claude key for the Weekassistent and recipe proposals.
// Order: the key saved on Systeem & koppelingen (Gast-AI, central connection settings; an explicitly emptied key disables it),
// then ANTHROPIC_API_KEY in .env.local, then a key saved earlier in the old per-connection table (integration_settings, 2 November 2026).
import {getDb} from '@/db';
import {integrationSettings} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {unseal} from './sheets';
import {loadConnectionSettings} from './connection-settings';
import {workspaceHeaders} from './claude-workspace';

/** Kop met het werkruimte-ID voor de Claude-client (lib/claude-workspace.ts): eerst Systeem & koppelingen, dan de server. */
export async function anthropicHeaders():Promise<Record<string,string>|undefined>{
 try{const saved=(await loadConnectionSettings()).values;if(Object.hasOwn(saved,'ANTHROPIC_WORKSPACE_ID'))return workspaceHeaders(saved.ANTHROPIC_WORKSPACE_ID)}catch{}
 return workspaceHeaders(process.env.ANTHROPIC_WORKSPACE_ID);
}
export async function anthropicKey():Promise<string|null>{
 try{const saved=(await loadConnectionSettings()).values;if(Object.hasOwn(saved,'ANTHROPIC_API_KEY'))return saved.ANTHROPIC_API_KEY||null}catch{}
 if(process.env.ANTHROPIC_API_KEY)return process.env.ANTHROPIC_API_KEY;
 try{const r=(await getDb().select({secret:integrationSettings.secret}).from(integrationSettings).where(eq(integrationSettings.id,'claude')))[0];return r?await unseal(r.secret):null}catch{return null}
}
