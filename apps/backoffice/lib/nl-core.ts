// Kleine algemene hulpmiddelen (uit de Boerderijrecreatie-backoffice, lib/coop-core.ts): datum in Nederland en IBAN-controle.
export const amsterdamDay=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(d);
export const normalizeIban=(v:unknown)=>typeof v==='string'?v.toUpperCase().replace(/[\s.-]/g,''):'';
export function validIban(v:unknown){
 const iban=normalizeIban(v);if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))return false;
 if(iban.startsWith('NL')&&iban.length!==18)return false;
 const moved=iban.slice(4)+iban.slice(0,4);let rest=0;
 for(const ch of moved){const n=/[A-Z]/.test(ch)?String(ch.charCodeAt(0)-55):ch;for(const d of n)rest=(rest*10+Number(d))%97}
 return rest===1;
}
export const maskIban=(iban:string)=>{const v=normalizeIban(iban);return v?v.slice(0,4)+' •••• '+v.slice(-4):''};
