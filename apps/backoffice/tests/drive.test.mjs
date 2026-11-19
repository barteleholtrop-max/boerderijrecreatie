import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseFolderId,childrenQuery,skipReason,sniffImage,imageName,driveLink}=await import('../lib/drive-core.ts');
const ID='1Yw9R70qERX_cWZg-TB_qw_bxW9M2kc-g';

test('map-ID of link van de map, zoals je hem uit Drive kopieert',()=>{
 for(const v of [ID,' '+ID+' ','https://drive.google.com/drive/u/0/folders/'+ID,'https://drive.google.com/drive/folders/'+ID+'?usp=sharing','https://drive.google.com/open?id='+ID])assert.equal(parseFolderId(v),ID,v);
 for(const v of ['','kort','https://evil.example/drive/folders/'+ID,'http://drive.google.com/drive/folders/'+ID,"x' or '1'='1",null,42])assert.equal(parseFolderId(v),null,String(v));
});
test('de zoekopdracht kan niet worden misbruikt',()=>{
 assert.equal(childrenQuery(ID),`'${ID}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType contains 'image/')`);
 assert.throws(()=>childrenQuery("a' or name contains '"));
});
test('welke foto\'s wel en niet worden overgenomen',()=>{
 assert.equal(skipReason({id:'a',name:'a.jpg',mimeType:'image/jpeg',size:'1000'}),null);
 assert.equal(skipReason({id:'a',name:'a.png',mimeType:'image/png'}),null);
 assert.match(skipReason({id:'a',name:'a.heic',mimeType:'image/heic'}),/HEIC/);
 assert.match(skipReason({id:'a',name:'a.gif',mimeType:'image/gif'}),/JPG, PNG of WebP/);
 assert.match(skipReason({id:'a',name:'a.jpg',mimeType:'image/jpeg',size:String(21*1024*1024)}),/20 MB/);
 assert.equal(sniffImage(new Uint8Array([0xff,0xd8,0xff,0xe0])),'image/jpeg');
 assert.equal(sniffImage(new Uint8Array([0x89,0x50,0x4e,0x47,13,10,26,10])),'image/png');
 assert.equal(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')),'image/webp');
 assert.equal(sniffImage(new TextEncoder().encode('<svg>')),null);
 assert.equal(imageName('Pompoensoep.JPG'),'Pompoensoep');assert.equal(imageName('.jpg'),'Foto uit Drive');
 assert.equal(driveLink('abc'),'https://drive.google.com/file/d/abc/view');
});

// Herstel 12 november 2026: de lijst met beelden kwam mee naar online, de bestanden van de Chromebook-schijf niet.
test('een beeld zonder bestand wordt opnieuw uit Drive gehaald onder hetzelfde nummer; aanwezige beelden blijven ongemoeid',async()=>{
 const {restoreMissing}=await import('../lib/drive-core.ts');
 const jpg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1]).buffer;
 const stored=new Map([['aanwezig','x']]),downloads=[];
 const io={has:async id=>stored.has(id),download:async f=>{downloads.push(f);if(f==='kapotDriveBestand123456')throw Error('404');return f==='geenFotoDriveBestand1234'?new TextEncoder().encode('geen foto').buffer:jpg},put:async(id,_b,mime)=>{stored.set(id,mime)}};
 const r=await restoreMissing([{id:'aanwezig',sourceId:'aanwezigDriveBestand1234'},{id:'kwijt',sourceId:'kwijtDriveBestand123456'},{id:'deelnemer',sourceId:'deelnemer:1063e3a8'},{id:'kapot',sourceId:'kapotDriveBestand123456'},{id:'geen',sourceId:'geenFotoDriveBestand1234'}],io);
 assert.deepEqual(r,{restored:1,failed:2});
 assert.equal(stored.get('kwijt'),'image/jpeg');
 assert.deepEqual(downloads,['kwijtDriveBestand123456','kapotDriveBestand123456','geenFotoDriveBestand1234'],'geen download voor aanwezige of niet-Drive-beelden');
 assert.equal((await restoreMissing([{id:'a',sourceId:'kwijtDriveBestand1234567'},{id:'b',sourceId:'kwijtDriveBestand1234568'}],{...io,has:async()=>false},1)).restored,1,'begrensd per ronde');
});
