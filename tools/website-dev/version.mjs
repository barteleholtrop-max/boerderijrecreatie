import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {insist} from './errors.mjs';
import {classifyRange} from './risk.mjs';

// Version awareness for the local development checkout. Checking only fetches the
// remote-tracking ref origin/main; it never pulls, merges, resets, stashes or
// restarts. The single mutation is a fast-forward to an exact, preflighted commit:
// automatically when autoApply is on (everything on main was approved by the owner in a
// pull request; besluit 2 november 2026, docs/GOEDKEURINGSBELEID.md), except an update that
// needs a restart (packages, database migrations, Next.js configuration): that one is applied
// by the next `./boerbart-test` start (tools/website-dev/startup-update.mjs). A blocked
// preflight (local changes, diverged main, protected paths) always stops both routes.
export const VERSION_INTERVAL = 5 * 60 * 1000;
const OFFLINE = /could not resolve host|unable to access|failed to connect|connection (timed out|refused|reset)|network is unreachable|temporary failure in name resolution|could not read from remote|operation timed out/i;
const sha = /^[a-f0-9]{40}$/;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function git(repo, args, {timeout = 30000} = {}) {
  return new Promise(resolve => {
    const env = {...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C'};
    // Never wait for a password or host-key prompt in a background check.
    if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o ConnectTimeout=15';
    // Own process group, so a timeout also stops helpers git started (remote-https,
    // credential helpers, ssh, hooks). Those can hold the output pipes open after git
    // itself is gone; without this the promise never settled and the check or update hung.
    const group = process.platform !== 'win32';
    let child;
    try { child = spawn('git', args, {cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'], detached: group}); }
    catch (error) { return resolve({code: null, stdout: '', stderr: error.message}); }
    let stdout = '', stderr = '', timedOut = false, settled = false, exitCode = null;
    const timers = [];
    const finish = result => { if (settled) return; settled = true; for (const t of timers) clearTimeout(t); resolve(result); };
    const kill = signal => { try { if (group) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* already gone */ } };
    timers.push(setTimeout(() => {
      timedOut = true; kill('SIGTERM');
      timers.push(setTimeout(() => kill('SIGKILL'), 2000));
      timers.push(setTimeout(() => finish({code: null, stdout, stderr: stderr || 'Git reageerde niet binnen de tijd.', timedOut}), 5000));
    }, timeout));
    child.stdout.on('data', chunk => { if (stdout.length < 2000000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 10000) stderr += chunk; });
    child.on('error', error => finish({code: null, stdout, stderr: error.message}));
    // Normally 'close' follows 'exit' at once; if a leftover helper keeps the pipes open, settle anyway.
    child.on('exit', code => { exitCode = code; timers.push(setTimeout(() => finish({code: timedOut ? null : exitCode, stdout, stderr, timedOut}), 1000)); });
    child.on('close', code => finish({code: timedOut ? null : code ?? exitCode, stdout, stderr, timedOut}));
  });
}

// Paths whose local content must never come from or be replaced by an update.
const PROTECTED = [/^var\//, /^apps\/[^/]+\/var\//, /(^|\/)\.env(\.local)?$/, /(^|\/)\.env\.(?!example$)[^/]+$/];
// Updates that would break servers that are running: they wait for the next start, which installs and migrates.
export const NEEDS_RESTART = /(^|\/)package(-lock)?\.json$|(^|\/)drizzle\/|(^|\/)db\/schema\.ts$|(^|\/)next\.config\.|(^|\/)instrumentation\.ts$/;
const LOCAL_DATA = ['apps/backoffice/.env.local', 'apps/planbord/.env.local', 'var', 'apps/backoffice/var', 'apps/planbord/var'];
const CONSEQUENCES = [
  [/(^|\/)package(-lock)?\.json$/, 'Afhankelijkheden wijzigen. Voer na het bijwerken zelf `npm run install:apps` uit; er wordt niets automatisch geïnstalleerd.'],
  [/(^|\/)drizzle\/|(^|\/)db\/schema\.ts$/, 'Databaseschema of migraties wijzigen. Migraties worden niet automatisch uitgevoerd; maak eerst een back-up van de `var/`-mappen en laat de stap beoordelen.'],
  [/(^|\/)\.env\.example$|^hosting\/|(^|\/)next\.config\./, 'Configuratievoorbeelden wijzigen. Je eigen `.env.local` blijft ongewijzigd; vergelijk zelf of er nieuwe instellingen nodig zijn.'],
  [/^data\/|(^|\/)snapshot\//, 'Meegeleverde exportgegevens wijzigen. Bestaande lokale databases en planbordinhoud worden niet overschreven.'],
];

export function createVersionMonitor({repo, run = (args, options) => git(repo, args, options), interval = VERSION_INTERVAL, remote = 'origin', branch = 'main', now = () => new Date(), log = () => {}, autoApply = false, historyFile = null}) {
  const remoteRef = `refs/remotes/${remote}/${branch}`;
  let state = {status: 'onbekend', message: 'Nog niet gecontroleerd.', branch: null, head: null, subject: null, committed: null, remoteHead: null, behind: null, ahead: null, lastCheck: null, lastSuccess: null};
  let running = null, updating = null, timer = null, nextCheck = null, pending = null;
  let history = [];
  try { if (historyFile) history = JSON.parse(fs.readFileSync(historyFile, 'utf8')).slice(0, 50); } catch { /* no history yet */ }
  function remember(entry) {
    history = [entry, ...history].slice(0, 50);
    if (!historyFile) return;
    // Write-then-rename, so an interrupted write never leaves a half file behind.
    try { fs.mkdirSync(path.dirname(historyFile), {recursive: true}); fs.writeFileSync(historyFile + '.tmp', JSON.stringify(history, null, 1)); fs.renameSync(historyFile + '.tmp', historyFile); }
    catch (error) { log(`Versiecontrole: geschiedenis niet bewaard (${error.message}).`); }
  }

  async function out(args, message) {
    const result = await run(args);
    insist(result.code === 0, 500, message);
    return result.stdout.trim();
  }
  async function local() {
    const head = await out(['rev-parse', '--verify', 'HEAD^{commit}'], 'Deze map is geen bruikbare Git-checkout.');
    const name = await out(['rev-parse', '--abbrev-ref', 'HEAD'], 'De huidige branch kon niet worden gelezen.');
    const [subject = '', committed = null] = (await out(['log', '-1', '--format=%s%x09%cI', head], 'De actieve commit kon niet worden gelezen.')).split('\t');
    return {head, branch: name === 'HEAD' ? null : name, subject, committed};
  }
  async function compare(head) {
    const target = await run(['rev-parse', '--verify', '--quiet', remoteRef + '^{commit}']);
    if (target.code !== 0) return {remoteHead: null, behind: null, ahead: null};
    const remoteHead = target.stdout.trim();
    const behind = Number(await out(['rev-list', '--count', `${head}..${remoteHead}`], 'Commits konden niet worden vergeleken.'));
    const ahead = Number(await out(['rev-list', '--count', `${remoteHead}..${head}`], 'Commits konden niet worden vergeleken.'));
    return {remoteHead, behind, ahead};
  }
  function describe(s) {
    const lines = [];
    if (s.behind > 0) lines.push(`${plural(s.behind, 'nieuwe commit', 'nieuwe commits')} op GitHub ${branch} (goedgekeurd en samengevoegd). Nog niet bijgewerkt in deze ontwikkelomgeving.`);
    else if (s.behind === 0) lines.push(`Je hebt alle commits van GitHub ${branch}.`);
    if (s.branch === branch) {
      if (s.ahead > 0) lines.push(`Let op: ${plural(s.ahead, 'lokale commit', 'lokale commits')} op ${branch} die niet op GitHub staan.`);
    } else {
      const where = s.branch ? `branch ‘${s.branch}’` : 'een losgekoppelde commit';
      lines.push(`Je bekijkt ${where}${s.ahead > 0 ? ` met ${plural(s.ahead, 'commit', 'commits')} die nog niet in ${branch} ${s.ahead === 1 ? 'is' : 'zijn'} samengevoegd` : ''}. Branchwerk is nog niet goedgekeurd of samengevoegd en geldt niet als geïnstalleerd.`);
    }
    return lines.join(' ');
  }
  function publish(next) {
    const changed = next.status !== state.status || next.remoteHead !== state.remoteHead || next.head !== state.head;
    state = next;
    if (changed) log(`Versiecontrole: ${label(state.status)} · ${state.branch || 'losgekoppeld'} @ ${state.head?.slice(0, 7) || '?'} · ${state.message}`);
    return snapshot();
  }

  async function check(options) {
    const result = await inspect(options);
    if (autoApply && result.status === 'updates' && !updating) await autoUpdate();
    else if (result.status !== 'updates') pending = null;
    return snapshot();
  }
  async function inspect({fetch = true} = {}) {
    if (running) return running;
    running = (async () => {
      const at = now().toISOString();
      try {
        const current = await local();
        let failure = null;
        if (fetch) {
          // Only the remote-tracking ref is updated; the working tree is untouched.
          const result = await run(['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', remote, `+refs/heads/${branch}:${remoteRef}`], {timeout: 60000});
          if (result.code !== 0) failure = result.timedOut || OFFLINE.test(result.stderr) ? 'offline' : 'fout';
        }
        const counts = await compare(current.head);
        const base = {...current, ...counts, lastCheck: at};
        if (failure === 'offline') return publish({...state, ...base, status: 'offline', message: `GitHub is niet bereikbaar. ${counts.remoteHead ? 'Laatst bekende gegevens: ' + describe(base) : ''} De website en backoffice werken gewoon door.`.trim()});
        if (failure) return publish({...state, ...base, status: 'fout', message: 'Ophalen van GitHub-gegevens mislukte (rechten of remote-instelling). Er is niets gewijzigd. Controleer `git fetch origin` zelf in de terminal.'});
        insist(counts.remoteHead, 500, `De remote-branch ${remote}/${branch} ontbreekt.`);
        return publish({...base, status: counts.behind > 0 ? 'updates' : 'actueel', message: describe(base), lastSuccess: at});
      } catch (error) {
        return publish({...state, status: 'fout', message: error.status ? error.message : 'Versiecontrole mislukte. Er is niets gewijzigd.', lastCheck: at});
      } finally { running = null; }
    })();
    return running;
  }

  async function gitPathExists(name) {
    const result = await run(['rev-parse', '--git-path', name]);
    return result.code === 0 && fs.existsSync(path.resolve(repo, result.stdout.trim()));
  }
  async function preflight() {
    const blockers = [], warnings = [], consequences = [];
    const current = await local(), counts = await compare(current.head);
    const target = counts.remoteHead;
    if (current.branch !== branch) blockers.push(`Je werkt op ${current.branch ? `branch ‘${current.branch}’` : 'een losgekoppelde commit'}. Bijwerken kan alleen op ${branch}. Rond je werk af en wissel zelf bewust met \`git switch ${branch}\`.`);
    if (!target) blockers.push(`Er is nog geen ${remote}/${branch} opgehaald. Kies eerst ‘Nu controleren’.`);
    for (const [name, text] of [['index.lock', 'Er loopt al een ander Git-proces (index.lock).'], ['MERGE_HEAD', 'Er loopt een onafgeronde merge.'], ['CHERRY_PICK_HEAD', 'Er loopt een onafgeronde cherry-pick.'], ['REVERT_HEAD', 'Er loopt een onafgeronde revert.'], ['rebase-merge', 'Er loopt een onafgeronde rebase.'], ['rebase-apply', 'Er loopt een onafgeronde rebase of am.'], ['BISECT_LOG', 'Er loopt een git bisect.']]) {
      if (await gitPathExists(name)) blockers.push(text + ' Rond dit eerst zelf af in de terminal.');
    }
    const raw = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    insist(raw.code === 0, 500, 'De werkboom kon niet worden gelezen.');
    const status = raw.stdout, entries = [], parts = status.split('\0');
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      entries.push({code: parts[i].slice(0, 2), file: parts[i].slice(3)});
      if (/^[RC]/.test(parts[i])) i++; // renames/copies carry their original path next
    }
    const tracked = entries.filter(e => e.code !== '??'), untracked = entries.filter(e => e.code === '??').map(e => e.file);
    if (tracked.length) blockers.push(`Er ${tracked.length === 1 ? 'is 1 lokaal gewijzigd bestand' : `zijn ${tracked.length} lokaal gewijzigde bestanden`} (${tracked.slice(0, 8).map(e => e.file).join(', ')}${tracked.length > 8 ? ', …' : ''}). Commit of bewaar deze eerst zelf; er wordt niets gestasht of overschreven.`);
    const stashes = (await out(['stash', 'list'], 'De stashlijst kon niet worden gelezen.')).split('\n').filter(Boolean).length;
    if (stashes) warnings.push(`Er ${stashes === 1 ? 'staat 1 stash' : `staan ${stashes} stashes`} klaar. Die blijven onaangeroerd.`);
    for (const file of LOCAL_DATA) {
      if (!fs.existsSync(path.join(repo, file))) continue;
      const ignored = await run(['check-ignore', '--quiet', file]);
      if (ignored.code !== 0) blockers.push(`Lokaal gegevens- of configuratiebestand ${file} wordt niet door .gitignore beschermd. Herstel dit eerst; bijwerken zou het kunnen raken.`);
    }
    let files = [], commits = [], fastForward = false;
    if (target && current.head !== target) {
      fastForward = (await run(['merge-base', '--is-ancestor', current.head, target])).code === 0;
      if (!fastForward) blockers.push(`Je lokale ${branch} en GitHub ${branch} zijn uiteengelopen. Een veilige fast-forward is niet mogelijk; er wordt niet automatisch samengevoegd. Vraag een ontwikkelaar om dit te beoordelen.`);
      files = (await out(['diff', '--name-only', '-z', current.head, target], 'De binnenkomende wijzigingen konden niet worden gelezen.')).split('\0').filter(Boolean);
      commits = (await out(['log', '--format=%h%x09%s', '-n', '20', `${current.head}..${target}`], 'De binnenkomende commits konden niet worden gelezen.')).split('\n').filter(Boolean).map(line => { const [id, ...subject] = line.split('\t'); return {id, subject: subject.join('\t')}; });
      const touched = files.filter(f => PROTECTED.some(p => p.test(f)));
      if (touched.length) blockers.push(`De update raakt beschermde lokale gegevens of geheimen (${touched.slice(0, 5).join(', ')}). Niet automatisch bijwerken; laat dit eerst beoordelen.`);
      const collisions = untracked.filter(f => files.includes(f));
      if (collisions.length) blockers.push(`Niet-gecommitte bestanden zouden worden overschreven (${collisions.slice(0, 5).join(', ')}). Verplaats of bewaar deze eerst zelf.`);
      for (const [pattern, text] of CONSEQUENCES) if (files.some(f => pattern.test(f))) consequences.push(text);
    } else if (target) blockers.push(`Je ${branch} is al gelijk aan GitHub ${branch}. Er is niets bij te werken.`);
    if (untracked.length && !blockers.some(b => b.startsWith('Niet-gecommitte'))) warnings.push(`${plural(untracked.length, 'niet-gevolgd bestand', 'niet-gevolgde bestanden')} in de werkboom blijven onaangeroerd.`);
    consequences.push('Ontwikkelservers die nu draaien kunnen bestandswijzigingen direct oppikken. Herstart daarna bewust: stop met Ctrl+C en start `boerbart-test` (of `node tools/start-review.mjs`) opnieuw.');
    consequences.push('Planbordinhoud, lokale SQLite-gegevens (`var/`), `.env.local` en Google-koppelingen worden niet aangeraakt.');
    const risk = target && current.head !== target ? await classifyRange(run, current.head, target) : null;
    const token = createHash('sha256').update(JSON.stringify([current.head, target, status, blockers])).digest('hex');
    return {ok: blockers.length === 0, branch: current.branch, head: current.head, target, fastForward, commits, files: files.length, restartFiles: files.filter(f => NEEDS_RESTART.test(f)), blockers, warnings, consequences, risk, token, confirmation: target ? `BIJWERKEN ${target.slice(0, 7)}` : null};
  }

  async function update(input) {
    insist(!updating, 409, 'Er loopt al een update. Wacht tot die klaar is.');
    insist(input && input.confirmed === true, 400, 'Bevestig het bijwerken expliciet.');
    updating = (async () => {
      // A background check may be fetching; wait for it (it always ends, see git()). The
      // fresh preflight below then decides, so a changed main is refused, never merged.
      if (running) await running;
      const pre = await preflight();
      insist(pre.ok, 409, 'Bijwerken is geblokkeerd: ' + pre.blockers.join(' '));
      insist(input.token === pre.token && sha.test(pre.target), 409, 'De situatie is sinds de controle gewijzigd. Voer de veiligheidscontrole opnieuw uit.');
      insist(input.confirmation === pre.confirmation, 400, `Typ ter bevestiging exact: ${pre.confirmation}`);
      // Fast-forward only, to the exact previewed commit. Git refuses rather than
      // overwriting local files; nothing is reset, stashed, installed or restarted.
      await fastForward(pre, 'handmatig');
      return {updated: true, from: pre.head, to: pre.target, consequences: pre.consequences, version: snapshot()};
    })();
    try { return await updating; } finally { updating = null; }
  }

  // Fast-forward only, to the exact preflighted commit. Git refuses rather than
  // overwriting local files; nothing is reset, stashed, installed or restarted.
  async function fastForward(pre, mode) {
    const result = await run(['merge', '--ff-only', '--no-edit', pre.target], {timeout: 120000});
    insist(result.code === 0, 409, 'Git weigerde de fast-forward. Er is niets overschreven. Controleer `git status` in de terminal.');
    const after = await local();
    insist(after.head === pre.target, 500, 'De update kon niet worden bevestigd. Controleer `git status` en `git log -1` in de terminal.');
    pending = null;
    remember({at: now().toISOString(), mode, from: pre.head, to: pre.target, subject: after.subject, commits: pre.commits, files: pre.files, risk: pre.risk?.level || null, reasons: pre.risk?.reasons || []});
    log(`Versiecontrole: ${mode === 'automatisch' ? 'automatisch bijgewerkt' : 'bijgewerkt na bevestiging'} ${pre.head.slice(0, 7)} → ${pre.target.slice(0, 7)} (${plural(pre.commits.length, 'commit', 'commits')}, ${pre.files} bestand(en)).`);
    await inspect({fetch: false});
  }

  // Updates on main are applied without asking (the owner approved them in the pull request).
  // An update that needs a restart waits for the next start; a blocked one shows why.
  // Shares the lock with manual updates.
  async function autoUpdate() {
    updating = (async () => {
      const pre = await preflight();
      if (!pre.target || pre.head === pre.target) { pending = null; return; }
      const reason = !pre.ok ? {kind: 'geblokkeerd', blockers: pre.blockers} : pre.restartFiles.length ? {kind: 'herstart', reasons: [{category: 'herstart', label: 'Wordt verwerkt bij de volgende start van boerbart-test', files: pre.restartFiles}]} : null;
      if (reason) {
        if (pending?.target !== pre.target || pending.kind !== reason.kind) log(`Versiecontrole: update naar ${pre.target.slice(0, 7)} ${reason.kind === 'herstart' ? 'wordt verwerkt bij de volgende start van boerbart-test (' + reason.reasons[0].files.slice(0, 5).join(', ') + ')' : 'geblokkeerd: ' + reason.blockers.join(' ')}`);
        pending = {target: pre.target, commits: pre.commits, ...reason};
        return;
      }
      await fastForward(pre, 'automatisch');
    })();
    try { await updating; }
    catch (error) { pending = {kind: 'geblokkeerd', blockers: [error.message]}; log(`Versiecontrole: automatisch bijwerken mislukte: ${error.message}`); }
    finally { updating = null; }
  }

  function snapshot() {
    return {...state, shortHead: state.head?.slice(0, 7) || null, shortRemoteHead: state.remoteHead?.slice(0, 7) || null, onMain: state.branch === branch, mainBranch: branch, checking: !!running, intervalMinutes: Math.round(interval / 60000), nextCheck: nextCheck && new Date(nextCheck).toISOString(), autoApply, pending, history: history.slice(0, 10)};
  }
  function schedule() { nextCheck = Date.now() + interval; }
  return {
    check: () => check(), preflight, update, snapshot,
    start() {
      if (timer) return;
      schedule(); check();
      timer = setInterval(() => { schedule(); check(); }, interval); timer.unref?.();
    },
    stop() { clearInterval(timer); timer = null; nextCheck = null; },
  };
}

export const label = status => ({actueel: 'actueel', updates: 'updates beschikbaar', offline: 'offline', fout: 'fout', onbekend: 'nog niet gecontroleerd'})[status] || status;
