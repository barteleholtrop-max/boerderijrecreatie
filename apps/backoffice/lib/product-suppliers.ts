// Wie levert het product (wens eigenaar 9 november 2026: „ik zie nog niet in het klein wie de producten levert”): de voornaam van
// het lid dat eigenaar is (coöperatieve winkel), anders de beheerder van de onderdeelpot of de naam van de pot. Alleen een
// voornaam, nooit een achternaam of andere gegevens. Gebruikt door Gerechten & prijzen, de kassa en de openbare productlijst.
import {env} from './portable/env';
export async function productSuppliers(){
 const own=(await env.DB.prepare("SELECT o.product_id AS id,p.name FROM product_owners o JOIN coop_participants p ON p.id=o.participant_id WHERE o.participant_id IS NOT NULL").all()).results as {id:string;name:string}[];
 const funds=(await env.DB.prepare("SELECT f.product_id AS id,m.name AS person,u.name AS fund FROM unit_fund_products f JOIN unit_funds u ON u.id=f.fund_id LEFT JOIN coop_participants m ON m.id=u.manager_id").all()).results as {id:string;person:string|null;fund:string}[];
 const first=(n:string)=>n.trim().split(/\s+/)[0]||n;
 return new Map<string,string>([...funds.map(r=>[r.id,r.person?first(r.person):r.fund] as const),...own.map(r=>[r.id,first(r.name)] as const)]);
}

// Bedrijfsnaam van het lid dat eigenaar is (wens eigenaar 17 november 2026: de prijzen op de pagina van Nijemoed Bloemen komen uit het
// profiel van Bindert). Alleen de naam die het lid zelf als bedrijf invulde (Lid als bedrijf), nooit KvK, adres of andere gegevens.
export async function productCompanies(){
 const rows=(await env.DB.prepare("SELECT o.product_id AS id,p.company FROM product_owners o JOIN coop_participants p ON p.id=o.participant_id WHERE o.participant_id IS NOT NULL AND p.company<>''").all()).results as {id:string;company:string}[];
 return new Map<string,string>(rows.flatMap(r=>{try{const n=(JSON.parse(r.company) as {name?:unknown}).name;return typeof n==='string'&&n.trim()?[[r.id,n.trim()] as const]:[]}catch{return []}}));
}
