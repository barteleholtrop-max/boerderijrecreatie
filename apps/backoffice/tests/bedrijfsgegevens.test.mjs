// Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek voor alles over het bedrijf.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {contactSchema}=await import('../lib/guest-core.ts');
const {companyProfile,invoiceName}=await import('../lib/company.ts');
const base={phone:'',email:'',whatsapp:''};

test('bedrijfsgegevens: alles optioneel, oude contactgegevens blijven geldig',()=>{
 const c=contactSchema.parse({phone:'0513 123 456',email:'info@boerbart.nl',whatsapp:'',street:'Schoterweg 26',postalCode:'8462 TD',city:'Rotstergaast'});
 assert.equal(c.iban,'');assert.equal(c.tradeName,'');assert.equal(c.legalForm,'');
});

test('bedrijfsgegevens: IBAN, BIC, vestigingsnummer en webadressen worden gecontroleerd',()=>{
 const c=contactSchema.parse({...base,iban:'nl66 bunq 2108 6022 40',bic:'bunqnl2a',establishmentNumber:'000012345678',kvk:'87761084',legalForm:'vof',website:'https://www.boerbart.nl'});
 assert.equal(c.iban,'NL66BUNQ2108602240','zonder spaties bewaard');assert.equal(c.bic,'BUNQNL2A');
 assert.throws(()=>contactSchema.parse({...base,iban:'NL66BUNQ2108602241'}),/IBAN is niet geldig/);
 assert.throws(()=>contactSchema.parse({...base,bic:'BUNQ'}),/BIC/);
 assert.throws(()=>contactSchema.parse({...base,establishmentNumber:'1234'}),/vestigingsnummer/);
 assert.throws(()=>contactSchema.parse({...base,website:'http://boerbart.nl'}),/https/);
 assert.throws(()=>contactSchema.parse({...base,instagram:'javascript:alert(1)'}),/https/);
 assert.throws(()=>contactSchema.parse({...base,legalForm:'nv'}));
});

test('bedrijfsgegevens: handelsnaam standaard Boer Bart; IBAN uit de oude instelling tot het hier is opgeslagen',()=>{
 const settings={INVOICE_IBAN:'NL66BUNQ2108602240',INVOICE_ACCOUNT_NAME:'Boer Bart'};const get=k=>settings[k];
 const old=companyProfile({...base},get);
 assert.equal(old.tradeName,'Boer Bart');assert.equal(old.iban,'NL66BUNQ2108602240');assert.equal(old.ibanName,'Boer Bart');assert.equal(old.ibanFromSettings,true);
 const now=companyProfile({...base,iban:'NL91ABNA0417164300',ibanName:'Holtrop VOF',tradeName:'Boer Bart',legalName:'Holtrop VOF'},get);
 assert.equal(now.iban,'NL91ABNA0417164300','Bedrijfsgegevens gaat voor');assert.equal(now.ibanName,'Holtrop VOF');assert.equal(now.ibanFromSettings,false);
 assert.equal(invoiceName(now),'Boer Bart (Holtrop VOF)');
 assert.equal(companyProfile(undefined).iban,'');assert.equal(companyProfile({...base,iban:'NL91ABNA0417164300'}).ibanName,'Boer Bart','zonder tenaamstelling: de handelsnaam');
});
