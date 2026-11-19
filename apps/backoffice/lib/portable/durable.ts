// Online (Google Cloud Run) mogen gegevens en bestanden nooit op de tijdelijke schijf van de container landen: die is na
// een nieuwe versie of herstart leeg (afspraak „online is de maatstaf”, docs/VAN-CHROMEBOOK-NAAR-ONLINE.md). Zonder
// DATABASE_URL of zonder Supabase Storage weigert de backoffice daar te werken, in plaats van stil op PGlite of var/media
// over te gaan. Geen imports en alleen namen van instellingen in de melding, nooit waarden.
type Env=Record<string,string|undefined>;

/** Moeten gegevens blijvend zijn? Op Cloud Run (K_SERVICE) altijd, of met REQUIRE_DURABLE_STORAGE=1. */
export function durableRequired(e:Env=process.env){
 if(e.ALLOW_EPHEMERAL_STORAGE==='1')return false;
 return Boolean(e.K_SERVICE)||e.REQUIRE_DURABLE_STORAGE==='1';
}
/** Namen van ontbrekende instellingen (leeg = in orde). */
export function durableProblems(e:Env=process.env):string[]{
 if(!durableRequired(e))return [];
 return ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].filter(k=>!(e[k]||'').trim());
}
export function assertDurableStorage(e:Env=process.env){
 const missing=durableProblems(e);
 if(missing.length)throw Error('Online opslag ontbreekt: '+missing.join(', ')+' is niet ingesteld. De backoffice weigert tijdelijke opslag op deze server (zie docs/CLOUD-RUN.md).');
}
