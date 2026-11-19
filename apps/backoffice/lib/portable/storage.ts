// Bestanden (foto's, beeldbank, spraakopnames) in Supabase Storage (overstap naar Supabase, stap 3; docs/ONLINE-ZETTEN.md).
// Met SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY gaan bestanden naar een privé-bucket in Supabase; anders blijven ze op de
// schijf (var/media), zoals voorheen. Alleen de backoffice kan bij de bucket; gasten zien foto's via /api/public/media.
// Praat rechtstreeks met de Storage-API van Supabase (geen extra pakket).
import fs from 'node:fs';
import path from 'node:path';

export type StoredObject={body:ReadableStream<Uint8Array>;httpMetadata:{contentType:string}};
export type Bucket={has(key:string):Promise<boolean>;get(key:string):Promise<StoredObject|null>;put(key:string,data:ArrayBuffer,options?:{httpMetadata?:{contentType:string}}):Promise<void>;delete(key:string):Promise<void>};
const KEY=/^[a-f0-9-]{36}$/;
const check=(key:string)=>{if(!KEY.test(key))throw Error('Invalid object key')};

export function storageConfig(){
 const url=(process.env.SUPABASE_URL||'').replace(/\/+$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!url||!key)return null;
 if(!/^https:\/\//.test(url)&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))throw Error('SUPABASE_URL moet met https:// beginnen.');
 return {url,key,bucket:process.env.SUPABASE_BUCKET||'media'};
}

/** Bestanden op de schijf (proefomgeving zonder Supabase). */
export function diskBucket(dir:()=>string,before:()=>Promise<unknown>=async()=>{}):Bucket{
 const file=(key:string)=>{check(key);const d=dir();fs.mkdirSync(d,{recursive:true});return path.join(d,key)};
 return {
  async has(key){await before();return fs.existsSync(file(key))},
  async get(key){await before();const f=file(key);if(!fs.existsSync(f))return null;const bytes=fs.readFileSync(f);let httpMetadata={contentType:'application/octet-stream'};if(fs.existsSync(f+'.json'))httpMetadata=JSON.parse(fs.readFileSync(f+'.json','utf8'));return {body:new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(bytes));c.close()}}),httpMetadata}},
  async put(key,data,options){const f=file(key);fs.writeFileSync(f,new Uint8Array(data),{mode:0o600});fs.writeFileSync(f+'.json',JSON.stringify(options?.httpMetadata||{}),{mode:0o600})},
  async delete(key){const f=file(key);fs.rmSync(f,{force:true});fs.rmSync(f+'.json',{force:true})},
 };
}

/** Bestanden in een privé-bucket van Supabase Storage. De bucket wordt bij het eerste gebruik aangemaakt als hij er nog niet is. */
export function supabaseBucket(cfg:{url:string;key:string;bucket:string}):Bucket{
 // Oude service_role-sleutel (JWT) ook als Bearer; een nieuwe geheime sleutel (sb_secret_…) alleen als apikey.
 const headers=(extra:Record<string,string>={})=>({apikey:cfg.key,...(cfg.key.startsWith('eyJ')?{Authorization:'Bearer '+cfg.key}:{}),...extra});
 const object=(key:string)=>`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${key}`;
 let ready:Promise<void>|null=null;
 const ensure=()=>ready??=(async()=>{
  const r=await fetch(`${cfg.url}/storage/v1/bucket/${encodeURIComponent(cfg.bucket)}`,{headers:headers(),signal:AbortSignal.timeout(15000)});
  if(r.ok){const b=await r.json() as {public?:boolean};if(b.public)throw Error(`De Supabase-bucket „${cfg.bucket}” staat open voor iedereen. Zet hem op privé.`);return}
  const made=await fetch(`${cfg.url}/storage/v1/bucket`,{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({id:cfg.bucket,name:cfg.bucket,public:false}),signal:AbortSignal.timeout(15000)});
  if(!made.ok&&made.status!==409)throw Error('Supabase Storage: bucket aanmaken mislukt ('+made.status+').');
 })().catch(e=>{ready=null;throw e});
 return {
  async has(key){check(key);await ensure();
   const r=await fetch(object(key),{method:'HEAD',headers:headers(),signal:AbortSignal.timeout(15000)});
   if(r.status===404||r.status===400)return false;if(!r.ok)throw Error('Supabase Storage: controleren mislukt ('+r.status+').');return true},
  async get(key){check(key);await ensure();
   const r=await fetch(object(key),{headers:headers(),signal:AbortSignal.timeout(30000)});
   if(r.status===404||r.status===400)return null; // Supabase meldt een ontbrekend bestand soms als 400
   if(!r.ok||!r.body)throw Error('Supabase Storage: ophalen mislukt ('+r.status+').');
   return {body:r.body as ReadableStream<Uint8Array>,httpMetadata:{contentType:r.headers.get('content-type')||'application/octet-stream'}}},
  async put(key,data,options){check(key);await ensure();
   const r=await fetch(object(key),{method:'POST',headers:headers({'Content-Type':options?.httpMetadata?.contentType||'application/octet-stream','x-upsert':'true'}),body:new Uint8Array(data),signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw Error('Supabase Storage: opslaan mislukt ('+r.status+').')},
  async delete(key){check(key);await ensure();
   const r=await fetch(object(key),{method:'DELETE',headers:headers(),signal:AbortSignal.timeout(15000)});
   if(!r.ok&&r.status!==404&&r.status!==400)throw Error('Supabase Storage: verwijderen mislukt ('+r.status+').')},
 };
}

/**
 * Eenmalige verhuizing van var/media naar Supabase Storage. Elk bestand gaat over en wordt daarna teruggelezen om te
 * controleren dat het er is. De bestanden op de schijf blijven staan als reservekopie. Geeft het aantal terug.
 */
export async function migrateDisk(dir:string,target:Bucket){
 if(!fs.existsSync(dir))return 0;
 const keys=fs.readdirSync(dir).filter(n=>KEY.test(n));
 const disk=diskBucket(()=>dir);
 for(const key of keys){
  const o=(await disk.get(key))!;
  const bytes=await new Response(o.body).arrayBuffer();
  await target.put(key,bytes,{httpMetadata:o.httpMetadata});
  const back=await target.get(key);
  if(!back||(await new Response(back.body).arrayBuffer()).byteLength!==bytes.byteLength)throw Error(`Verhuizing van foto's gestopt: ${key} staat niet goed in Supabase Storage.`);
 }
 return keys.length;
}
