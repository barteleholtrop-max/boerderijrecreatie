// Vrijwilligers kunnen hun BB-vergoeding laten overmaken via de maandagvraag (melding eigenaar 16 november 2026).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('de maandagvraag neemt vrijwilligers mee, ook zonder ledensoort A, B of L',()=>{
 const src=fs.readFileSync(new URL('../lib/bb-payout.ts',import.meta.url),'utf8');
 assert.match(src,/if\(!getsBb\(p\.memberClass\)&&!p\.volunteer\)continue;/);
 assert.doesNotMatch(src,/if\(!getsBb\(p\.memberClass\)\)continue;/);
});
