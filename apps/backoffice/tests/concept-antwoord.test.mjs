// Standaard een concept (wens eigenaar 10 november 2026).
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
// Chatkanalen (WhatsApp, Messenger, Instagram): het antwoordvoorstel komt uit main (app/gesprekken/meta.tsx, suggest);
// de aparte conceptroute uit #378 is bij het samenvoegen vervallen (12 november 2026).
// Mail en websitechat: het conceptvoorstel in het antwoordvak en één advies komen uit #398 (main).
test('één advies op het scherm: geen groene AI-notitie meer',()=>{
 for(const f of ['app/gesprekken/mail.tsx','app/gesprekken/page.tsx'])assert.doesNotMatch(read(f),/<AdviceNote/,f);
});

