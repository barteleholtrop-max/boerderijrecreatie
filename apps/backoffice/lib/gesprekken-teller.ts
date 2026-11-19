// Bolletje op de app Management (wens eigenaar 18 november 2026: „bij de management app nog geen bolletje dat we iets
// moeten doen”): hoeveel gesprekken op ons wachten. Zelfde telling als het filter „Wacht op ons” in Gesprekken:
// mail, WhatsApp, Messenger, Instagram en websitechat waar de klant wacht of na afhandeling opnieuw schreef.
import {listThreads} from './mail-store';
import {listMetaThreads} from './meta-store';
import {loadGuest} from './guest-store';
import {isWaiting,chatWaits} from './gesprekken-teller-core';


export async function waitingCount(){
 const [mail,meta,guest]=await Promise.all([
  listThreads('klant-wacht').catch(()=>[]),
  listMetaThreads().catch(()=>[]),
  loadGuest().then(g=>g.state.threads.filter(t=>t.channel==='chat')).catch(()=>[]),
 ]);
 return mail.length+meta.filter(t=>isWaiting(t.waiting)).length+guest.filter(t=>chatWaits(t.status)).length;
}
