// Server only: controleren dat een webhookbericht echt van Meta komt (akkoord eigenaar 9 november 2026).
import {createHmac,timingSafeEqual} from 'node:crypto';
/** X-Hub-Signature-256 van Meta: HMAC-SHA256 over de ruwe body met het app-geheim. Zonder geheim nooit geldig. */
export function validSignature(raw:string,header:string|null,secret:string){
 if(!secret||!header||!/^sha256=[a-f0-9]{64}$/i.test(header))return false;
 const want=createHmac('sha256',secret).update(raw,'utf8').digest(),got=Buffer.from(header.slice(7),'hex');
 return got.length===want.length&&timingSafeEqual(got,want);
}

