import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.versions.node.split('.')[0] !== '24') throw new Error('Gebruik Node.js 24.');
// Bijwerken bij het starten (besluit eigenaar, 2 november 2026): eerst de nieuwste goedgekeurde main, dan starten.
// Na een update start dit script opnieuw met de nieuwe code. Overslaan: --zonder-bijwerken. Niet in Codespaces.
if (!process.argv.includes('--codespaces') && !process.argv.includes('--zonder-bijwerken') && !process.argv.includes('--na-bijwerken') && fs.existsSync(path.join(repo, '.git'))) {
  const {startupUpdate} = await import('./website-dev/startup-update.mjs');
  const run = args => { const r = spawnSync('git', args, {cwd: repo, encoding: 'utf8', env: {...process.env, GIT_TERMINAL_PROMPT: '0'}, timeout: 120000}); return {code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || (r.error ? r.error.message : '')}; };
  const install = async () => spawnSync('npm', ['run', 'install:apps'], {cwd: repo, stdio: 'inherit', shell: process.platform === 'win32'}).status === 0;
  const result = await startupUpdate({repo, run, install, log: line => console.log('Bijwerken: ' + line)});
  if (result.updated && !result.failed) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--na-bijwerken'], {cwd: repo, stdio: 'inherit'});
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('exit', code => process.exit(code ?? 0));
    await new Promise(() => {});
  }
}
// Telefoonstand: start a Cloudflare quick tunnel first; it starts this script again with --backoffice-origin.
// The pending promise stops the rest of this file here while the tunnel launcher keeps running.
if (process.argv.includes('--telefoon')) { await import('./telefoon-tunnel.mjs'); await new Promise(() => {}); }
const tunnelArg = process.argv.find(a => a.startsWith('--backoffice-origin='))?.slice('--backoffice-origin='.length);
let tunnelOrigin;
if (tunnelArg) {
  const u = new URL(tunnelArg);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.trycloudflare.com') || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Ongeldig tunneladres voor de telefoonstand.');
  tunnelOrigin = u.origin;
}
const cloud = process.argv.includes('--codespaces');
const complete = process.argv.includes('--complete');
const websitePort = complete ? 3003 : 3002;
const name = process.env.CODESPACE_NAME, domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
if (cloud && (!name || !domain || !/^[a-z0-9-]+$/.test(name) || !/^[a-z0-9.-]+$/.test(domain))) throw new Error('Start review:codespaces binnen een GitHub Codespace. Gebruik op je Chromebook review:local.');
const host = cloud ? '0.0.0.0' : '127.0.0.1';
const origin = port => cloud ? `https://${name}-${port}.${domain}` : `http://localhost:${port}`;
const next = path.join(repo, 'apps/backoffice/node_modules/next/dist/bin/next');
if (!fs.existsSync(next)) throw new Error('Installeer eerst de appafhankelijkheden: npm run install:apps');
if (complete && !fs.existsSync(path.join(repo, 'apps/planbord/node_modules/next/dist/bin/next'))) throw new Error('Installeer eerst de appafhankelijkheden: npm run install:apps');
for (const port of (complete ? [3000, 3001, websitePort] : [3001, websitePort])) await new Promise((resolve, reject) => {
  const check = net.createServer(); check.once('error', () => reject(new Error(`Poort ${port} is bezet. Stop de bestaande server in zijn eigen terminal.`)));
  check.listen(port, host, () => check.close(resolve));
});
const setup = spawnSync(process.execPath, [path.join(repo, 'tools/setup.mjs')], {cwd: repo, stdio: 'inherit'});
if (setup.status !== 0) process.exit(setup.status || 1);
// Snelle backoffice (besluit eigenaar 4 november 2026): gebouwde versie in plaats van `next dev`. Alleen bouwen als de code
// veranderd is. `--ontwikkel` start de backoffice zoals vroeger in de ontwikkelstand (handig als je zelf code aanpast).
const backofficeApp = path.join(repo, 'apps/backoffice');
let backofficeBuilt = false;
if (!process.argv.includes('--ontwikkel')) {
  const {buildKey, needsBuild, markBuilt, BUILD_PATHS} = await import('./backoffice-build.mjs');
  const git = args => spawnSync('git', args, {cwd: repo, encoding: 'utf8'}).stdout || '';
  const key = buildKey(git(['rev-parse', 'HEAD']).trim() || 'onbekend', git(['status', '--porcelain=v1', '--', ...BUILD_PATHS]));
  if (needsBuild(backofficeApp, key)) {
    console.log('Backoffice wordt gebouwd voor een snelle proefomgeving. Dit gebeurt alleen na een update en duurt een paar minuten…');
    const built = spawnSync('npm', ['run', 'build'], {cwd: backofficeApp, stdio: 'inherit', shell: process.platform === 'win32', env: {...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=2048'].filter(Boolean).join(' ')}});
    if (built.status === 0) { markBuilt(backofficeApp, key); backofficeBuilt = true; }
    else console.error('Bouwen van de backoffice lukte niet (bijvoorbeeld te weinig geheugen). De backoffice start nu in de ontwikkelstand: trager, maar alles werkt.');
  } else { backofficeBuilt = true; console.log('Backoffice: gebouwde versie is actueel, snelle start.'); }
}
const children = [];
let stopping = false;
function stop(signal = 'SIGTERM') { stopping = true; for (const child of children) child.kill(signal); }
function start(name, args, cwd, extra) {
  const child = spawn(process.execPath, args, {cwd, stdio: 'inherit', env: {...process.env, ...extra, NEXT_TELEMETRY_DISABLED: '1'}});
  children.push(child);
  child.on('error', error => { console.error(`${name}: ${error.message}`); process.exitCode = 1; stop(); });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    // Say which part stopped; SIGKILL without other output usually means the Linux container ran out of memory.
    console.error(`\n${name} is onverwacht gestopt (${signal ? 'signaal ' + signal : 'exitcode ' + code}). Alle onderdelen worden gestopt.${signal === 'SIGKILL' ? ' Waarschijnlijk was het geheugen van de Linux-omgeving vol.' : ''}`);
    process.exitCode = code || 1; stop();
  });
}
// The complete Chromebook launcher keeps business test writes away from existing
// app databases. Proposal storage stays shared and is never reset or moved.
// Inloggen staat altijd aan (besluit eigenaar 8 november 2026): ook op deze computer en in de telefoonstand. De backoffice
// en het planbord vragen om inloggen via Supabase (Google of e-mail en wachtwoord) met de Authenticator-code; zet daarvoor
// SUPABASE_URL, SUPABASE_ANON_KEY en AUTH_SECRET in apps/backoffice/.env.local (en AUTH_SECRET in apps/planbord/.env.local).
// De vroegere schakelaar (`--met-login`, BOER_BART_LOGIN, LOCAL_NO_LOGIN, TUNNEL_NO_LOGIN) is vervallen.
const safe = {...(complete ? {PROPOSALS_MERGE_ENABLED: '0', WEBSITE_BOARD_DATABASE: path.join(repo, 'var/development/planbord/database.sqlite')} : {})};
// Developer-modus (knoppen „Onderdeel aanwijzen”/„Verbetering voorstellen” en het venster „Versie & updates” met bijwerken
// elke 5 minuten) staat uit sinds 4 november 2026 (besluit eigenaar: werken met schermafbeeldingen gaat sneller en beter).
// Bijwerken gebeurt bij elke start (hierboven). De code blijft bestaan; WEBSITE_DEV_MODE=1 en BACKOFFICE_DEV_MODE=1 zetten hem weer aan.
start('Website', [path.join(repo, 'tools/serve-website.mjs')], repo, {...safe, WEBSITE_HOST: host, WEBSITE_ORIGIN: origin(websitePort), WEBSITE_PORT: String(websitePort)});
// In telefoonstand the backoffice lives on the tunnel address, met login (besluit eigenaar 8 november 2026).
// The guest order page on the tunnel address may send orders to the backoffice (besluit eigenaar 2 november 2026), next to the local website.
const guestOrigins = ['http://localhost:', 'http://127.0.0.1:'].map(base => base + websitePort);
const backofficeAccess = tunnelOrigin ? {APP_ORIGIN: tunnelOrigin, BACKOFFICE_TUNNEL_ORIGIN: tunnelOrigin, PUBLIC_ORDER_ORIGINS: [...guestOrigins, tunnelOrigin].join(',')} : {APP_ORIGIN: origin(3001)};
start('Backoffice', backofficeBuilt ? [path.join(repo, 'tools/start-app.mjs')] : [next, 'dev', '--webpack', '--hostname', host, '--port', '3001'], backofficeApp, {...(backofficeBuilt ? {PORT: '3001', HOSTNAME_BIND: host} : {}), ...safe, ...(complete ? {APP_DATA_DIR: path.join(repo, 'var/development/backoffice')} : {}), ...backofficeAccess});
// Proef met het websiteontwerp van StudioFab op poort 3004 (wens eigenaar 4 november 2026): naast de eigen website, met de
// gegevens uit dezelfde backoffice. Alleen op deze computer; de eerste keer worden de onderdelen vanzelf geïnstalleerd.
const fabApp = path.join(repo, 'apps/website-fab');
let fabStarted = false;
if (complete && !cloud && !tunnelOrigin && fs.existsSync(path.join(fabApp, 'package.json'))) {
  const portFree = await new Promise(resolve => { const c = net.createServer(); c.once('error', () => resolve(false)); c.listen(3004, host, () => c.close(() => resolve(true))); });
  let ready = fs.existsSync(path.join(fabApp, 'node_modules/vite/bin/vite.js'));
  if (portFree && !ready) { console.log('Proefwebsite (StudioFab) wordt eenmalig geïnstalleerd…'); ready = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {cwd: fabApp, stdio: 'inherit', shell: process.platform === 'win32'}).status === 0; }
  if (!portFree) console.log('Poort 3004 is bezet: de proefwebsite van StudioFab start niet. Stop de andere server op 3004 als je hem hier wilt zien.');
  else if (ready) { start('Proefwebsite StudioFab', [path.join(fabApp, 'node_modules/vite/bin/vite.js'), '--host', host, '--port', '3004', '--strictPort'], fabApp, {BACKOFFICE_ORIGIN: origin(3001)}); fabStarted = true; }
  else console.log('Installeren van de proefwebsite lukte niet; de rest werkt gewoon.');
}
if (complete) start('Planbord', [path.join(repo, 'apps/planbord/node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', host, '--port', '3000'], path.join(repo, 'apps/planbord'), {...safe, APP_DATA_DIR: path.join(repo, 'var/development/planbord'), APP_ORIGIN: origin(3000), BACKOFFICE_ORIGIN: tunnelOrigin || origin(3001)});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
console.log(`Website: ${origin(websitePort)} | Backoffice: ${tunnelOrigin || origin(3001)}${complete ? ` | Planbord: ${origin(3000)}` : ''}`);
if (fabStarted) console.log(`Proefwebsite (ontwerp StudioFab): ${origin(3004)}`);
if (!cloud && tunnelOrigin) console.log('Telefoonstand: backoffice via de tunnel, met login. Bestelpagina via de tunnel zonder login. Planbord en de rest van de website alleen op deze computer.');
console.log('Inloggen staat altijd aan: via Supabase (Google of e-mail en wachtwoord) met de Authenticator-code (zie docs/INLOGGEN-BIJ-LIVEGANG.md).');
console.log('Stop alle onderdelen met Ctrl+C. Houd Codespaces-poorten privé.');
console.log('Bijwerken: bij elke start van ./boerbart-test wordt eerst de nieuwste goedgekeurde main opgehaald (zie de regels hierboven). Tijdens het draaien wordt niet meer bijgewerkt: start opnieuw voor de nieuwste versie.');
