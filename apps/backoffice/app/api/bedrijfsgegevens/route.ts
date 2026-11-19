// Bedrijfsgegevens lezen (wens eigenaar 5 november 2026): het profiel zoals facturen en documenten het gebruiken,
// inclusief een IBAN dat nog bij Systeem & koppelingen → Facturen stond. Opslaan loopt via /api/gasten (action contact),
// met dezelfde versiecontrole en alleen voor de eigenaar.
import {withConnectionSettings} from '@/lib/connection-settings';
import {connectionSetting} from '@/lib/connection-runtime';
import {authorizeSheet} from '@/lib/sheet-access';
import {loadGuest} from '@/lib/guest-store';
import {companyProfile} from '@/lib/company';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){
 try{authorizeSheet(req);return await withConnectionSettings(async()=>{const {state}=await loadGuest();return json({company:companyProfile(state.contact,connectionSetting)})})}
 catch{return json({error:'Bedrijfsgegevens niet beschikbaar. Controleer de toegang.'},503)}
}
