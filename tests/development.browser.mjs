import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import {openStore, readBoard} from '../tools/website-dev/store.mjs';
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');

test('owner assigns a developer, records testing, selects the daily list, exports and reopens history',async t=>{
  const repo=process.cwd(), dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-development-browser-')),password=randomUUID();
  const boardSnapshot=path.join(repo,'apps/planbord/snapshot/board.json'), board=readBoard({boardSnapshot});
  const server=createWebsiteServer({root:path.join(repo,'apps/website'),dataDir,devMode:true,username:'owner',password,origin:'http://127.0.0.1:0',boardSnapshot});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});});
  const store=openStore(dataDir);
  const p=store.mutate({id:randomUUID(),requestId:randomUUID(),revision:0,action:'save',description:'Maak de knop helder',component:'Dagelijkse testknop',pageUrl:origin+'/',topicId:board.topics[0].id},'owner',board,origin);
  store.manage({requestId:randomUUID(),action:'approve',items:[{id:p.id,revision:p.revision}],reference:'Bestaand planbordbesluit',boardConfirmed:true},'owner',board);store.close();
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/__dev/login');// no login any more: goes straight back to the site

  await page.getByRole('button',{name:'＋ Verbetering voorstellen',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Ontwikkelingen & dagelijkse goedkeuring',exact:true}).click();
  const panel=dialog.locator('#development-panel');await panel.getByText('Dagelijkse testknop',{exact:false}).first().waitFor();
  await panel.getByRole('button',{name:'Ontwikkelaar / voortgang',exact:true}).click();
  const form=panel.locator('#development-form');await form.getByLabel('Ontwikkelaar',{exact:true}).fill('Claude Code');await form.getByLabel('GitHub-branch',{exact:true}).fill('feat/testknop');
  await form.getByLabel('Pull-requestnummer',{exact:true}).fill('19');await form.getByLabel('Commit-SHA (40 tekens)',{exact:true}).fill('a'.repeat(40));await form.getByLabel('Onderbouwing / testbewijs',{exact:true}).fill('Ontwikkeling gekoppeld');
  page.once('dialog',e=>e.accept());await form.getByRole('button',{name:'Toewijzing bewaren / opnieuw testen',exact:true}).click();await form.waitFor({state:'hidden'});
  for(const status of ['Klaar om te testen','Getest','Klaar om samen te voegen']){
    await panel.getByRole('button',{name:'Ontwikkelaar / voortgang',exact:true}).click();await form.getByLabel('Onderbouwing / testbewijs',{exact:true}).fill('De gekoppelde commit is handmatig getest.');await form.getByRole('button',{name:'Vastleggen: '+status,exact:true}).click();await form.waitFor({state:'hidden'});
  }
  await panel.getByLabel('Statusfilter').selectOption('ready');await panel.getByRole('checkbox',{name:'Selecteer Dagelijkse testknop'}).check();await panel.getByText('1 geteste wijzigingen geselecteerd',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Geselecteerde wijzigingen controleren',exact:true}).click();await dialog.locator('#message').filter({hasText:'Samenvoegen staat uit'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Goedgekeurde wijzigingen samenvoegen',exact:true}).count(),0);
  const downloadPromise=page.waitForEvent('download');await panel.getByRole('link',{name:'Export voor Claude Code',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'boer-bart-claude-code.md');
  await dialog.getByRole('button',{name:'Nieuw voorstel',exact:true}).click();await panel.waitFor({state:'hidden'});
  await dialog.getByRole('button',{name:'Ontwikkelingen & dagelijkse goedkeuring',exact:true}).click();await panel.getByRole('button',{name:'Ontwikkelaar / voortgang',exact:true}).click();
  await form.getByText('Ontwikkelgeschiedenis',{exact:true}).click();assert.match(await form.locator('#development-history').textContent(),/Getest/);
  await page.reload();await page.getByRole('button',{name:'＋ Verbetering voorstellen',exact:true}).click();await dialog.getByRole('button',{name:'Ontwikkelingen & dagelijkse goedkeuring',exact:true}).click();assert.match(await panel.textContent(),/Claude Code/);
  assert.deepEqual(errors,[]);
});
