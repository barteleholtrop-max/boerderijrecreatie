// Beveiligingskoppen op elk antwoord van de backoffice (#289).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cfg=fs.readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');
test('next.config: koppen op elk pad, geen X-Powered-By, geen eigen CSP die die van losse routes overschrijft',()=>{
 assert.match(cfg,/poweredByHeader:false/);assert.match(cfg,/source:'\/:path\*',headers:SECURITY_HEADERS/);
 for(const [k,v] of [['X-Frame-Options','DENY'],['X-Content-Type-Options','nosniff'],['Referrer-Policy','no-referrer'],['Strict-Transport-Security','max-age=31536000']])
  assert.ok(cfg.includes(`{key:'${k}',value:'${v}'}`),k);
 assert.doesNotMatch(cfg,/key:'Content-Security-Policy'/,'losse routes (bonnen, pdf, foto’s) houden hun eigen CSP');
});
