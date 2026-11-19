// Bijwerken bij het starten (besluit eigenaar, 2 november 2026): `./boerbart-test` brengt de werkmap eerst naar de
// nieuwste goedgekeurde GitHub main. Wat op main staat, is via een pull request door de eigenaar goedgekeurd.
// Veiligheid:
//  - lokaal gewijzigde (gevolgde) bestanden worden nooit overschreven: dan wordt er niet bijgewerkt en start de huidige versie;
//  - een andere branch blijft gewoon bestaan; een afwijkende lokale main wordt eerst bewaard als reserve-branch;
//  - vóór het bijwerken komt er een kopie van var/development in var/backups (de laatste 5 blijven bewaard);
//  - pakketten worden alleen geïnstalleerd als package.json of package-lock.json is veranderd;
//  - geen internet: er wordt niets veranderd en de huidige versie start.
import fs from 'node:fs';
import path from 'node:path';

export const RESTART_FILES = /(^|\/)package(-lock)?\.json$/;
const BUSY = ['index.lock', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];

/**
 * run(args) → {code, stdout, stderr} runs git in the repo; install() runs `npm run install:apps` and returns true on success.
 * Returns what happened, for the start script and for tests.
 */
export async function startupUpdate({repo, run, install, log = () => {}, now = () => new Date(), remote = 'origin', branch = 'main', keepBackups = 5}) {
  const out = async args => { const r = await run(args); if (r.code !== 0) throw Object.assign(new Error((r.stderr || r.stdout || '').trim() || 'git ' + args.join(' ')), {git: true}); return r.stdout.trim(); };
  for (const name of BUSY) {
    const p = (await run(['rev-parse', '--git-path', name])).stdout.trim();
    if (p && fs.existsSync(path.resolve(repo, p))) { log(`Bijwerken overgeslagen: er loopt nog een Git-bewerking (${name}). De huidige versie start.`); return {updated: false, reason: 'bezig'}; }
  }
  const fetched = await run(['fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
  if (fetched.code !== 0) { log('Bijwerken overgeslagen: GitHub is nu niet bereikbaar. De huidige versie start.'); return {updated: false, reason: 'offline'}; }
  const target = await out(['rev-parse', `refs/remotes/${remote}/${branch}`]);
  const head = await out(['rev-parse', 'HEAD']);
  const current = (await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim() || null;
  if (current === branch && head === target) { log(`Je hebt de nieuwste versie (${target.slice(0, 7)}).`); return {updated: false, reason: 'actueel', head}; }

  const status = (await out(['status', '--porcelain=v1', '--untracked-files=no'])).split('\n').filter(Boolean).map(l => l.slice(3));
  if (status.length) {
    log(`Bijwerken overgeslagen: ${status.length === 1 ? 'er is 1 lokaal gewijzigd bestand' : `er zijn ${status.length} lokaal gewijzigde bestanden`} (${status.slice(0, 5).join(', ')}${status.length > 5 ? ', …' : ''}). Die worden nooit overschreven. Bewaar of herstel ze zelf; de huidige versie start nu.`);
    return {updated: false, reason: 'lokale wijzigingen', files: status};
  }

  // A local main that has its own commits is kept as a reserve branch before main moves to GitHub main.
  const localMain = (await run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).stdout.trim();
  let reserve = null;
  if (localMain && localMain !== target && (await run(['merge-base', '--is-ancestor', localMain, target])).code !== 0) {
    reserve = `reserve/${branch}-${stamp(now())}`;
    await out(['branch', reserve, localMain]);
  }

  backup(repo, now(), keepBackups, log);
  const changed = (await out(['diff', '--name-only', head, target])).split('\n').filter(Boolean);
  const switched = await run(['switch', '--quiet', '-C', branch, target]);
  if (switched.code !== 0) {
    log(`Bijwerken niet gelukt: ${(switched.stderr || '').trim().split('\n')[0] || 'Git weigerde'}. Er is niets overschreven; de huidige versie start.`);
    return {updated: false, reason: 'geweigerd', reserve};
  }
  const commits = (await out(['rev-list', '--count', `${head}..${target}`])) || '0';
  log(`Bijgewerkt naar de nieuwste versie ${target.slice(0, 7)} (${commits} nieuwe commit(s)).${current && current !== branch ? ` Je stond op branch ‘${current}’; die blijft bewaard.` : ''}${reserve ? ` Je eerdere lokale ${branch} staat bewaard als ‘${reserve}’.` : ''}`);
  let installed = false;
  if (changed.some(f => RESTART_FILES.test(f))) {
    log('Nieuwe of gewijzigde pakketten: npm run install:apps wordt uitgevoerd…');
    installed = await install();
    if (!installed) { log('Installeren mislukte. Voer `npm run install:apps` zelf uit en kijk naar de melding.'); return {updated: true, installed: false, failed: true, from: head, to: target, reserve, previousBranch: current}; }
  }
  return {updated: true, installed, from: head, to: target, reserve, previousBranch: current};
}

function stamp(d) { return d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-'); }

/** Copies var/development to var/backups/development-<stamp>; keeps the newest `keep` automatic backups. */
export function backup(repo, date, keep, log = () => {}) {
  const source = path.join(repo, 'var', 'development');
  if (!fs.existsSync(source)) return null;
  const root = path.join(repo, 'var', 'backups'), target = path.join(root, 'development-' + stamp(date));
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  if (!fs.existsSync(target)) fs.cpSync(source, target, {recursive: true});
  const old = fs.readdirSync(root).filter(n => /^development-\d{8}-\d{4}$/.test(n)).sort();
  for (const name of old.slice(0, Math.max(0, old.length - keep))) fs.rmSync(path.join(root, name), {recursive: true, force: true});
  log(`Back-up van je gegevens: var/backups/${path.basename(target)}`);
  return target;
}
