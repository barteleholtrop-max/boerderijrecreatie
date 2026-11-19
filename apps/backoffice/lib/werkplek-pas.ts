// Werkplektablets (besluit eigenaar 6 november 2026): koppelen met een QR-code, vernieuwen en ontkoppelen. Server only.
// Regels en de werkplekpas zelf: lib/werkplek-pas-core.ts. Uitleg: docs/WERKPLEK-TABLETS.md.
import {getDb} from '@/db';
import {workplaceDevices,workplacePairings} from '@/db/schema';
import {and,desc,eq,isNull,gt,lt} from 'drizzle-orm';
import {inTransaction} from './portable/env';
import {newSecret,hashSecret,validSecret,validTabletName,PAIR_SECONDS,newPairCode,normalizePairCode} from './werkplek-pas-core';

export class TabletError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
const now=()=>new Date().toISOString();

/** Eigenaar: een koppelcode maken voor een nieuwe tablet. Alleen de hash wordt bewaard; de code staat alleen in de QR-code. */
export async function createPairing(nameRaw:unknown,by:string){
 const name=validTabletName(nameRaw);if(!name)throw new TabletError('Geef de tablet een naam van 2 tot 60 tekens, bijvoorbeeld „Kassa koffiebar”.');
 const db=getDb(),code=newPairCode(),expires=new Date(Date.now()+PAIR_SECONDS*1000).toISOString();
 // Opruimen: verlopen, nooit gebruikte codes hebben geen waarde meer.
 await db.delete(workplacePairings).where(and(isNull(workplacePairings.usedAt),lt(workplacePairings.expires,new Date(Date.now()-86400000).toISOString())));
 await db.insert(workplacePairings).values({codeHash:hashSecret(code),name,created:now(),createdBy:by.slice(0,80),expires});
 return {code,name,expires};
}

/** Tablet: de code inwisselen voor een apparaatbewijs. Eén keer te gebruiken en alleen binnen 10 minuten. */
export async function redeemPairing(code:unknown){
 // Korte koppelcode (getypt of uit de QR-code), of een oude lange code uit een eerdere QR-code.
 const key=validSecret(code)?code:normalizePairCode(code);
 if(!key)throw new TabletError('Deze koppelcode klopt niet. Kijk hem na of maak in de backoffice een nieuwe.');
 const secret=newSecret(),id=crypto.randomUUID(),at=now();
 return inTransaction(async()=>{const tx=getDb();
  // Eén keer: de code wordt in dezelfde stap als gebruikt gemarkeerd; een tweede poging vindt hem niet meer.
  const used=await tx.update(workplacePairings).set({usedAt:at}).where(and(eq(workplacePairings.codeHash,hashSecret(key)),isNull(workplacePairings.usedAt),gt(workplacePairings.expires,at))).returning();
  const p=used[0];if(!p)throw new TabletError('Deze koppelcode is verlopen of al gebruikt. Maak in de backoffice een nieuwe (hij werkt 10 minuten).',410);
  await tx.insert(workplaceDevices).values({id,name:p.name,tokenHash:hashSecret(secret),created:at,createdBy:p.createdBy,lastSeen:at});
  await tx.update(workplacePairings).set({deviceId:id}).where(eq(workplacePairings.codeHash,p.codeHash));
  return {id,name:p.name,secret};
 });
}

/** Tablet: met het apparaatbewijs een nieuwe werkplekpas halen. Null als de tablet is ontkoppeld of onbekend. */
export async function deviceBySecret(secret:unknown){
 if(!validSecret(secret))return null;
 const db=getDb(),d=(await db.select().from(workplaceDevices).where(eq(workplaceDevices.tokenHash,hashSecret(secret))))[0];
 if(!d||d.revoked)return null;
 // Hooguit één keer per tien minuten bijwerken: genoeg om te zien welke tablet nog in gebruik is.
 if(!d.lastSeen||Date.parse(d.lastSeen)<Date.now()-600000)await db.update(workplaceDevices).set({lastSeen:now()}).where(eq(workplaceDevices.id,d.id));
 return {id:d.id,name:d.name};
}

/** Eigenaar: de gekoppelde tablets (nooit het bewijs zelf). */
export async function listDevices(){
 const rows=await getDb().select().from(workplaceDevices).orderBy(desc(workplaceDevices.created));
 return rows.map(r=>({id:r.id,name:r.name,created:r.created,createdBy:r.createdBy,lastSeen:r.lastSeen,revoked:r.revoked,revokedBy:r.revokedBy}));
}
/** Eigenaar: ontkoppelen. De tablet kan daarna geen nieuwe werkplekpas meer halen; de lopende pas verloopt binnen een uur. */
export async function revokeDevice(idRaw:unknown,by:string){
 if(typeof idRaw!=='string'||!/^[a-f0-9-]{36}$/.test(idRaw))throw new TabletError('Onbekende tablet.',404);
 const r=await getDb().update(workplaceDevices).set({revoked:now(),revokedBy:by.slice(0,80)}).where(and(eq(workplaceDevices.id,idRaw),isNull(workplaceDevices.revoked))).returning();
 if(!r.length)throw new TabletError('Deze tablet is al ontkoppeld of bestaat niet.',404);
}
