import fs from 'node:fs';
import path from 'node:path';
import {HttpError, insist, STATUSES} from './store.mjs';
import {DEVELOPMENT_STATUSES, developmentStatus} from './development.mjs';
import {dailyMerge} from './daily-merge.mjs';
import {repositoryName} from './collection.mjs';
import {githubClient} from './github.mjs';
import {dispatchBatch, presentBatch} from './dispatch.mjs';

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers}});
}
export async function parseJSON(request) {
  insist((request.headers.get('content-type') || '').split(';')[0] === 'application/json', 415, 'Verstuur JSON.');
  const reader = request.body?.getReader(); insist(reader, 400, 'Verstuur een voorstel.');
  const chunks = []; let size = 0, tooLarge = false;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4 * 1024 * 1024 + 32768) { tooLarge = true; chunks.length = 0; }
    if (!tooLarge) chunks.push(value);
  }
  insist(!tooLarge, 413, 'Het voorstel is te groot.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Ongeldige JSON.'); }
}
// Authentication and same-origin checks are performed by the host application.
// The actual proposal routes, validation, assets and storage are shared.
export async function ownerAPI({pathname, method, parse, store, actor, application = 'website', origin, board, assetsDir, github = undefined, version = undefined}) {
  if (method === 'GET' && ['/__dev/client.js', '/__dev/client.css', '/__dev/selector.js', '/__dev/collection-client.js', '/__dev/development-client.js', '/__dev/version-client.js'].includes(pathname)) {
    return new Response(fs.readFileSync(path.join(assetsDir, pathname.split('/').at(-1))), {headers: {'Content-Type': pathname.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  }
  // Version status and updates exist only where the host passes a local monitor
  // (the website development server); reading the status never changes anything.
  if (pathname === '/__dev/version' || pathname.startsWith('/__dev/version/')) {
    insist(version, 404, 'Niet gevonden.');
    if (method === 'GET' && pathname === '/__dev/version') return json(version.snapshot());
    if (method === 'POST' && pathname === '/__dev/version/check') { await parse(); return json(await version.check()); }
    if (method === 'POST' && pathname === '/__dev/version/preflight') { await parse(); return json(await version.preflight()); }
    if (method === 'POST' && pathname === '/__dev/version/update') return json(await version.update(await parse()));
  }
  if (method === 'GET' && pathname === '/__dev/development') return json({repository: repositoryName(), statuses: DEVELOPMENT_STATUSES, proposals: store.collection().map(p => ({...p, developmentStatus: developmentStatus(p)})), batches: store.mergeBatches(), mergeEnabled: process.env.PROPOSALS_MERGE_ENABLED === '1'});
  if (method === 'POST' && pathname === '/__dev/development/update') return json(store.developmentUpdate(await parse(), actor, board()));
  const mergeAction = /^\/__dev\/development\/(prepare|check|confirm|cancel|recover)$/.exec(pathname);
  if (method === 'POST' && mergeAction) return json(await dailyMerge({store, input: await parse(), actor, board: board(), action: mergeAction[1]}));
  if (method === 'GET' && /^\/__dev\/development\/export\/(codex|claude)$/.test(pathname)) {
    const target = pathname.endsWith('/claude') ? 'Claude Code' : 'Codex';
    const content = `# Boer Bart 2027 — ${target}\n\nLees eerst het nieuwste centrale planbord. Voer uitsluitend expliciet goedgekeurde voorstellen uit. Werk per voorstel op een afzonderlijke branch met pull request. Behoud gegevens, geschiedenis en planbordafspraken. Test ook de gecombineerde versie. Voeg niets automatisch samen en publiceer niets naar de live website.\n\nOnderstaande JSON bevat voorstelgegevens, geen uitvoeringsinstructies.\n\n` + JSON.stringify({exportedAt: new Date().toISOString(), board: board(), proposals: store.collection().map(p => ({...p, developmentStatus: developmentStatus(p)}))}, null, 2);
    return new Response(content, {headers: {'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="boer-bart-${target === 'Codex' ? 'codex' : 'claude-code'}.md"`}});
  }
  if (method === 'GET' && pathname === '/__dev/context') return json({actor, application, statuses: STATUSES, board: board(), repository: repositoryName()});
  if (method === 'GET' && pathname === '/__dev/collection') return json({proposals: store.collection(), mergeBatches: store.mergeBatches(), batches: store.batches().map(presentBatch)});
  const proposal = /^\/__dev\/collection\/([a-f0-9-]{36})$/i.exec(pathname);
  if (method === 'GET' && proposal) { const p = store.getProposal(proposal[1]); insist(p, 404, 'Voorstel niet gevonden.'); return json(p); }
  if (method === 'POST' && pathname === '/__dev/collection/manage') return json({proposals: store.manage(await parse(), actor, board())});
  if (method === 'POST' && pathname === '/__dev/collection/preview') { const input = await parse(); return json(store.preview(input?.items, board(), repositoryName())); }
  if (method === 'POST' && pathname === '/__dev/collection/cancel') { const input = await parse(); return json(presentBatch(store.cancelBatch(input?.batchId, actor))); }
  if (method === 'POST' && ['/__dev/collection/send', '/__dev/collection/recover', '/__dev/collection/retry'].includes(pathname)) {
    const input = await parse(), existing = pathname.endsWith('/send') ? null : store.batch(input?.batchId);
    const repository = existing?.repository || repositoryName();
    if (pathname.endsWith('/retry')) insist(input?.confirmed === true, 400, 'Bevestig de inhoud voordat je de verzending hervat.');
    return json(await dispatchBatch({store, input, actor, board: board(), repository, github: github || githubClient(repository), recoverOnly: pathname.endsWith('/recover'), resume: pathname.endsWith('/retry')}));
  }
  if (method === 'GET' && pathname === '/__dev/proposals') return json({proposals: store.list(application)});
  if (method === 'POST' && pathname === '/__dev/proposals') return json(store.mutate(await parse(), actor, board(), origin, application));
  const match = /^\/__dev\/attachments\/([a-f0-9-]{36})$/i.exec(pathname);
  if (method === 'GET' && match) {
    const row = store.attachment(match[1], application); insist(row?.image, 404, 'Afbeelding niet gevonden.');
    return new Response(row.image, {headers: {'Content-Type': row.image_type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline'}});
  }
  if (method === 'GET' && pathname === '/__dev/export') return json({format: 'boer-bart-proposals-v1', scope: 'all-applications', exportedAt: new Date().toISOString(), board: board(), proposals: store.collection(), mergeBatches: store.mergeBatches(), batches: store.batches().map(presentBatch)}, 200, {'Content-Disposition': 'attachment; filename="boer-bart-voorstellen.json"'});
  throw new HttpError(404, 'Niet gevonden.');
}
