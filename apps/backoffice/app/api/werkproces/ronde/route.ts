import {workerConfigured,workerKeyOk} from '@/lib/worker-key';
export const dynamic='force-dynamic';
export const maxDuration=300;
// Werkproces op Cloud Run (besluit eigenaar 7 november 2026: de backoffice op Cloud Run, niet op Netlify). Cloud Run draait alleen
// tijdens een verzoek; Cloud Scheduler klopt daarom elke paar minuten hier aan en de backoffice draait één ronde van het werkproces:
// mail, agenda, Google Bedrijfsprofiel, herinneringen, weekbericht, Overleg-termijnen, incasso's en assistent-taken (lib/assistant-jobs.ts).
// Toegang alleen met de geheime sleutel WORKER_SECRET (minstens 32 tekens) in de kop X-Werkproces-Sleutel. Zonder die instelling
// blijft deze deur dicht. Twee rondes tegelijk kan geen kwaad: elke taak wordt maar één keer opgepakt (FOR UPDATE SKIP LOCKED).
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(!workerConfigured())return json({error:'Werkproces niet ingesteld.'},503);
 if(!workerKeyOk(req.headers.get('x-werkproces-sleutel')))return json({error:'Geen toegang.'},401);
 const started=Date.now();
 const {tick}=await import('@/lib/assistant-jobs');
 await tick();
 return json({ok:true,ms:Date.now()-started});
}
