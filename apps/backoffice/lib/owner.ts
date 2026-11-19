// Is dit verzoek van een eigenaar? Alleen wat de proxy zelf zet telt (de proxy haalt deze kopteksten van elke bezoeker
// weg). Met inloggen aan: de rol uit de sessie (eigenaar op de toegangslijst). Zonder login (ontwikkelen, besluit eigenaar
// 3 november 2026) is iedereen eigenaar. Vervangt de oude vergelijking met BASIC_AUTH_USER (besluit eigenaar 6 november 2026).
export function isOwnerRequest(req:Request){
 if(req.headers.get('x-boer-bart-verified-user')!=='owner')return false;
 const role=req.headers.get('x-boer-bart-role');
 return !role||role==='eigenaar';
}
