import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseSubscription,testOrigins,readyMessage,withSent,sentList,RETENTION_MS,readyStations,withoutSent}=await import('../lib/push-core.ts');
const keys={p256dh:'B'+'A'.repeat(86),auth:'a'.repeat(22)};
const sub=endpoint=>({endpoint,keys});

test('alleen de bekende pushdiensten van de browsers',()=>{
 for(const e of ['https://fcm.googleapis.com/fcm/send/abc','https://updates.push.services.mozilla.com/wpush/v2/x','https://web.push.apple.com/QF','https://db5p.notify.windows.com/w/?token=1'])
  assert.equal(parseSubscription(sub(e)).endpoint,e);
 for(const e of ['http://fcm.googleapis.com/x','https://evil.example/x','https://fcm.googleapis.com.evil.example/x','https://fcm.googleapis.com:8443/x','https://u:p@fcm.googleapis.com/x','https://127.0.0.1/x','http://127.0.0.1:9999/x','nope','https://fcm.googleapis.com/'+'x'.repeat(1000)])
  assert.throws(()=>parseSubscription(sub(e)),undefined,e);
});
test('sleutels moeten kloppen; testadres alleen op deze computer en alleen als ingesteld',()=>{
 for(const k of [{},{p256dh:keys.p256dh},{p256dh:'kort',auth:keys.auth},{p256dh:keys.p256dh,auth:'<script>'.repeat(3)}])
  assert.throws(()=>parseSubscription({endpoint:'https://fcm.googleapis.com/x',keys:k}));
 assert.deepEqual(testOrigins('http://127.0.0.1:4567, https://evil.example, http://localhost:1'),['http://127.0.0.1:4567']);
 assert.deepEqual(testOrigins(undefined),[]);
 assert.equal(parseSubscription(sub('http://127.0.0.1:4567/push'),testOrigins('http://127.0.0.1:4567')).endpoint,'http://127.0.0.1:4567/push');
});
test('tekst per werkplek en één keer per werkplek',()=>{
 assert.deepEqual(readyMessage('kok','P00042'),{title:'Je bestelling staat klaar',body:'Je eten (P00042) staat klaar bij de keukenuitgifte. Geniet ervan!',tag:'P00042-kok'});
 assert.match(readyMessage('barista','P00001').body,/koffiebar/);assert.equal(readyMessage('winkel','P00001').body,'Je bestelling (P00001) staat klaar bij de winkel.');
 assert.equal(withSent('',"kok"),'kok');assert.equal(withSent('kok','kok'),'kok');assert.deepEqual(sentList(withSent('kok','barista')),['kok','barista']);
 assert.equal(RETENTION_MS,86400000);
});

test('klaar per werkplek voor de open bestelapp (melding eigenaar 14 november 2026)',()=>{
 const lines=[{station:'kok'},{station:'barista'},{station:'kok'},{station:'geen'}];
 assert.deepEqual(readyStations(lines,{},'P00099'),[],'nog niets klaar');
 assert.deepEqual(readyStations(lines,{kok:'bezig',barista:'gereed'},'P00099').map(x=>[x.station,x.tag]),[['barista','P00099-barista']]);
 assert.deepEqual(readyStations(lines,{kok:'gereed',barista:'gereed',winkel:'gereed'},'P00099').map(x=>x.station),['kok','barista'],'alleen eigen werkplekken');
 assert.match(readyStations([{station:'barista'}],{barista:'gereed'},'P00001')[0].body,/koffiebar/);
});

test('terughalen na Gereed: volgende Gereed geeft een nieuwe melding (melding eigenaar 14 november 2026)',()=>{
 assert.equal(withoutSent('kok,barista','kok'),'barista');assert.equal(withoutSent('kok','kok'),'');assert.equal(withoutSent('barista','kok'),'barista');
 // Elke ronde Gereed heeft een eigen tag, zodat de open bestelapp hem opnieuw toont; dezelfde ronde blijft één melding.
 assert.equal(readyMessage('kok','P00042',4).tag,'P00042-kok-4');assert.equal(readyMessage('kok','P00042').tag,'P00042-kok');
 assert.deepEqual(readyStations([{station:'kok'}],{kok:'gereed'},'P00042',{kok:4}).map(x=>x.tag),['P00042-kok-4']);
});
