// Rechten per onderdeel en gevoelige handelingen (besluit eigenaar 6 november 2026). Zie lib/onderdelen.ts en lib/gevoelig.ts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const O=await import('../lib/onderdelen.ts');
const G=await import('../lib/gevoelig.ts');
import fs from 'node:fs';
// Menu-adressen uit app/shell.tsx (navSections): elk item begint met ['/adres','pictogram','naam'.
const shell=fs.readFileSync(new URL('../app/shell.tsx',import.meta.url),'utf8');
const menu=shell.slice(shell.indexOf('export const navSections'),shell.indexOf('];',shell.indexOf('export const navSections')));
const hrefs=[...menu.matchAll(/\['(\/[a-z-]*)','/g)].map(m=>m[1]);

test('eigenaar mag alles; medewerker zonder onderdelen niets (standaard dicht)',()=>{
 for(const [p,m] of [['/financien','GET'],['/api/bank','POST'],['/toegang','GET'],['/api/toegang','POST']])assert.equal(O.allowed('eigenaar',[],p,m),true,p);
 for(const [p,m] of [['/','GET'],['/planning','GET'],['/api/products','GET'],['/api/gasten','POST']])assert.equal(O.allowed('medewerker',[],p,m),false,p);
 assert.equal(O.allowed('gast',['planning'],'/planning','GET'),false,'onbekende rol');
 assert.equal(O.allowed('medewerker',[],'/api/hulp','POST'),true,'de hulpbalk is voor iedereen');
 assert.equal(O.allowed('medewerker',[],'/_next/static/chunks/a.js','GET'),true);assert.equal(O.allowed('medewerker',[],'/pdf.worker.min.mjs','GET'),true);
 assert.equal(O.firstPage('medewerker',[]),'');assert.equal(O.firstPage('eigenaar',[]),'/');
});
test('alleen Planning: planning wel, financiën, Bloei, toegang en koppelingen niet — ook niet via het adres',()=>{
 const m=['planning'];
 for(const p of ['/planning','/reserveringen','/openingstijden'])assert.equal(O.allowed('medewerker',m,p,'GET'),true,p);
 assert.equal(O.allowed('medewerker',m,'/api/gasten','POST'),true,'reservering opslaan');
 assert.equal(O.allowed('medewerker',m,'/api/products','GET'),true,'lezen mag');assert.equal(O.allowed('medewerker',m,'/api/products','POST'),false,'wijzigen niet');
 for(const [p,me] of [['/financien','GET'],['/api/bank','GET'],['/api/rekeningen','GET'],['/bloei','GET'],['/api/bloei','GET'],['/api/bloei/markt','POST'],['/toegang','GET'],['/api/toegang','GET'],['/koppeling','GET'],['/api/sheets','GET'],['/bedrijfsgegevens','GET'],['/api/proefdata','POST'],['/api/cooperatie','POST'],['/']]){
  assert.equal(O.allowed('medewerker',m,p,me||'GET'),false,p);
 }
 assert.equal(O.firstPage('medewerker',m),'/planning');
});
test('beheer blijft voor eigenaren, ook als alle onderdelen zijn aangevinkt',()=>{
 for(const p of ['/toegang','/koppeling','/bedrijfsgegevens'])assert.equal(O.allowed('medewerker',O.KEYS,p,'GET'),false,p);
 for(const p of ['/api/toegang','/api/sheets','/api/drive','/api/printers','/api/proefdata'])assert.equal(O.allowed('medewerker',O.KEYS,p,'POST'),false,p);
 assert.deepEqual(O.validModules(['planning','planning','onzin',3]),['planning']);assert.deepEqual(O.validModules('planning'),[]);
});
test('elk menu-item hoort bij een onderdeel (of is beheer), zodat niets per ongeluk open of onvindbaar is',()=>{
 assert.ok(hrefs.length>=15,'menu gevonden: '+hrefs.length);
 for(const href of hrefs){
  const owned=O.ONDERDELEN.some(o=>o.pages.some(p=>p===href||href.startsWith(p+'/')))||O.OWNER_ONLY_PAGES.includes(href);
  assert.ok(owned,href+' hoort bij geen onderdeel');
 }
});
test('gevoelige handelingen: opnieuw de code na 10 minuten',()=>{
 for(const p of ['/api/toegang','/api/gasten/koppelingen'])assert.equal(G.sensitivePath(p,'POST'),true,p);
 assert.equal(G.sensitivePath('/api/bank','GET'),false);assert.equal(G.sensitivePath('/api/gasten','POST'),false);assert.equal(G.sensitivePath('/api/bloei-proef','POST'),false);
 const now=Date.now();assert.equal(G.freshCode(now-9*60000,now),true);assert.equal(G.freshCode(now-11*60000,now),false);assert.equal(G.freshCode(NaN,now),false);
 const req=mfa=>new Request('http://x/',{headers:mfa===null?{}:{'x-boer-bart-mfa':String(mfa)}});
 assert.doesNotThrow(()=>G.requireFreshCode(req(null)),'zonder login (ontwikkelen) geen code');
 assert.doesNotThrow(()=>G.requireFreshCode(req(now)));
 assert.throws(()=>G.requireFreshCode(req(now-20*60000)),r=>r instanceof Response&&r.status===401);
});
