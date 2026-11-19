import {werkstationOrigin} from '@/lib/member-origin';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {isOwnerRequest} from '@/lib/owner';
import {noteSensitive} from '@/lib/gevoelig';
import {createPairing,listDevices,revokeDevice,TabletError} from '@/lib/werkplek-pas';
import {showPairCode} from '@/lib/werkplek-pas-core';
import {PAIR_SECONDS} from '@/lib/werkplek-pas-core';
export const dynamic='force-dynamic';
// Werkplektablets (Systeem → Toegang): koppelen met een QR-code en ontkoppelen. Alleen een eigenaar. Valt onder /api/toegang,
// dus de proxy vraagt opnieuw de Authenticator-code als de laatste langer dan 10 minuten geleden is (lib/gevoelig.ts).
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof TabletError?json({error:e.message},e.status):(console.error('[tablets]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
const ownerOnly=(req:Request,write=false)=>{authorizeSheet(req,write);if(!isOwnerRequest(req))throw new TabletError('Alleen een eigenaar kan tablets koppelen.',403)};
// Nieuwe tablets koppelen op het eigen werkstation-adres als dat er is (13 november 2026), anders op het Google-adres.
const origin=(req:Request)=>werkstationOrigin()||process.env.APP_ORIGIN||new URL(req.url).origin;
export async function GET(req:Request){try{ownerOnly(req);return json({tablets:await listDevices()})}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 ownerOnly(req,true);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
 const raw=await req.text();if(raw.length>1000)throw new TabletError('Ongeldige aanvraag.');
 let b:Record<string,unknown>={};try{b=JSON.parse(raw)}catch{throw new TabletError('Ongeldige aanvraag.')}
 if(b.action==='koppelen'){
  const p=await createPairing(b.name,by);await noteSensitive(req,'tablet:koppelcode',{naam:p.name});
  const url=origin(req)+'/tablet/koppelen#'+p.code;
  const QRCode=(await import('qrcode')).default,qr=await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:2,width:300,color:{dark:'#000000',light:'#ffffff'}});
  // Ook als korte code om te typen op een scherm zonder camera (wens eigenaar 15 november 2026), met het adres van de werkstations.
  return json({name:p.name,expires:p.expires,seconds:PAIR_SECONDS,qr,url,code:showPairCode(p.code),site:origin(req)});
 }
 if(b.action==='ontkoppelen'){await revokeDevice(b.id,by);await noteSensitive(req,'tablet:ontkoppeld',{id:b.id});return json({ok:true,tablets:await listDevices()})}
 throw new TabletError('Onbekende actie.');
}catch(e){return fail(e)}}
