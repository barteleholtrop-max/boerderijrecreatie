import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {HttpError, insist} from './errors.mjs';
import {validateLocation} from './location.mjs';
import {developmentStore} from './development.mjs';
import {collectionStore} from './collection.mjs';
export {HttpError, insist} from './errors.mjs';

export const STATUSES = ['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd', 'In ontwikkeling', 'Werkend en getest', 'In gebruik'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function text(value, max, required = false) {
  insist(typeof value === 'string' && value.length <= max && (!required || value.trim()), 400, 'Vul alle verplichte velden in; houd de tekst binnen de aangegeven lengte.');
  return value.trim();
}
function image(input) {
  if (!input) return null;
  const name = text(input.name, 160, true);
  insist(typeof input.data === 'string' && input.data.length <= 4194304 && /^[A-Za-z0-9+/]*={0,2}$/.test(input.data), 400, 'Ongeldige afbeelding (maximaal 3 MB).');
  const bytes = Buffer.from(input.data, 'base64');
  const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const mime = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : '';
  insist(bytes.length > 12 && bytes.length <= 3 * 1024 * 1024 && mime && input.type === mime, 400, 'Kies een PNG-, JPEG- of WebP-afbeelding van maximaal 3 MB.');
  return {name, mime, bytes};
}

// Read the actual local board without opening a writable connection or initializing it.
export function readBoard({boardDatabase, boardSnapshot}) {
  let board, revision, source;
  if (boardDatabase && fs.existsSync(boardDatabase)) {
    const db = new DatabaseSync(boardDatabase, {readOnly: true});
    try {
      const row = db.prepare('SELECT data,revision FROM boards WHERE id=?').get('main');
      insist(row, 503, 'Het lokale planbord bevat nog geen hoofdbord.');
      board = JSON.parse(row.data); revision = row.revision; source = 'Lokale planborddatabase (alleen lezen)';
    } finally { db.close(); }
  } else {
    const snapshot = JSON.parse(fs.readFileSync(boardSnapshot, 'utf8'));
    board = snapshot.board; revision = snapshot.revision; source = 'Lokale export van 29 oktober 2026';
  }
  insist(Array.isArray(board?.nodes) && Number.isSafeInteger(revision), 503, 'Planbordgegevens zijn niet beschikbaar.');
  return {
    revision, source, liveVerified: false,
    notice: 'De actuele gepubliceerde versie is niet geverifieerd. Voorstellen worden lokaal bewaard; er wordt niets naar het planbord geschreven.',
    topics: board.nodes.map(n => ({id: n.id, title: n.title, status: n.status,
      decisionDigest: createHash('sha256').update(JSON.stringify([n.body ?? '', n.notes ?? ''])).digest('hex')})),
  };
}

export function openStore(directory) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const filename = path.join(directory, 'proposals.sqlite');
  const db = new DatabaseSync(filename);
  fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, data TEXT NOT NULL, image BLOB, image_type TEXT, image_name TEXT);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL);`);
  const development = developmentStore(db);
  const collection = collectionStore(db, development);
  function list(application = 'website') { return db.prepare('SELECT data FROM proposals ORDER BY json_extract(data,\'$.updatedAt\') DESC,id').all().map(r => JSON.parse(r.data)).filter(p => !p.deletedAt && (p.application || 'website') === application).map(collection.decorate); }
  function get(id) { const row = db.prepare('SELECT data FROM proposals WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  function mutate(input, actor, board, origin, application = 'website') {
    insist(input && uuid.test(input.id) && uuid.test(input.requestId), 400, 'Ongeldige voorstel- of aanvraagcode.');
    const hash = createHash('sha256').update(JSON.stringify({input, actor, application})).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT hash,result FROM requests WHERE id=?').get(input.requestId);
      if (previous) {
        insist(previous.hash === hash, 409, 'Deze aanvraagcode is al gebruikt voor een andere wijziging.');
        db.exec('COMMIT'); return JSON.parse(previous.result);
      }
      insist(!development.development(input.id) && !development.developmentLocked(input.id), 409, 'Gebruik de centrale ontwikkelvoortgang voor dit voorstel.');
      const old = get(input.id), now = new Date().toISOString();
      insist(!old || (old.application || 'website') === application, 404, 'Voorstel niet gevonden.');
      insist(!old?.deletedAt, 404, 'Voorstel is verwijderd.');
      insist(!collection.locked(input.id) || (input.action === 'advance' && collection.getProposal(input.id)?.dispatch?.state === 'sent'), 409, 'Dit voorstel is gereserveerd of verzonden en kan niet meer worden gewijzigd.');
      insist(old ? input.revision === old.revision : input.revision === 0, 409, 'Dit voorstel is elders gewijzigd. Open het opnieuw vóór je opslaat.');
      let proposal, attachment;
      if (input.action === 'save' || input.action === 'submit') {
        insist(!old || ['Idee', 'In ontwerp', 'Klaar voor beoordeling'].includes(old.status), 409, 'Dit voorstel is al goedgekeurd. Maak voor een nieuwe wijziging een nieuw voorstel.');
        const description = text(input.description, 10000, true);
        const component = text(input.component, 240, true);
        const pageUrl = text(input.pageUrl, 2000, true);
        let url; try { url = new URL(pageUrl); } catch { throw new HttpError(400, 'Ongeldige pagina-URL.'); }
        insist(url.origin === origin && !url.username && !url.password && !url.search, 400, 'Gebruik een pagina van deze website, zonder queryparameters.');
        const location = validateLocation(input.location === undefined ? old?.location : input.location, application);
        if (location || application === 'backoffice') {
          insist(input.privacyConfirmed === true, 400, 'Bevestig dat je opmerking geen gevoelige gegevens bevat.');
          insist(location && location.route === url.pathname && !url.hash, 400, 'De selectie hoort niet bij deze pagina.');
        }
        if (application === 'backoffice') insist(!input.attachment, 400, 'Bijlagen uit de backoffice zijn uitgeschakeld om bedrijfsgegevens te beschermen.');
        const topicId = text(input.topicId ?? '', 200);
        const topic = board.topics.find(n => n.id === topicId);
        insist(!topicId || topic, 400, 'Dit planbordonderdeel is niet meer beschikbaar. Kies opnieuw.');
        const status = input.action === 'submit' ? 'Klaar voor beoordeling' : old?.status || 'Idee';
        // No approval can survive a content edit, even while waiting for review.
        attachment = image(input.attachment);
        proposal = {
          id: input.id, revision: (old?.revision || 0) + 1, description, component, pageUrl, application, location,
          privacyConfirmed: input.privacyConfirmed === true,
          topic: topic ? {id: topic.id, title: topic.title, boardRevision: board.revision, source: board.source} : null,
          status, author: old?.author || actor, createdAt: old?.createdAt || now, updatedAt: now,
          attachment: attachment ? {name: attachment.name, type: attachment.mime} : input.removeAttachment ? null : old?.attachment || null,
          sync: 'local-only',
          history: [...(old?.history || []), {at: now, by: actor, action: input.action, status}],
        };
      } else if (input.action === 'advance') {
        insist(old, 404, 'Voorstel niet gevonden.');
        const index = STATUSES.indexOf(old.status);
        insist(index >= 0 && index < STATUSES.length - 1 && input.status === STATUSES[index + 1], 400, 'Doorloop de ontwikkelstatussen in volgorde.');
        const decision = text(input.decision, 2000, true);
        if (input.status === 'Goedgekeurd') insist(old.topic && board.topics.some(t => t.id === old.topic.id), 409, 'Koppel eerst een bestaand planbordonderdeel.');
        proposal = {...old, revision: old.revision + 1, status: input.status, updatedAt: now,
          history: [...old.history, {at: now, by: actor, action: 'decision', status: input.status, decision}]};
      } else throw new HttpError(400, 'Onbekende actie.');
      db.prepare('INSERT INTO proposals(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(proposal.id, JSON.stringify(proposal));
      if (attachment) db.prepare('UPDATE proposals SET image=?,image_type=?,image_name=? WHERE id=?').run(attachment.bytes, attachment.mime, attachment.name, proposal.id);
      else if (input.removeAttachment) db.prepare('UPDATE proposals SET image=NULL,image_type=NULL,image_name=NULL WHERE id=?').run(proposal.id);
      db.prepare('INSERT INTO requests(id,hash,result) VALUES(?,?,?)').run(input.requestId, hash, JSON.stringify(proposal));
      db.exec('COMMIT'); return proposal;
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  }
  return {...collection, ...development, list, get, mutate, close: () => db.close(), attachment(id, application = 'website') {
    const proposal = get(id); if (!proposal || (proposal.application || 'website') !== application) return null;
    return db.prepare('SELECT image,image_type,image_name FROM proposals WHERE id=?').get(id);
  }};
}
