import {digest} from './development.mjs';
import {insist} from './errors.mjs';
import {gh} from './github.mjs';
import {repositoryName} from './collection.mjs';

// The live board is read only. Its credentials remain on the server. No fallback
// to a snapshot is allowed for a merge, even when the owner confirmed an approval.
export async function verifyLatestBoard(board, environment = process.env, fetcher = fetch) {
  const endpoint = environment.PROPOSALS_BOARD_URL;
  insist(endpoint && (environment.PLANBORD_LEESSLEUTEL || '').length >= 32, 503, 'Configureer de actuele planbord-API en alleen-lezen toegang voordat je samenvoegt.');
  const url = new URL(endpoint);
  insist(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 503, 'Gebruik een HTTPS-planbord-API zonder tokens in de URL.');
  const response = await fetcher(url, {redirect: 'error', signal: AbortSignal.timeout(10000), headers: {Authorization: 'Bearer ' + environment.PLANBORD_LEESSLEUTEL}});
  insist(response.ok, 503, 'Het actuele planbord is niet bereikbaar. Er wordt niet samengevoegd.');
  const live = await response.json();
  insist(live.revision === board.revision && Array.isArray(live.board?.nodes) && digest(live.board.nodes.map(n => ({id: n.id, title: n.title, status: n.status, decisionDigest: digest([n.body ?? '', n.notes ?? ''])}))) === digest(board.topics), 409, 'Er is een nieuwere of afwijkende planbordversie. Werk eerst de lokale planbordbron bij en beoordeel de wijzigingen opnieuw.');
}
export function mergeGithub(repository = repositoryName(), run = gh) {
  const root = `repos/${repository}`;
  async function main() { const b = await run('GET', `${root}/branches/main`); return b.commit.sha; }
  async function protection() {
    const p = await run('GET', `${root}/branches/main/protection`);
    insist(p.enforce_admins?.enabled && p.required_status_checks?.strict && (p.required_status_checks.contexts?.includes('build') || p.required_status_checks.checks?.some(c => c.context === 'build')) && p.required_pull_request_reviews?.required_approving_review_count >= 1 && p.required_pull_request_reviews?.dismiss_stale_reviews && !p.allow_force_pushes?.enabled && !p.allow_deletions?.enabled, 409, 'Bescherm main: verplichte actuele build, minimaal één review, vervallen oude reviews en geen force-push/verwijdering; ook voor beheerders.');
  }
  async function tested(head) {
    // Require the repository's complete verification workflow on this exact
    // pushed SHA. A check from an old commit or arbitrary check name is no proof.
    const runs = await run('GET', `${root}/actions/workflows/verify.yml/runs?head_sha=${head}&event=push&per_page=100`);
    const latest = runs.workflow_runs?.filter(r => r.head_sha === head && r.event === 'push').sort((a,b) => b.id - a.id)[0];
    insist(latest?.status === 'completed' && latest.conclusion === 'success', 409, 'De volledige tests, build en typecontrole zijn nog niet geslaagd op deze exacte commit.');
    return {runId: latest.id, headSha: head};
  }
  async function pull(number) { return run('GET', `${root}/pulls/${number}`); }
  async function validate(p) {
    const d = p.development, pr = await pull(d.pullRequest);
    insist(pr.state === 'open' && !pr.draft && pr.base.ref === 'main' && pr.base.repo.full_name === repository && pr.head.repo?.full_name === repository && pr.head.ref === d.branch && pr.head.sha === d.headSha && pr.mergeable === true && pr.mergeable_state === 'clean', 409, 'Een pull request is gewijzigd, heeft conflicten, mist goedkeuring of is nog niet gereed.');
    await tested(d.headSha); return pr;
  }
  return {main, protection, tested, validate, pull,
    async prepare(batch, base) {
      const branch = `integration/daily-${batch.id}`;
      await run('POST', `${root}/git/refs`, {ref: `refs/heads/${branch}`, sha: base});
      let head = base;
      for (const p of batch.proposals) {
        const result = await run('POST', `${root}/merges`, {base: branch, head: p.development.headSha, commit_message: `Combineer voorstel ${p.id}`});
        insist(result?.sha, 409, 'Een wijziging is al opgenomen of heeft een Git-conflict. Controleer de integratiebranch.'); head = result.sha;
      }
      const pr = await run('POST', `${root}/pulls`, {head: branch, base: 'main', title: `Dagelijkse goedkeuring — ${batch.proposals.length} wijzigingen`, body: `Samenvoegcontrole ${batch.id}.\n\n${batch.proposals.map(p => `- Voorstel ${p.id}: #${p.development.pullRequest} (${p.development.headSha})`).join('\n')}\n\nAlleen samenvoegen na geslaagde gecombineerde tests en expliciete bevestiging door de eigenaar. Geen publicatie.`, draft: false});
      insist(Number.isSafeInteger(pr.number) && pr.html_url === `https://github.com/${repository}/pull/${pr.number}`, 502, 'De integratie-PR kon niet worden bevestigd.');
      return {branch, head, pullRequest: pr.number, url: pr.html_url};
    },
    async merge(candidate) {
      const result = await run('PUT', `${root}/pulls/${candidate.pullRequest}/merge`, {sha: candidate.head, merge_method: 'merge', commit_title: `Dagelijkse eigenaargoedkeuring #${candidate.pullRequest}`});
      insist(result?.merged === true && /^[a-f0-9]{40}$/.test(result.sha), 409, 'GitHub heeft de samenvoeging niet bevestigd.'); return result.sha;
    },
  };
}
export async function dailyMerge({store, input, actor, board, action, github = mergeGithub(), verifyBoard = verifyLatestBoard, enabled = process.env.PROPOSALS_MERGE_ENABLED === '1'}) {
  if (!['cancel', 'recover'].includes(action)) insist(enabled, 503, 'Samenvoegen staat uit. Controleer eerst hoofdbranchbescherming en ontkoppel automatische live-publicatie.');
  if (action === 'prepare') {
    await verifyBoard(board); await github.protection();
    const proposals = store.developmentSelection(input.items, board);
    for (const p of proposals) await github.validate(p);
    const base = await github.main(), batch = store.mergeReserve(input.items, actor, board);
    try {
      const candidate = await github.prepare(batch, base);
      return store.mergePatch(batch.id, {state: 'testing', base, candidate}, 'preparing');
    } catch {
      return store.mergePatch(batch.id, {state: 'blocked', error: 'De integratiebranch kon niet volledig worden voorbereid. Controleer GitHub; er is niets naar main samengevoegd.'}, 'preparing');
    }
  }
  let batch = store.mergeBatch(input.batchId); insist(batch, 404, 'Samenvoegcontrole niet gevonden.');
  if (action === 'cancel') {
    insist(['preparing', 'testing', 'ready', 'blocked'].includes(batch.state), 409, 'Een gestarte of onzekere merge kan niet worden geannuleerd.');
    return store.mergePatch(batch.id, {state: 'cancelled', cancelledBy: actor});
  }
  // Read-only reconciliation after a lost response or process restart. Never
  // replay a main-branch write automatically.
  if (action === 'recover') {
    insist(batch.candidate, 409, 'Controleer de achtergebleven integratiebranch handmatig.');
    const pr = await github.pull(batch.candidate.pullRequest);
    if (pr.merged === true && ['merging', 'uncertain'].includes(batch.state) && batch.confirmedBy && pr.head.sha === batch.candidate.head) return store.mergePatch(batch.id, {state: 'merged', mergeCommit: pr.merge_commit_sha});
    return batch;
  }
  insist(['testing', 'ready'].includes(batch.state), 409, 'Start een nieuwe controle of herstel de onzekere samenvoegstatus.');
  await verifyBoard(board);
  insist(digest(board) === batch.boardDigest, 409, 'Het planbord is gewijzigd sinds de gecombineerde controle. Start een nieuwe controle.');
  store.developmentSelection(batch.items, board);
  await github.protection();
  insist(await github.main() === batch.base, 409, 'Main is gewijzigd. Annuleer en test een nieuwe gecombineerde versie.');
  for (const p of batch.proposals) await github.validate(p);
  const combined = await github.tested(batch.candidate.head), pr = await github.pull(batch.candidate.pullRequest);
  insist(pr.state === 'open' && !pr.draft && pr.base.ref === 'main' && pr.base.sha === batch.base && pr.head.sha === batch.candidate.head && pr.mergeable === true && pr.mergeable_state === 'clean', 409, 'De integratie-PR is gewijzigd, heeft conflicten of mist de verplichte review.');
  if (action === 'check') return store.mergePatch(batch.id, {state: 'ready', combined}, batch.state);
  insist(action === 'confirm' && batch.state === 'ready' && input.confirmed === true && input.confirmation === `SAMENVOEGEN ${batch.id}`, 400, 'Bevestig expliciet de geteste selectie voordat je samenvoegt.');
  batch = store.mergePatch(batch.id, {state: 'merging', confirmedBy: actor, confirmedAt: new Date().toISOString(), combined}, 'ready');
  try { const mergeCommit = await github.merge(batch.candidate); return store.mergePatch(batch.id, {state: 'merged', mergeCommit}); }
  catch { return store.mergePatch(batch.id, {state: 'uncertain', error: 'Het mergeantwoord is onzeker. Controleer GitHub met Status herstellen. Er wordt niet automatisch opnieuw samengevoegd.'}); }
}
