import QRCode from 'qrcode';
import {allowedOrigins} from '@/lib/public-orders';
export const dynamic='force-dynamic';
// QR-code voor de zelfservicekassa (besluit eigenaar 4 november 2026): de gast scant de betaalpagina van Mollie met de
// eigen telefoon. Alleen betaalpagina's van Mollie (en een lokale testserver) worden omgezet; niets anders.
// Gezamenlijke rekening (5 november 2026): ook links naar de eigen website (meedoen met de code, betaalverzoek per deel).
// Betaalverzoek van bunq (10 november 2026): ook bunq.me-links.
const own=()=>[...allowedOrigins(),process.env.BACKOFFICE_TUNNEL_ORIGIN?.trim().replace(/\/$/,'')].filter(Boolean);
const allowed=(v:string)=>{try{const u=new URL(v);return (u.protocol==='https:'&&(u.hostname==='www.mollie.com'||u.hostname==='mollie.com'||u.hostname==='bunq.me'||u.hostname==='www.bunq.me'))||(u.protocol==='http:'&&/^(127\.0\.0\.1|localhost)$/.test(u.hostname))||own().includes(u.origin)}catch{return false}};
export async function GET(req:Request){
 const url=new URL(req.url).searchParams.get('url')||'';
 if(url.length>500||!allowed(url))return new Response('Ongeldige betaalpagina.',{status:400,headers:{'Cache-Control':'no-store'}});
 const svg=await QRCode.toString(url,{type:'svg',margin:1,errorCorrectionLevel:'M',color:{dark:'#263d30',light:'#ffffff'}});
 return new Response(svg,{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'private, max-age=600','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
}
