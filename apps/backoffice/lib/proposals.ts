import fs from 'node:fs';
import path from 'node:path';
import {isOwnerRequest} from './owner';
import {openStore, readBoard, HttpError, insist} from '../../../tools/website-dev/store.mjs';
import {ownerAPI, json, parseJSON} from '../../../tools/website-dev/owner-api.mjs';
import {proposalPaths} from '../../../tools/website-dev/paths.mjs';

const shared = globalThis as typeof globalThis & {__boerBartProposals?: Map<string, ReturnType<typeof openStore>>};
export async function proposalRequest(request: Request) {
  try {
    insist(process.env.BACKOFFICE_DEV_MODE === '1', 404, 'Niet gevonden.');
    // Wie het is, bepaalt de proxy (geen eigen wachtwoord meer, besluit eigenaar 6 november 2026): alleen een eigenaar met
    // een geldige sessie (Authenticator-code). Inloggen staat altijd aan (besluit eigenaar 8 november 2026).
    const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3001').origin;
    insist(isOwnerRequest(request), 401, 'Aanmelden vereist.');
    const user = request.headers.get('x-boer-bart-account') || 'eigenaar';
    insist(new URL(origin).protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 503, 'Gebruik HTTPS buiten localhost.');
    insist(request.headers.get('host') === new URL(origin).host, 403, 'Open de backoffice via de ingestelde APP_ORIGIN.');
    if (request.method === 'POST') insist(request.headers.get('origin') === origin && request.headers.get('sec-fetch-site') !== 'cross-site', 403, 'Ongeldige herkomst.');
    const {dataDir, assetsDir, boardDatabase, boardSnapshot} = proposalPaths(process.cwd());
    const publicDir = path.resolve(process.cwd(), 'public');
    insist(dataDir !== publicDir && !dataDir.startsWith(publicDir + path.sep), 503, 'Bewaar voorstellen buiten de publieke map.');
    fs.mkdirSync(dataDir, {recursive: true, mode: 0o700});
    const realData = fs.realpathSync(dataDir), realPublic = fs.existsSync(publicDir) ? fs.realpathSync(publicDir) : publicDir;
    insist(realData !== realPublic && !realData.startsWith(realPublic + path.sep), 503, 'Bewaar voorstellen buiten de publieke map.');
    shared.__boerBartProposals ??= new Map();
    let store = shared.__boerBartProposals.get(dataDir);
    if (!store) { store = openStore(dataDir); shared.__boerBartProposals.set(dataDir, store); }
    return await ownerAPI({
      pathname: new URL(request.url).pathname.replace(/^\/api\/improvements/, '/__dev'), method: request.method,
      parse: () => parseJSON(request), store, actor: user, application: 'backoffice', origin, assetsDir,
      board: () => readBoard({boardDatabase, boardSnapshot}),
    });
  } catch (error) {
    return json({error: error instanceof HttpError ? error.message : 'De lokale voorstelopslag is niet beschikbaar.'}, error instanceof HttpError ? error.status : 500);
  }
}
