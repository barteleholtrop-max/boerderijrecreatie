// Etiketten fotograferen in de kassa (wens eigenaar 11 november 2026: „bij de kassa, in het scherm van kok, barista enz., kunnen we
// geen etiket scannen”). Tegen de gebouwde backoffice; producten, bestellingen en het lezen van het etiket zijn nagebootst.
// Eerst `npm run build` in apps/backoffice.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loginEnv,sessionCookie} from './sessie.mjs';
const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64');
const product=(id,name,priceCents,extra={})=>{const p={name,department:'Winkel',station:'winkel',priceCents,vat:'9',available:true,optionGroups:[],...extra};return {id,version:1,published:p,draft:p}};
const products=[product('t-lever','Runderlever',1300,{customerPrice:true}),product('t-koffie','Koffie',350,{station:'barista',department:'Ite'})];
const vla=product('t-vla','Zuivelrijck vanillevla 1 liter',200);

test('kassa: etiketten fotograferen; bedrag van het etiket en een nieuw product via de streepjescode komen in de bestelling',{skip:!built&&'eerst npm run build',timeout:120000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-kassa-etiket-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5200+Math.floor(Math.random()*400),base='http://127.0.0.1:'+port;
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(DATABASE_URL|SUPABASE_|K_SERVICE|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|BACKOFFICE_TUNNEL)/.test(k))),
  BOER_BART_LOGIN:'aan',...loginEnv,APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,ASSISTANT_WORKER:'0',NEXT_TELEMETRY_DISABLED:'1'};
 const log=[],child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 // Altijd netjes stoppen, ook als de server al gestopt is (anders wacht de test eeuwig op 'exit').
 t.after(()=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();const hard=setTimeout(()=>{child.kill('SIGKILL');r()},5000);child.once('exit',()=>{clearTimeout(hard);r()});child.kill()}));
 let up=false;for(let i=0;i<150&&!up&&child.exitCode===null;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet:\n'+log.join(''));

 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const [name,...rest]=sessionCookie('bart').split('=');await context.addCookies([{name,value:rest.join('='),url:base}]);
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],sent=[];page.on('pageerror',e=>errors.push(e.message));
 // Geen camera in de test: het scherm biedt dan „Camera-app openen” (bestandskeuze). BarcodeDetector ziet een streepjescode.
 await page.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=undefined;
  window.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13']}async detect(){return window.__code?[{rawValue:window.__code}]:[]}}});
 let list=[...products];
 await page.route('**/*',route=>{const url=new URL(route.request().url()),json=(b,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(b)});
  if(url.origin!==base)return route.abort();
  if(url.pathname==='/api/products')return json(list);
  if(url.pathname==='/api/orders'&&route.request().method()==='GET')return json([]);
  if(url.pathname==='/api/werkplek/etiket'){const b=JSON.parse(route.request().postData());sent.push(b);
   if(b.barcode){list=[...products,vla];return json({ok:true,productId:'t-vla',product:null,created:true,labelName:'Zuivelrijck vanillevla 1 liter',totalCents:200,weightGrams:null,unitPriceCents:null,checked:true,barcode:b.barcode})}
   return json({ok:true,productId:'t-lever',product:null,created:false,labelName:'Runderlever',totalCents:1277,weightGrams:530,unitPriceCents:2410,checked:true})}
  if(url.pathname.startsWith('/api/')&&!['/api/omgeving'].includes(url.pathname))return json({});
  return route.continue()});
 await page.goto(base+'/werkplek/kassa');
 await page.getByRole('button',{name:'Runderlever toevoegen'}).waitFor();
 await page.getByRole('button',{name:/Etiketten fotograferen/}).click();
 const cam=page.getByRole('dialog',{name:'Etiketten fotograferen'});await cam.waitFor();
 // Etiket 1: vlees met een etiketprijs.
 let [chooser]=await Promise.all([page.waitForEvent('filechooser'),cam.getByRole('button',{name:/Camera-app openen/}).click()]);
 await chooser.setFiles({name:'lever.png',mimeType:'image/png',buffer:PNG});
 await cam.getByText(/✓ Runderlever €\s?12,77/).waitFor();
 // Etiket 2: verpakt product met een streepjescode, net nieuw in de productlijst.
 await page.evaluate(()=>{window.__code='8710400000051'});
 [chooser]=await Promise.all([page.waitForEvent('filechooser'),cam.getByRole('button',{name:/Camera-app openen/}).click()]);
 await chooser.setFiles({name:'vla.png',mimeType:'image/png',buffer:PNG});
 await cam.getByText(/✓ Zuivelrijck vanillevla 1 liter €\s?2,00 \(nieuw\)/).waitFor();
 await cam.getByRole('button',{name:'Klaar (2)'}).click();
 assert.equal(sent.length,2);assert.match(sent[0].image,/^data:image\/jpeg;base64,/);assert.equal(sent[0].barcode,undefined);assert.equal(sent[1].barcode,'8710400000051');
 const basket=page.locator('.cash-basket');
 await basket.getByText('1 × Runderlever').waitFor();await basket.getByText('1 × Zuivelrijck vanillevla 1 liter').waitFor();
 assert.match(await basket.locator('.cash-total').innerText(),/14,77/);
 assert.deepEqual(errors,[]);
});
