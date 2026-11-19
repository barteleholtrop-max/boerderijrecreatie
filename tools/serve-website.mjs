import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWebsiteServer} from './website-dev/server.mjs';
import {createVersionMonitor} from './website-dev/version.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devMode = process.env.WEBSITE_DEV_MODE === '1';
// Reuse the owner account without copying secrets into source or browser scripts.
if (devMode) {
  const env = path.join(repo, 'apps/backoffice/.env.local');
  if (fs.existsSync(env)) process.loadEnvFile(env);
}
const port = Number(process.env.WEBSITE_PORT || 3002);
const dataDir = path.resolve(process.env.PROPOSALS_DATA_DIR || process.env.WEBSITE_DEV_DATA_DIR || path.join(repo, 'var/website-dev'));
// Checks GitHub main at start and every 5 minutes; only the owner sees the result.
// Low-risk updates on main are fast-forwarded automatically (WEBSITE_AUTO_UPDATE=0
// turns that off); everything else waits for owner approval.
const version = devMode && process.env.WEBSITE_VERSION_CHECK !== '0' && fs.existsSync(path.join(repo, '.git'))
  ? createVersionMonitor({repo, log: line => console.log(line), autoApply: process.env.WEBSITE_AUTO_UPDATE !== '0', historyFile: path.join(dataDir, 'version-history.json')})
  : undefined;
const server = createWebsiteServer({
  root: path.join(repo, 'apps/website'), devMode,
  username: process.env.BASIC_AUTH_USER, // only the name shown as author of proposals; no password
  localNoLogin: process.env.LOCAL_NO_LOGIN, // set by boerbart-test / review:local on 127.0.0.1 only
  origin: process.env.WEBSITE_ORIGIN || 'http://localhost:' + port,
  dataDir,
  // Central source for products, opening hours and Ite by Boer Bart moments (read-only public endpoints of the backoffice).
  backofficeOrigin: process.env.BACKOFFICE_ORIGIN || 'http://127.0.0.1:3001',
  boardDatabase: path.resolve(process.env.WEBSITE_BOARD_DATABASE || path.join(repo, 'apps/planbord/var/database.sqlite')),
  boardSnapshot: path.join(repo, 'apps/planbord/snapshot/board.json'),
  version,
});
server.listen(port, process.env.WEBSITE_HOST || '127.0.0.1', () => {
  console.log(`Website op poort ${port}. Ontwikkelmodus: ${devMode ? 'aan; zonder login' : 'uit'}.`);
  version?.start();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
