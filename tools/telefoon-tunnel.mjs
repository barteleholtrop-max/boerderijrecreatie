// ./boerbart-test --telefoon : starts the normal environment, plus a temporary Cloudflare address for the backoffice.
// De backoffice vraagt daar altijd om inloggen (besluit eigenaar 8 november 2026: inloggen staat altijd aan). Nothing is installed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createPhoneGateway, publicTunnelOrigin} from './telefoon-tunnel-core.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const available = spawnSync('cloudflared', ['--version'], {stdio: 'ignore'});
if (available.error || available.status !== 0) throw Error('cloudflared is niet geïnstalleerd op deze Linux-computer. Installeer eerst de officiële Cloudflare Tunnel-client (zie docs/TELEFOON.md) en probeer opnieuw. Er wordt niets automatisch geïnstalleerd.');

let publicOrigin = null;
const gateway = createPhoneGateway({websitePort: 3003, getPublicOrigin: () => publicOrigin});
gateway.listen(3005, '127.0.0.1'); await once(gateway, 'listening');
const children = []; let stopping = false, started = false, output = '';
function stop() { if (stopping) return; stopping = true; clearTimeout(deadline); for (const c of children) c.kill('SIGTERM'); gateway.close(); gateway.closeAllConnections(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
function launch(name, cmd, args, extra = {}) {
  const child = spawn(cmd, args, {cwd: repo, env: {...process.env, ...extra}, stdio: name === 'Cloudflare' ? ['ignore', 'pipe', 'pipe'] : 'inherit'});
  children.push(child);
  child.on('error', e => { console.error(name + ': ' + e.message); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { console.error(name + ' is gestopt. Controleer de uitvoer hierboven.'); process.exitCode = code || 1; stop(); } });
  return child;
}
const deadline = setTimeout(() => { console.error('Cloudflare gaf binnen 60 seconden geen adres. Controleer de internetverbinding.'); process.exitCode = 1; stop(); }, 60000);
const tunnel = launch('Cloudflare', 'cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3005']);
function receive(chunk) {
  output = (output + chunk.toString()).slice(-16000);
  const origin = publicTunnelOrigin(output);
  if (!origin || started) return;
  started = true; publicOrigin = origin; clearTimeout(deadline);
  console.log(`\n────────────────────────────────────────────────────────────
Telefoonstand — backoffice op je telefoon:
  ${origin}
Open deze link op je telefoon en log in via Supabase (Google of e-mail en wachtwoord) met je Authenticator-code.
Dit adres moet dan wel als terugkeeradres in Supabase staan (zie docs/INLOGGEN-BIJ-LIVEGANG.md).
Bestelpagina voor gasten (zonder login, proefbestellingen):
  ${origin}/bestellen
Tip: open de link in Chrome op de Chromebook en kies Delen → QR-code om hem te scannen.
Ook op de Chromebook gebruik je in deze stand deze link.
Het adres verandert bij elke start. Laat deze terminal open; stoppen met Ctrl+C.
────────────────────────────────────────────────────────────\n`);
  launch('Omgeving', process.execPath, [path.join(repo, 'tools/start-review.mjs'), '--complete', '--na-bijwerken', '--backoffice-origin=' + origin]);
}
tunnel.stdout.on('data', receive); tunnel.stderr.on('data', receive);
