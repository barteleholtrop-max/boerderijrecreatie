// Sleutelcontrole voor het werkproces op Cloud Run (/api/werkproces/ronde). WORKER_SECRET: minstens 32 tekens; vergelijken in
// constante tijd (via sha-256, zodat ook de lengte niets verraadt). Zonder geldige instelling: altijd dicht.
import {createHash,timingSafeEqual} from 'node:crypto';
const digest=(v:string)=>createHash('sha256').update(v).digest();
export const workerConfigured=(secret=process.env.WORKER_SECRET)=>!!secret&&secret.length>=32;
export function workerKeyOk(given:string|null,secret=process.env.WORKER_SECRET){
 if(!workerConfigured(secret)||!given)return false;
 return timingSafeEqual(digest(given),digest(secret!));
}
