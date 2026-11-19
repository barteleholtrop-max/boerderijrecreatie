// Starts the background worker (outbox) when the backoffice server starts. Turn off with ASSISTANT_WORKER=0.
// Next.js also compiles this file for the edge runtime; the NEXT_RUNTIME check must wrap the import directly
// (the documented form) so that branch, with its node: modules, is left out of that build.
export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'){
  // Online zonder blijvende opslag: duidelijk melden en de werker niet starten (zie lib/portable/durable.ts).
  const {durableProblems}=await import('./lib/portable/durable');
  const missing=durableProblems();
  if(missing.length){console.error('[opslag] online opslag ontbreekt: '+missing.join(', ')+'. De backoffice weigert tijdelijke opslag; /api/health meldt 503.');return}
  // Warm opstarten (melding eigenaar 12 november 2026: „Het duurde 23 seconden”): een nieuwe server opent meteen de database
  // (migratiecontrole en verbindingen), in plaats van bij de eerste bezoeker.
  if(process.env.DATABASE_URL)void import('./db').then(m=>m.getDb()).catch(e=>console.error('[opstart] database nog niet bereikbaar:',e instanceof Error?e.message:e));
  const {startWorker}=await import('./lib/assistant-jobs');
  if(process.env.ASSISTANT_WORKER!=='0')startWorker();
 }
}
