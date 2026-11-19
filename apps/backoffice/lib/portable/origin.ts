// Komt dit verzoek van onze eigen site? De Origin-kop moet precies ons adres zijn.
// Uitzondering (12 november 2026): de hele site stuurt Referrer-Policy no-referrer (geheime codes in ledenlinks, zie
// next.config.ts). Dan zet de browser bij een gewoon HTML-formulier (POST) „Origin: null”, ook op onze eigen pagina's. Zo gaf
// „Inloggen met Google” voor leden en elk uitlogformulier „Ongeldige herkomst”. Bij „null” telt daarom de kop Sec-Fetch-Site:
// die zet alleen de browser zelf (een script of een andere site kan hem niet kiezen), en „same-origin” betekent: van onze site.
import {knownOrigins} from '../member-origin';
// Eigen adressen (13 november 2026, lib/member-origin.ts: leden, backoffice, management): ook die zijn onze eigen site.
export function isSameOrigin(request:Request){
 const configured=process.env.APP_ORIGIN;const expected=new URL(configured||request.url).origin;const origin=request.headers.get('origin');
 if(origin===expected||origin&&knownOrigins().includes(origin))return true;
 return origin==='null'&&request.headers.get('sec-fetch-site')==='same-origin';
}
