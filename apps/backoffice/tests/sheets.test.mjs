import {test} from 'node:test';
import assert from 'node:assert/strict';
import {base,same,mergeState,validRemote} from '../lib/sheet-core.ts';
const p=base({name:'Koffie',department:'Restaurant',priceCents:300,note:''});
test('gelijke producten kunnen gekoppeld worden zonder verlies van metadata',()=>{assert.equal(mergeState(p,{...p}),'equal');assert.deepEqual(base({...p,allergens:['Melk']}),{...p,allergens:['Melk']})});
test('eerste verschil wordt nooit stilzwijgend overgenomen',()=>{assert.equal(mergeState(p,{...p,priceCents:400}),'conflict')});
test('wijziging vanuit spreadsheet gaat naar ongewijzigd concept',()=>{assert.equal(mergeState(p,{...p,name:'Espresso'},p),'incoming')});
test('wijzigingen aan beide kanten vereisen beoordeling, ook verschillende velden',()=>{assert.equal(mergeState({...p,note:'Lokaal'}, {...p,priceCents:400},p),'conflict')});
test('lokale, ongesynchroniseerde wijziging wordt niet overschreven maar naar de spreadsheet gestuurd (backoffice leidend, 31 oktober 2026)',()=>{assert.equal(mergeState({...p,priceCents:400},p,p),'outgoing')});
test('nul euro is geldig; ontbrekende prijs en dubbelzinnige waarden zijn ongeldig',()=>{const r={...p,sourceId:'source-1',revision:'a'.repeat(64)};assert.equal(validRemote({...r,priceCents:0}),true);for(const priceCents of [null,'300',-1,1.5,NaN])assert.equal(validRemote({...r,priceCents}),false);assert.equal(validRemote({...r,revision:'x'}),false)});
test('btw, foto’s, allergenen en bestelopties tellen mee in synchronisatie',()=>{assert.equal(same(p,{...p,vat:'9'}),false);assert.equal(same(p,{...p,note:'Andere opmerking'}),false)});
import {encryptSecret,decryptSecret} from '../lib/sheet-secret.ts';
test('sleutel wordt versleuteld met unieke nonce; verkeerde sleutel en beschadiging falen',async()=>{const key='a'.repeat(64),secret='private-api-key';const a=await encryptSecret(secret,key),b=await encryptSecret(secret,key);assert.notEqual(a,b);assert.equal(a.includes(secret),false);assert.equal(await decryptSecret(a,key),secret);await assert.rejects(decryptSecret(a,'b'.repeat(64)));const raw=Buffer.from(a,'base64');raw[raw.length-1]^=1;await assert.rejects(decryptSecret(raw.toString('base64'),key));await assert.rejects(encryptSecret(secret,'bad'))});

test('bestaande foto en allergenen worden niet gewist bij eerste koppeling met lege nieuwe kolommen',()=>{assert.equal(mergeState({...p,photo:'/api/media/123',allergens:['Melk'],allergensChecked:true},p),'conflict')});
test('bestelopties vergelijken inhoudelijk; ongeldige prijzen en allergenen worden afgewezen',()=>{const g={id:'slagroom',title:'Slagroom?',required:false,choices:[{id:'ja',label:'Ja',extraCents:50}]};const r={...p,optionGroups:[g],sourceId:'id',revision:'a'.repeat(64)};assert.equal(validRemote(r),true);assert.equal(same(r,{...r,optionGroups:JSON.parse(JSON.stringify(r.optionGroups))}),true);assert.equal(validRemote({...r,allergens:['Onbekend']}),false);assert.equal(validRemote({...r,optionGroups:[{...g,choices:[{...g.choices[0],extraCents:-1}]}]}),false)});
test('backoffice is leidend: alleen lokaal gewijzigd is uitgaand, beide gewijzigd blijft een keuze',()=>{
 const baseline=base({name:'Koffie',department:'Restaurant',priceCents:300,note:''});
 assert.equal(mergeState({...baseline,priceCents:350},baseline,baseline),'outgoing');
 assert.equal(mergeState(baseline,{...baseline,priceCents:325},baseline),'incoming');
 assert.equal(mergeState({...baseline,priceCents:350},{...baseline,priceCents:325},baseline),'conflict');
 assert.equal(mergeState({...baseline,priceCents:350},{...baseline,priceCents:325}),'conflict');
});
