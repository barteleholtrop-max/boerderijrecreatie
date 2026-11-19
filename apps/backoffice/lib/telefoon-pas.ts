// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026). Onthouden, vernieuwen en ontkoppelen.
// Server only. Regels en de telefoonpas zelf: lib/telefoon-pas-core.ts. Uitleg: docs/MANAGERAPP-TELEFOON.md.
import {getDb} from '@/db';
import {phoneDevices} from '@/db/schema';
import {and,desc,eq,isNull} from 'drizzle-orm';
import {activeAccount} from './access-store';
import {newSecret,hashSecret,validSecret,mayUsePhone} from './telefoon-pas-core';

export class PhoneError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
const now=()=>new Date().toISOString();

/** Ingelogd (met code): deze telefoon onthouden. Een eerder bewijs op dezelfde telefoon vervalt. Alleen de hash wordt bewaard. */
export async function rememberPhone(email:string,name:string,oldSecret?:unknown){
 const account=await activeAccount(email);
 if(!account||!mayUsePhone(account.role,account.modules))throw new PhoneError('Je hebt geen toegang tot de managerapp. Vraag een eigenaar om het vinkje Managerapp (telefoon).',403);
 const db=getDb(),at=now();
 if(validSecret(oldSecret))await db.update(phoneDevices).set({revoked:at,revokedBy:'vervangen'}).where(and(eq(phoneDevices.tokenHash,hashSecret(oldSecret)),isNull(phoneDevices.revoked)));
 const secret=newSecret(),id=crypto.randomUUID();
 await db.insert(phoneDevices).values({id,email:account.email,name:name.slice(0,60),tokenHash:hashSecret(secret),created:at,lastSeen:at});
 return {id,email:account.email,role:account.role,secret};
}

/**
 * Met het apparaatbewijs: wie hoort bij deze telefoon? Null als de telefoon is ontkoppeld of onbekend, of als de persoon
 * niet meer actief is of het vinkje Managerapp kwijt is (dan werkt de telefoon binnen een uur niet meer).
 */
export async function phoneBySecret(secret:unknown){
 if(!validSecret(secret))return null;
 const db=getDb(),d=(await db.select().from(phoneDevices).where(eq(phoneDevices.tokenHash,hashSecret(secret))))[0];
 if(!d||d.revoked)return null;
 const account=await activeAccount(d.email);
 if(!account||!mayUsePhone(account.role,account.modules))return null;
 // Hooguit één keer per tien minuten bijwerken: genoeg om te zien welke telefoon nog in gebruik is.
 if(!d.lastSeen||Date.parse(d.lastSeen)<Date.now()-600000)await db.update(phoneDevices).set({lastSeen:now()}).where(eq(phoneDevices.id,d.id));
 return {id:d.id,email:account.email,role:account.role,name:d.name};
}

/** Op de telefoon zelf: „Deze telefoon uitloggen”. */
export async function forgetPhone(secret:unknown,by:string){
 if(!validSecret(secret))return;
 await getDb().update(phoneDevices).set({revoked:now(),revokedBy:by.slice(0,80)}).where(and(eq(phoneDevices.tokenHash,hashSecret(secret)),isNull(phoneDevices.revoked)));
}

/** Eigenaar: de onthouden telefoons (nooit het bewijs zelf). */
export async function listPhones(){
 const rows=await getDb().select().from(phoneDevices).orderBy(desc(phoneDevices.created));
 return rows.map(r=>({id:r.id,email:r.email,name:r.name,created:r.created,lastSeen:r.lastSeen,revoked:r.revoked,revokedBy:r.revokedBy}));
}
/** Eigenaar: ontkoppelen. De telefoon krijgt daarna geen nieuwe pas meer; de lopende pas verloopt binnen een uur. */
export async function revokePhone(idRaw:unknown,by:string){
 if(typeof idRaw!=='string'||!/^[a-f0-9-]{36}$/.test(idRaw))throw new PhoneError('Onbekende telefoon.',404);
 const r=await getDb().update(phoneDevices).set({revoked:now(),revokedBy:by.slice(0,80)}).where(and(eq(phoneDevices.id,idRaw),isNull(phoneDevices.revoked))).returning();
 if(!r.length)throw new PhoneError('Deze telefoon is al ontkoppeld of bestaat niet.',404);
}
