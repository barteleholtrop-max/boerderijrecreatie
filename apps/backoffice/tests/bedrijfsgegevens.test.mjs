// Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek voor alles over het bedrijf.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {contactSchema}=await import('../lib/guest-core.ts');
const {companyProfile,invoiceName}=await import('../lib/company.ts');
const base={phone:'',email:'',whatsapp:''};

test('bedrijfsgegevens: alles optioneel, oude contactgegevens blijven geldig',()=>{
 const c=contactSchema.parse({phone:'0513 123 456',email:'info@example.nl',whatsapp:'',street:'Dorpsstraat 1',postalCode:'1234 AB',city:'Rotstergaast'});
 assert.equal(c.iban,'');assert.equal(c.tradeName,'');assert.equal(c.legalForm,'');
});

test('bedrijfsgegevens: IBAN, BIC, vestigingsnummer en webadressen worden gecontroleerd',()=>{
 const c=contactSchema.parse({...base,iban:'nl91 abna 0417 1643 00',bic:'abnanl2a',establishmentNumber:'000012345678',kvk:'12345678',legalForm:'vof',website:'https://www.example.nl'});
 assert.equal(c.iban,'NL91ABNA0417164300','zonder spaties bewaard');assert.equal(c.bic,'ABNANL2A');
 assert.throws(()=>contactSchema.parse({...base,iban:'NL91ABNA0417164301'}),/IBAN is niet geldig/);
 assert.throws(()=>contactSchema.parse({...base,bic:'BUNQ'}),/BIC/);
 assert.throws(()=>contactSchema.parse({...base,establishmentNumber:'1234'}),/vestigingsnummer/);
 assert.throws(()=>contactSchema.parse({...base,website:'http://example.nl'}),/https/);
 assert.throws(()=>contactSchema.parse({...base,instagram:'javascript:alert(1)'}),/https/);
 assert.throws(()=>contactSchema.parse({...base,legalForm:'nv'}));
});

test('bedrijfsgegevens: handelsnaam standaard Boerderijrecreatie; IBAN uit de oude instelling tot het hier is opgeslagen',()=>{
 const settings={INVOICE_IBAN:'NL91ABNA0417164300',INVOICE_ACCOUNT_NAME:'Boerderijrecreatie'};const get=k=>settings[k];
 const old=companyProfile({...base},get);
 assert.equal(old.tradeName,'Boerderijrecreatie');assert.equal(old.iban,'NL91ABNA0417164300');assert.equal(old.ibanName,'Boerderijrecreatie');assert.equal(old.ibanFromSettings,true);
 const now=companyProfile({...base,iban:'NL91ABNA0417164300',ibanName:'Voorbeeld VOF',tradeName:'Boerderijrecreatie',legalName:'Voorbeeld VOF'},get);
 assert.equal(now.iban,'NL91ABNA0417164300','Bedrijfsgegevens gaat voor');assert.equal(now.ibanName,'Voorbeeld VOF');assert.equal(now.ibanFromSettings,false);
 assert.equal(invoiceName(now),'Boerderijrecreatie (Voorbeeld VOF)');
 assert.equal(companyProfile(undefined).iban,'');assert.equal(companyProfile({...base,iban:'NL91ABNA0417164300'}).ibanName,'Boerderijrecreatie','zonder tenaamstelling: de handelsnaam');
});
