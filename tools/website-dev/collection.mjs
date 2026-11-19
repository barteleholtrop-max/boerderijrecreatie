import {createHash, randomUUID} from 'node:crypto';
import {insist} from './errors.mjs';

export const REPOSITORY = 'barteleholtrop-max/boer-bart-2027-website';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max) => { insist(typeof value === 'string' && value.trim() && value.length <= max, 400, 'Vul een geldige opmerking of planbordverwijzing in.'); return value.trim(); };
const topicSignature = topic => hash({id: topic.id, title: topic.title, status: topic.status, decisionDigest: topic.decisionDigest || null});
const quoted = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;').split('\n').map(line => '> ' + line).join('\n');

export function repositoryName(environment = process.env) {
  const name = environment.PROPOSALS_GITHUB_REPOSITORY || REPOSITORY;
  insist(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name), 503, 'Configureer een geldige GitHub-repository op de server.');
  return name;
}
export function proposalLink(proposal) {
  const url = new URL(proposal.pageUrl);
  url.search = ''; url.hash = ''; url.searchParams.set('voorstel', proposal.id);
  return url.href;
}
export function taskBody(proposals, repository, batchId) {
  const parts = [
    '# Boer Bart 2027 — gezamenlijke ontwikkelopdracht',
    'Voer uitsluitend de hieronder goedgekeurde voorstellen uit. Lees eerst het centrale planbord en controleer de genoemde beslissingen. Werk op een aparte Git-branch, behoud bestaande functionaliteit en gegevens, test website en backoffice en lever een pull request ter beoordeling. Wijzig of merge de hoofdbranch niet automatisch.',
    '**Dit Issue start Codex niet automatisch.** De eigenaar moet de opdracht zelf aan Codex geven. Er worden geen agent, assignees, labels of automatische uitvoering toegevoegd.',
    `Repository: https://github.com/${repository}\n\nPlanbord: https://boer-bart-planbord.sagerain4.chatgpt.site/onderwerpen\n\nDe planbordverwijzingen hieronder zijn door de eigenaar bevestigd; de live bron is niet automatisch geverifieerd. Lokale contextlinks vereisen de juiste ontwikkelomgeving en eigenaarlogin. De selectiegegevens staan ook hieronder, zodat deze opdracht zelfstandig leesbaar blijft. Bijlagen, veldwaarden en volledige pagina-inhoud worden niet meegestuurd.`,
  ];
  for (const application of ['website', 'backoffice']) {
    const items = proposals.filter(p => (p.application || 'website') === application); if (!items.length) continue;
    parts.push(`## ${application === 'website' ? 'Website' : 'Backoffice'}`);
    for (const p of items) {
      parts.push(`### Voorstel ${p.id}\n\n[Voorstel terugvinden](${proposalLink(p)}) · [Pagina/context](${new URL(p.pageUrl).origin + new URL(p.pageUrl).pathname})\n\nOnderdeel:\n${quoted(p.component)}\n\nOpmerking:\n${quoted(p.description)}\n\nPlanbordonderdeel:\n${quoted(p.topic.title + ' (' + p.topic.id + ')')}\n\nCentrale beslissing:\n${quoted(p.approval.reference)}\n\nGoedkeuring: lokale bordrevisie ${p.approval.boardRevision}; voorstelversie ${p.revision}.`);
      if (p.location) parts.push('Selectielocatie (technische gegevens, geen bedrijfsrecord):\n```json\n' + JSON.stringify(p.location, null, 2) + '\n```');
    }
  }
  if (batchId) parts.push(`<!-- boer-bart-batch:${batchId} -->`);
  const body = parts.join('\n\n');
  insist(Buffer.byteLength(body, 'utf8') <= 60000, 400, 'De opdracht is te groot voor één Issue. Selecteer minder voorstellen.');
  return body;
}

// Extends the existing proposal database, not a second proposal system.
export function collectionStore(db, development) {
  db.exec(`CREATE TABLE IF NOT EXISTS dispatch_batches(id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, selection_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dispatch_items(proposal_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES dispatch_batches(id));`);
  const raw = id => { const row = db.prepare('SELECT data FROM proposals WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; };
  const batch = id => { insist(typeof id === 'string' && uuid.test(id), 400, 'Ongeldige verzendcode.'); const row = db.prepare('SELECT data FROM dispatch_batches WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; };
  const dispatch = id => {
    const row = db.prepare('SELECT b.data FROM dispatch_items i JOIN dispatch_batches b ON b.id=i.batch_id WHERE i.proposal_id=?').get(id);
    if (!row) return null;
    const b = JSON.parse(row.data); return {batchId: b.id, state: b.state, issue: b.issue || null, error: b.error || null};
  };
  const decorate = p => p ? {...p, application: p.application || 'website', dispatch: dispatch(p.id), development: development?.development(p.id) || null} : null;
  const write = p => db.prepare('UPDATE proposals SET data=? WHERE id=?').run(JSON.stringify(p), p.id);
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  }
  function selected(items) {
    insist(Array.isArray(items) && items.length > 0 && items.length <= 20, 400, 'Selecteer tussen 1 en 20 voorstellen.');
    insist(new Set(items.map(i => i?.id)).size === items.length, 400, 'Een voorstel staat dubbel in de selectie.');
    return items.map(item => {
      insist(item && uuid.test(item.id) && Number.isSafeInteger(item.revision), 400, 'Ongeldige selectie.');
      const p = raw(item.id); insist(p && !p.deletedAt, 404, 'Een geselecteerd voorstel is verwijderd.');
      insist(p.revision === item.revision, 409, 'Een voorstel is gewijzigd. Vernieuw het overzicht en selecteer opnieuw.'); return p;
    });
  }
  function ready(proposals, board) {
    for (const p of proposals) {
      const topic = board.topics.find(t => t.id === p.topic?.id);
      insist(p.status === 'Goedgekeurd' && p.approval?.proposalRevision === p.revision && p.approval.reference, 409, 'Alleen expliciet goedgekeurde, ongewijzigde voorstellen mogen naar Codex.');
      insist(topic && p.approval.topicSignature === topicSignature(topic), 409, 'Een gekoppeld planbordonderdeel is gewijzigd. Bevestig de centrale beslissing opnieuw.');
    }
  }
  function manage(input, actor, board) {
    insist(input && uuid.test(input.requestId), 400, 'Ongeldige aanvraagcode.');
    return transaction(() => {
      const digest = hash({input, actor, scope: 'collection'});
      const prior = db.prepare('SELECT hash,result FROM requests WHERE id=?').get(input.requestId);
      if (prior) { insist(prior.hash === digest, 409, 'Aanvraagcode is al gebruikt.'); return JSON.parse(prior.result); }
      const proposals = selected(input.items), now = new Date().toISOString();
      const result = proposals.map(p => {
        insist(!development?.development(p.id) && !development?.developmentLocked(p.id), 409, 'Dit voorstel is in ontwikkeling of wordt gecontroleerd. Bewaar de goedgekeurde inhoud; maak voor wijzigingen een nieuw voorstel.');
        const sent = dispatch(p.id);
        insist(!sent || (input.action === 'delete' && sent.state === 'sent'), 409, 'Dit voorstel is gereserveerd of verzonden. De verzendhistorie blijft behouden; maak voor verdere wijzigingen een nieuw voorstel.');
        let next;
        if (input.action === 'edit') {
          insist(proposals.length === 1 && ['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd'].includes(p.status), 409, 'Dit voorstel kan niet meer worden bewerkt.');
          insist(input.privacyConfirmed === true, 400, 'Bevestig dat de opmerking geen gevoelige bedrijfsgegevens bevat.');
          const topicId = typeof input.topicId === 'string' ? input.topicId : p.topic?.id;
          const topic = board.topics.find(t => t.id === topicId);
          insist(!topicId || topic, 400, 'Kies een bestaand planbordonderdeel.');
          next = {...p, description: text(input.description, 10000), component: text(input.component, 240),
            topic: topic ? {id: topic.id, title: topic.title, boardRevision: board.revision, source: board.source} : null,
            status: p.status === 'Goedgekeurd' ? 'Klaar voor beoordeling' : p.status, approval: null};
        } else if (input.action === 'approve') {
          insist(['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd'].includes(p.status), 409, 'Dit voorstel is al in uitvoering.');
          insist(input.boardConfirmed === true, 400, 'Bevestig eerst dat de beslissing in het centrale planbord staat.');
          const reference = text(input.reference, 2000), topic = board.topics.find(t => t.id === p.topic?.id);
          insist(topic, 400, 'Koppel elk voorstel eerst aan een bestaand planbordonderdeel.');
          next = {...p, topic: {id: topic.id, title: topic.title, boardRevision: board.revision, source: board.source}, status: 'Goedgekeurd', approval: {by: actor, at: now, reference, topicId: topic.id, topicSignature: topicSignature(topic), boardRevision: board.revision, proposalRevision: p.revision + 1}};
        } else if (input.action === 'delete') next = {...p, deletedAt: now, approval: null};
        else insist(false, 400, 'Onbekende beheeractie.');
        next = {...next, revision: p.revision + 1, updatedAt: now, history: [...p.history, {by: actor, at: now, action: input.action, status: next.status, ...(input.reference ? {decision: input.reference} : {})}]};
        write(next); return decorate(next);
      });
      db.prepare('INSERT INTO requests(id,hash,result) VALUES(?,?,?)').run(input.requestId, digest, JSON.stringify(result));
      return result;
    });
  }
  function preview(items, board, repository) {
    const proposals = selected(items); ready(proposals, board);
    insist(proposals.every(p => !dispatch(p.id)), 409, 'Een voorstel is al gereserveerd of verzonden.');
    return {repository, title: `Boer Bart — ${proposals.length} goedgekeurde verbetering${proposals.length === 1 ? '' : 'en'}`, body: taskBody(proposals, repository), items: proposals.map(p => ({id: p.id, revision: p.revision}))};
  }
  function reserve(input, actor, board, repository) {
    insist(input && uuid.test(input.requestId) && input.confirmed === true, 400, 'Bevestig de inhoud voordat je naar GitHub verstuurt.');
    insist(input.repository === undefined || input.repository === repository, 409, 'De doelrepository is gewijzigd. Vernieuw het overzicht en controleer de opdracht opnieuw.');
    insist(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 20 && input.items.every(i => i && uuid.test(i.id) && Number.isSafeInteger(i.revision)), 400, 'Ongeldige selectie.');
    return transaction(() => {
      const key = hash({repository, items: input.items.map(i => ({id: i.id, revision: i.revision})).sort((a, b) => a.id.localeCompare(b.id))});
      const old = db.prepare('SELECT data,selection_key FROM dispatch_batches WHERE request_id=? OR selection_key=?').get(input.requestId, key);
      if (old) { insist(old.selection_key === key, 409, 'Aanvraagcode is al gebruikt voor een andere selectie.'); return JSON.parse(old.data); }
      const prepared = preview(input.items, board, repository), proposals = selected(input.items), id = randomUUID();
      const result = {id, repository, state: 'prepared', title: prepared.title, body: taskBody(proposals, repository, id), items: prepared.items, createdAt: new Date().toISOString(), by: actor};
      db.prepare('INSERT INTO dispatch_batches(id,request_id,selection_key,state,data) VALUES(?,?,?,?,?)').run(id, input.requestId, key, result.state, JSON.stringify(result));
      for (const p of proposals) db.prepare('INSERT INTO dispatch_items(proposal_id,batch_id) VALUES(?,?)').run(p.id, id);
      return result;
    });
  }
  function updateBatch(id, state, patch = {}, expected) {
    return transaction(() => {
      const b = batch(id); insist(b, 404, 'Verzending niet gevonden.');
      if (expected && b.state !== expected) return null;
      if (b.state === 'sent' && state !== 'sent') return b;
      const next = {...b, ...patch, state, updatedAt: new Date().toISOString()};
      db.prepare('UPDATE dispatch_batches SET state=?,data=? WHERE id=?').run(state, JSON.stringify(next), id); return next;
    });
  }
  function cancelBatch(id, actor) {
    return transaction(() => {
      const b = batch(id); insist(b && b.state === 'prepared', 409, 'Alleen een nog niet gestarte verzending kan worden geannuleerd.');
      const next = {...b, state: 'cancelled', cancelledBy: actor, updatedAt: new Date().toISOString()};
      db.prepare('UPDATE dispatch_batches SET selection_key=?,state=?,data=? WHERE id=?').run('cancelled:' + id, 'cancelled', JSON.stringify(next), id);
      db.prepare('DELETE FROM dispatch_items WHERE batch_id=?').run(id); return next;
    });
  }
  return {
    collection: () => db.prepare('SELECT data FROM proposals ORDER BY json_extract(data,\'$.updatedAt\') DESC,id').all().map(row => JSON.parse(row.data)).filter(p => !p.deletedAt).map(decorate),
    getProposal: id => decorate(raw(id)), decorate, locked: id => !!dispatch(id), manage, preview, reserve, batch, updateBatch, cancelBatch,
    validateBatch: (id, board) => { const b = batch(id); insist(b, 404, 'Verzending niet gevonden.'); ready(selected(b.items), board); },
    batches: () => db.prepare('SELECT data FROM dispatch_batches ORDER BY rowid DESC LIMIT 100').all().map(row => JSON.parse(row.data)),
  };
}
