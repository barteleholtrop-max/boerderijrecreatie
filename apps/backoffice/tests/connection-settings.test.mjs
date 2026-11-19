import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('encrypted connector settings: real SQL persistence, redaction, revisions, retain/clear, provider use and isolated requests',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-connection-settings-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {loadConnectionSettings,saveConnectionSettings,withConnectionSettings,validatedPatch,isSettingsOwner}=await import('./lib/connection-settings.ts');
 const {CONNECTION_FIELDS}=await import('./lib/connection-fields.ts');const {connections}=await import('./lib/guest-connections.ts');const {connectionSetting,runWithConnectionValues}=await import('./lib/connection-runtime.ts');const {env}=await import('./lib/portable/env.ts');
 const key='sk-test-keep-private';
 await saveConnectionSettings({id:'gast-ai',version:0,values:{ANTHROPIC_API_KEY:key,GUEST_WRITING_STYLE:'Nuchter en persoonlijk'}},CONNECTION_FIELDS['gast-ai'],'bart');
 assert.equal((await loadConnectionSettings()).values.ANTHROPIC_API_KEY,key);
 const raw=await env.DB.prepare('SELECT secret FROM connection_settings').first();assert.equal(raw.secret.includes(key),false);
 const audit=await env.DB.prepare('SELECT fields FROM connection_setting_audit').first();assert.equal(audit.fields.includes(key),false);assert.match(audit.fields,/ANTHROPIC_API_KEY/);
 await withConnectionSettings(async()=>{const exposed=JSON.stringify(connections());assert.equal(exposed.includes(key),false);const ai=connections().find(c=>c.id==='gast-ai');assert.equal(ai.configured,true);assert.equal(ai.fields.find(f=>f.key==='ANTHROPIC_API_KEY').value,undefined);assert.equal(connectionSetting('ANTHROPIC_API_KEY'),key);});
 await assert.rejects(()=>saveConnectionSettings({id:'gast-ai',version:0,values:{GUEST_WRITING_STYLE:'stale'}},CONNECTION_FIELDS['gast-ai'],'bart'),/elders gewijzigd/);
 await saveConnectionSettings({id:'gast-ai',version:1,values:{ANTHROPIC_API_KEY:'',GUEST_WRITING_STYLE:'Nieuwe stijl'}},CONNECTION_FIELDS['gast-ai'],'bart');assert.equal((await loadConnectionSettings()).values.ANTHROPIC_API_KEY,key);
 process.env.ANTHROPIC_API_KEY='server-default';await saveConnectionSettings({id:'gast-ai',version:2,values:{},clear:['ANTHROPIC_API_KEY']},CONNECTION_FIELDS['gast-ai'],'bart');await withConnectionSettings(async()=>assert.equal(connectionSetting('ANTHROPIC_API_KEY'),''));assert.equal(process.env.ANTHROPIC_API_KEY,'server-default');
 const loaded=await loadConnectionSettings();await assert.rejects(()=>saveConnectionSettings({id:'gast-ai',version:loaded.version,values:{BASIC_AUTH_PASSWORD:'inject'}},CONNECTION_FIELDS['gast-ai'],'bart'),/mag hier niet/);assert.equal((await loadConnectionSettings()).version,loaded.version);
 // Gmail: the refresh token is never a setting (it comes from "Google koppelen"); tokens cannot be injected via settings.
 assert.throws(()=>validatedPatch({id:'gmail',version:3,values:{GUEST_GOOGLE_REFRESH_MAIN:'inject'}},CONNECTION_FIELDS.gmail,{}),/mag hier niet/);
 await saveConnectionSettings({id:'gmail',version:3,values:{GUEST_GOOGLE_CLIENT_ID:'test-client',GUEST_GOOGLE_CLIENT_SECRET:'test-client-secret',GMAIL_MAILBOX:'rianne@boerbart.nl',GMAIL_CUSTOMER_LABEL:'TODO Klanten'}},CONNECTION_FIELDS.gmail,'bart');
 const {gmailClient,oauthClient}=await import('./lib/gmail-api.ts');let requested=false;globalThis.fetch=async(url,init={})=>{if(String(url).includes('oauth2.googleapis.com')){assert.equal(init.body.get('client_id'),'test-client');assert.equal(init.body.get('client_secret'),'test-client-secret');assert.equal(init.body.get('refresh_token'),'test-refresh');requested=true;return Response.json({access_token:'test-access',expires_in:3600})}return Response.json({emailAddress:'rianne@boerbart.nl',historyId:'1'});};await withConnectionSettings(async()=>{assert.deepEqual(oauthClient(),{id:'test-client',secret:'test-client-secret'});assert.equal((await gmailClient({refresh:'test-refresh'}).profile()).emailAddress,'rianne@boerbart.nl');const {mailbox,labelName}=await import('./lib/mail-store.ts');assert.equal(mailbox(),'rianne@boerbart.nl');assert.equal(labelName(),'TODO Klanten')});assert.equal(requested,true);
 const googleSaved=await loadConnectionSettings();assert.throws(()=>validatedPatch({id:'bunq',version:4,values:{GUEST_GOOGLE_REFRESH_MAIN:'wrong'}},CONNECTION_FIELDS.bunq,googleSaved.values),/mag hier niet/);
 // Mollie: alleen een testsleutel; een live-sleutel pas als live bij publiceren is aangezet.
 assert.throws(()=>validatedPatch({id:'mollie',version:4,values:{MOLLIE_API_KEY:'live_'+'a'.repeat(30)}},CONNECTION_FIELDS.mollie,googleSaved.values),/live-sleutel/);
 assert.throws(()=>validatedPatch({id:'mollie',version:4,values:{MOLLIE_API_KEY:'geen-sleutel'}},CONNECTION_FIELDS.mollie,googleSaved.values),/geen geldige Mollie-sleutel/);
 assert.equal(validatedPatch({id:'mollie',version:4,values:{MOLLIE_API_KEY:' test_'+'a'.repeat(30)+' '}},CONNECTION_FIELDS.mollie,googleSaved.values).values.MOLLIE_API_KEY,'test_'+'a'.repeat(30));
 // bunq-sleutel wordt bij opslaan gecontroleerd; spaties en regeleinden uit het kopiëren gaan eruit (12 november 2026).
 assert.throws(()=>validatedPatch({id:'bunq',version:4,values:{GUEST_BUNQ_API_KEY:'geen-sleutel'}},CONNECTION_FIELDS.bunq,googleSaved.values),/geen geldige bunq-sleutel/);
 assert.equal(validatedPatch({id:'bunq',version:4,values:{GUEST_BUNQ_API_KEY:' sandbox_'+'a'.repeat(20)+String.fromCharCode(10)+'a'.repeat(10)+' '}},CONNECTION_FIELDS.bunq,googleSaved.values).values.GUEST_BUNQ_API_KEY,'sandbox_'+'a'.repeat(30));
 const results=await Promise.all(['one','two'].map(value=>runWithConnectionValues({SAMPLE:value},async()=>{await new Promise(r=>setTimeout(r,10));return connectionSetting('SAMPLE')})));assert.deepEqual(results,['one','two']);assert.equal(connectionSetting('SAMPLE'),undefined);
 await saveConnectionSettings({id:'weer',version:4,values:{GUEST_WEATHER_LATITUDE:'53.0',GUEST_WEATHER_LONGITUDE:'5.0'}},CONNECTION_FIELDS.weer,'bart');assert.deepEqual(JSON.parse((await loadConnectionSettings()).values.GUEST_WEATHER_LOCATION),{latitude:53,longitude:5});
 const beforeRace=await loadConnectionSettings();const raced=await Promise.allSettled(['sandbox_'+'a'.repeat(30),'sandbox_'+'b'.repeat(30)].map(v=>saveConnectionSettings({id:'bunq',version:beforeRace.version,values:{GUEST_BUNQ_API_KEY:v}},CONNECTION_FIELDS.bunq,'bart')));assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal((await loadConnectionSettings()).version,beforeRace.version+1);
 const keyBefore=process.env.SHEETS_CONFIG_KEY;process.env.SHEETS_CONFIG_KEY='b'.repeat(64);await assert.rejects(()=>loadConnectionSettings(),/niet worden geopend/);process.env.SHEETS_CONFIG_KEY=keyBefore;assert.equal((await loadConnectionSettings()).version,beforeRace.version+1);
 // Eigenaar = de rol uit de sessie (besluit eigenaar 6 november 2026), niet meer een wachtwoordnaam.
 const as=h=>new Request('http://x/',{headers:h});
 assert.equal(isSettingsOwner(as({'x-boer-bart-verified-user':'owner','x-boer-bart-role':'eigenaar','x-boer-bart-account':'administratie'})),true);
 assert.equal(isSettingsOwner(as({'x-boer-bart-verified-user':'owner','x-boer-bart-role':'medewerker','x-boer-bart-account':'rianne'})),false);
 assert.equal(isSettingsOwner(as({'x-boer-bart-verified-user':'owner'})),true,'zonder login (ontwikkelen) is iedereen eigenaar');
 assert.equal(isSettingsOwner(as({'x-boer-bart-role':'eigenaar'})),false,'alleen wat de proxy zet telt');
 console.log('Settings checks passed');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,SHEETS_CONFIG_KEY:'a'.repeat(64),GUEST_GOOGLE_MAILBOXES:'[]'},encoding:'utf8',timeout:45000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
