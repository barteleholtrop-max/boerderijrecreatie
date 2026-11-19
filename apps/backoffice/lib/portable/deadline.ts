// Waakhond voor de database (7 november 2026). Op Cloud Run ligt de processor stil tussen verzoeken; een verbinding met Supabase kan
// dan stilletjes wegvallen. Zonder waakhond wacht elke vraag over zo'n verbinding tot de tijdslimiet van Cloud Run (5 minuten),
// en daarna de volgende ook. Met waakhond: na DATABASE_QUERY_SECONDS (standaard 20) een duidelijke fout en nieuwe verbindingen.
export const queryLimitMs=()=>Math.max(1,Number(process.env.DATABASE_QUERY_SECONDS)||20)*1000;
export class DatabaseTimeout extends Error{constructor(ms:number){super(`De database antwoordt niet binnen ${Math.round(ms/1000)} seconden. Probeer het zo opnieuw.`);this.name='DatabaseTimeout'}}
/** De uitkomst van p, of na ms een DatabaseTimeout (en dan één keer onTimeout, om de verbindingen te vernieuwen). */
export function withDeadline<T>(p:Promise<T>,ms:number,onTimeout:()=>void):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  const t=setTimeout(()=>{reject(new DatabaseTimeout(ms));try{onTimeout()}catch{}},ms);
  p.then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)});
 });
}
// Verse verbindingen na stilte (melding eigenaar 12 november 2026: „Het duurde 23 seconden”). De waakhond hierboven grijpt pas na
// 20 seconden in; dat plus een nieuwe poging gaf de ±23 seconden op de ledenpagina. Op Cloud Run ligt de processor stil tussen
// verzoeken, dus de eigen opruimklok (idle_timeout) van de pool loopt dan niet en dode verbindingen blijven liggen. Daarom: is er
// langer dan staleMs niets met de database gedaan en loopt er niets, dan eerst een verse pool. Kost hooguit een nieuwe verbinding.
export const staleMs=()=>Math.max(1,Number(process.env.DATABASE_STALE_SECONDS)||15)*1000;
export function freshPool<P extends {end:(o:{timeout:number})=>Promise<unknown>}>(make:()=>P,stale:number,now=()=>Date.now()){
 let pool=make(),last=now(),busy=0;
 const get=()=>{const t=now();if(busy===0&&t-last>stale){const old=pool;pool=make();old.end({timeout:0}).catch(()=>{})}last=t;return pool};
 return {
  get,
  /** fn met de (zo nodig verse) pool; tijdens fn wordt de pool niet vervangen. */
  async use<T>(fn:(p:P)=>Promise<T>):Promise<T>{const p=get();busy++;try{return await fn(p)}finally{busy--;last=now()}},
  end:(timeout=0)=>pool.end({timeout}),
 };
}
// Beurten (Cloud Run-logboek 12 november 2026: telkens één onderdeel van de ledenpagina precies 60 seconden, de waakhond; de rest
// binnen een halve seconde). Zijn alle verbindingen bezet, dan stuurt postgres.js een volgende vraag alvast mee over een bezette
// verbinding (pipelining). De verbindingspool van Supabase (Supavisor, transactiestand) raakt zo'n vraag soms kwijt. Met beurten
// lopen er nooit meer vragen (of transacties) tegelijk dan er vrije verbindingen zijn; de rest wacht netjes op zijn beurt.
export function slots(n:number){
 let free=n;const waiting:(()=>void)[]=[];
 const give=()=>{const next=waiting.shift();if(next)next();else free++};
 return async<T>(fn:()=>Promise<T>):Promise<T>=>{
  if(free>0)free--;else await new Promise<void>(r=>waiting.push(r));
  try{return await fn()}finally{give()}
 };
}
