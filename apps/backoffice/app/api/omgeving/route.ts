import {withConnectionSettings} from '@/lib/connection-settings';
import {onlineMode,onlineVia} from '@/lib/online-payments';
import {sendEnabled} from '@/lib/mail-store';
import {connectionSetting} from '@/lib/connection-runtime';
import {connectionState} from '@/lib/bunq';
export const dynamic='force-dynamic';
// Test of live (wens eigenaar 9 november 2026: „alle sandboxes eruit”): de schermen laten zien of online betalen echt geld
// is (Mollie live, of een bunq-betaalverzoek met BUNQ_LIVE_ENABLED=1), in de testmodus staat of uit staat, en of er echt mail uitgaat.
// Alleen de stand, nooit een sleutel. Voor iedereen die is ingelogd (ook een werkplektablet).
export async function GET(){
 try{return await withConnectionSettings(async()=>{
  return Response.json({betalen:onlineMode(),via:onlineVia(),mail:sendEnabled(),koppelingen:connectionState(connectionSetting)},{headers:{'Cache-Control':'private, no-store'}})})}
 catch{return Response.json({betalen:'onbekend',mail:false},{headers:{'Cache-Control':'private, no-store'}})}
}
