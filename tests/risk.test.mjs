import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, parseNameStatus, parseAddedLines} from '../tools/website-dev/risk.mjs';

const one = (file, status = 'M', added) => classify([{status, file}], added ? {[file]: added} : {});
const categories = result => result.reasons.map(r => r.category).sort();

test('website layout, styling, images, docs and tests are low risk', () => {
  for (const file of ['apps/website/index.html', 'apps/website/style.css', 'apps/website/assets/foto.webp', 'docs/HOSTING.md', 'README.md', 'tests/website-dev.test.mjs', 'apps/backoffice/app/media/page.tsx', 'apps/backoffice/app/globals.css']) {
    assert.equal(one(file).level, 'laag', file);
  }
});

test('each approval category is recognised', () => {
  assert.deepEqual(categories(one('deploy/docker/website.Dockerfile')), ['productie']);
  assert.deepEqual(categories(one('.github/workflows/verify.yml')), ['productie']);
  assert.ok(categories(one('apps/backoffice/app/api/products/route.ts')).includes('beveiliging'));
  assert.deepEqual(categories(one('apps/backoffice/.env.example')), ['beveiliging']);
  assert.ok(categories(one('apps/backoffice/app/kassa/page.tsx')).includes('betalingen'));
  assert.deepEqual(categories(one('apps/backoffice/drizzle/0008_x.sql')), ['gegevens']);
  assert.deepEqual(categories(one('apps/planbord/snapshot/board.json')), ['gegevens']);
  assert.ok(categories(one('apps/backoffice/lib/opening-hours-core.ts')).includes('bedrijfsregels'));
  assert.ok(categories(one('apps/website/reserveren-proef.js')).includes('bedrijfsregels'));
  assert.deepEqual(categories(one('apps/backoffice/package.json')), ['architectuur']);
  assert.deepEqual(categories(one('tools/start-review.mjs')), ['architectuur']);
  assert.deepEqual(categories(one('docs/GOEDKEURINGSBELEID.md')), ['architectuur']);
});

test('unknown places are never low risk', () => {
  assert.deepEqual(categories(one('nieuw-bestand.txt')), ['onbekend']);
  assert.deepEqual(categories(one('apps/backoffice/lib/helper.ts')), ['onbekend']);
});

test('deleting or renaming code needs approval, deleting docs does not', () => {
  assert.deepEqual(categories(one('apps/website/oud.css', 'D')), ['verwijdering']);
  assert.equal(one('docs/OUD.md', 'D').level, 'laag');
  assert.ok(categories(classify([{status: 'R100', from: 'tools/a.mjs', file: 'tests/a.mjs'}])).includes('architectuur'));
});

test('hardcoded prices or opening times outside the backoffice need approval', () => {
  assert.deepEqual(categories(one('apps/website/index.html', 'M', ['<p>Pannenkoek € 8,50</p>'])), ['bron']);
  assert.deepEqual(categories(one('apps/website/index.html', 'M', ['<p>Open 10:00 - 17:00</p>'])), ['bron']);
  assert.equal(one('apps/website/index.html', 'M', ['<p>Welkom op de boerderij</p>']).level, 'laag');
  // Docs may mention amounts; the source rule only covers user-facing app code.
  assert.equal(one('docs/HOSTING.md', 'M', ['Kost ongeveer € 5 per maand']).level, 'laag');
});

test('git output is parsed into changes and added lines', () => {
  assert.deepEqual(parseNameStatus('M\0apps/website/a.css\0R090\0tools/x.mjs\0tests/x.mjs\0D\0docs/b.md\0'), [
    {status: 'M', file: 'apps/website/a.css'},
    {status: 'R090', from: 'tools/x.mjs', file: 'tests/x.mjs'},
    {status: 'D', file: 'docs/b.md'},
  ]);
  const diff = 'diff --git a/apps/website/i.html b/apps/website/i.html\n--- a/apps/website/i.html\n+++ b/apps/website/i.html\n@@ -1 +1 @@\n-oud\n+nieuw €5\n';
  assert.deepEqual(parseAddedLines(diff), {'apps/website/i.html': ['nieuw €5']});
});
