import {createHash, randomUUID} from 'node:crypto';
import {insist} from './errors.mjs';

export const DEVELOPMENT_STATUSES = ['Voorgesteld', 'Goedgekeurd', 'In ontwikkeling', 'Klaar om te testen', 'Getest', 'Klaar om samen te voegen', 'Doorgevoerd'];
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const topicDigest = t => digest({id: t.id, title: t.title, status: t.status, decisionDigest: t.decisionDigest || null});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = /^[a-f0-9]{40}$/i;
const text = (value, max = 2000) => { insist(typeof value === 'string' && value.trim() && value.length <= max, 400, 'Vul de ontwikkelaar, branch en onderbouwing volledig in.'); return value.trim(); };
export const developmentStatus = p => p.development?.status || (p.approval ? 'Goedgekeurd' : 'Voorgesteld');
export function approved(p, board) {
  const topic = board.topics.find(t => t.id === p.topic?.id);
  insist(p.approval && topic && p.approval.topicSignature === topicDigest(topic), 409, 'De planbordgoedkeuring ontbreekt of is gewijzigd. Beoordeel het voorstel opnieuw.');
}
export function developmentStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS developments(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS merge_batches(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS merge_locks(proposal_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL);`);
  const get = id => { const r = db.prepare('SELECT data FROM developments WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
  const batch = id => { insist(typeof id === 'string' && uuid.test(id), 400, 'Ongeldige samenvoegcode.'); const r = db.prepare('SELECT data FROM merge_batches WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
  const locked = id => !!db.prepare('SELECT 1 FROM merge_locks WHERE proposal_id=?').get(id);
  const proposal = id => { const r = db.prepare('SELECT data FROM proposals WHERE id=?').get(id); return r ? {...JSON.parse(r.data), development: get(id)} : null; };
  function transaction(work) { db.exec('BEGIN IMMEDIATE'); try { const result = work(); db.exec('COMMIT'); return result; } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; } }
  function update(input, actor, board) {
    return transaction(() => {
      insist(input && uuid.test(input.id), 400, 'Ongeldige voorstelcode.');
      const p = proposal(input.id); insist(p && !p.deletedAt, 404, 'Voorstel niet gevonden.');
      insist(!locked(p.id), 409, 'Dit voorstel zit in een samenvoegcontrole. Rond die af of annuleer eerst.');
      insist(p.revision === input.proposalRevision && (p.development?.revision || 0) === input.revision, 409, 'Het voorstel of de ontwikkeling is gewijzigd. Vernieuw het overzicht.');
      approved(p, board);
      const old = p.development, now = new Date().toISOString();
      let next;
      if (input.action === 'assign') {
        insist(!old || old.status !== 'Doorgevoerd', 409, 'Dit voorstel is al doorgevoerd.');
        const branch = text(input.branch, 200);
        insist(branch !== 'main' && /^(?![./])(?!.*(?:\.\.|@\{|\/\/))[A-Za-z0-9_./-]+$/.test(branch) && !branch.endsWith('/') && !branch.endsWith('.lock'), 400, 'Gebruik een afzonderlijke geldige ontwikkelbranch.');
        insist(Number.isSafeInteger(input.pullRequest) && input.pullRequest > 0 && sha.test(input.headSha), 400, 'Vul een pull-requestnummer en de volledige commit-SHA in.');
        const dependencies = input.dependencies || [];
        insist(Array.isArray(dependencies) && dependencies.length <= 20 && new Set(dependencies).size === dependencies.length && dependencies.every(id => uuid.test(id) && id !== p.id && proposal(id) && !proposal(id).deletedAt), 400, 'Kies bestaande, unieke afhankelijkheden.');
        next = {developer: text(input.developer, 120), branch, pullRequest: input.pullRequest, headSha: input.headSha, dependencies, status: 'In ontwikkeling', testEvidence: null};
      } else {
        insist(old && input.action === 'advance' && input.status === DEVELOPMENT_STATUSES[DEVELOPMENT_STATUSES.indexOf(old.status) + 1] && input.status !== 'Doorgevoerd', 409, 'Doorloop de ontwikkelstatussen in volgorde. Doorgevoerd wordt uitsluitend na een bevestigde merge vastgelegd.');
        next = {...old, status: input.status};
        if (input.status === 'Getest') next.testEvidence = {headSha: old.headSha, by: actor, at: now, evidence: text(input.note)};
      }
      next = {...next, revision: (old?.revision || 0) + 1, updatedAt: now, history: [...(old?.history || []), {at: now, by: actor, action: input.action, status: next.status, note: text(input.note), previous: old ? {developer: old.developer, branch: old.branch, headSha: old.headSha, pullRequest: old.pullRequest, dependencies: old.dependencies} : null}]};
      db.prepare('INSERT INTO developments(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(p.id, JSON.stringify(next));
      return {...p, development: next};
    });
  }
  function selection(items, board) {
    insist(Array.isArray(items) && items.length > 0 && items.length <= 20 && items.every(i => i && typeof i.id === 'string' && uuid.test(i.id) && Number.isSafeInteger(i.proposalRevision) && Number.isSafeInteger(i.revision)) && new Set(items.map(i => i?.id)).size === items.length, 400, 'Selecteer 1 tot 20 unieke wijzigingen.');
    const proposals = items.map(i => {
      const p = proposal(i.id); insist(p && !p.deletedAt && p.revision === i.proposalRevision && p.development?.revision === i.revision, 409, 'De selectie is gewijzigd. Vernieuw het overzicht.');
      approved(p, board);
      insist(p.development.status === 'Klaar om samen te voegen' && p.development.testEvidence?.headSha === p.development.headSha, 409, 'Selecteer alleen geteste wijzigingen die klaar zijn om samen te voegen.'); return p;
    });
    insist(new Set(proposals.map(p => p.development.pullRequest)).size === proposals.length, 409, 'Koppel een afzonderlijk pull request aan elk voorstel.');
    const visited = new Set(), active = new Set();
    function visit(p) {
      if (visited.has(p.id)) return;
      insist(!active.has(p.id), 409, 'De afhankelijkheden vormen een kring.'); active.add(p.id);
      for (const id of p.development.dependencies) {
        const dependency = proposals.find(p => p.id === id) || proposal(id);
        insist(dependency && !dependency.deletedAt && (dependency.development?.status === 'Doorgevoerd' || proposals.some(p => p.id === id)), 409, 'Selecteer ook alle nog niet doorgevoerde afhankelijkheden.');
        if (dependency.development.status !== 'Doorgevoerd') visit(dependency);
      }
      active.delete(p.id); visited.add(p.id);
    }
    proposals.forEach(visit);
    return [...visited].map(id => proposals.find(p => p.id === id));
  }
  function reserve(items, actor, board) {
    return transaction(() => {
      const proposals = selection(items, board), id = randomUUID();
      insist(proposals.every(p => !locked(p.id)), 409, 'Een wijziging wordt al gecontroleerd.');
      const b = {id, state: 'preparing', items, proposals, by: actor, createdAt: new Date().toISOString(), boardDigest: digest(board), history: []};
      db.prepare('INSERT INTO merge_batches(id,data) VALUES(?,?)').run(id, JSON.stringify(b));
      for (const p of proposals) db.prepare('INSERT INTO merge_locks(proposal_id,batch_id) VALUES(?,?)').run(p.id, id);
      return b;
    });
  }
  function patch(id, values, expected) {
    return transaction(() => {
      const old = batch(id); insist(old, 404, 'Samenvoegcontrole niet gevonden.');
      insist(!expected || old.state === expected, 409, 'Deze samenvoegactie is al gestart.');
      const next = {...old, ...values, updatedAt: new Date().toISOString(), history: [...old.history, {at: new Date().toISOString(), state: values.state || old.state}]};
      db.prepare('UPDATE merge_batches SET data=? WHERE id=?').run(JSON.stringify(next), id);
      if (['cancelled', 'merged', 'blocked'].includes(next.state)) db.prepare('DELETE FROM merge_locks WHERE batch_id=?').run(id);
      if (next.state === 'merged') for (const p of old.proposals) {
        const d = get(p.id); d.status = 'Doorgevoerd'; d.revision++; d.history.push({at: next.updatedAt, by: next.confirmedBy, status: 'Doorgevoerd', mergeBatch: id, mergeCommit: next.mergeCommit});
        db.prepare('UPDATE developments SET data=? WHERE id=?').run(JSON.stringify(d), p.id);
      }
      return next;
    });
  }
  return {development: get, developmentProposal: proposal, developmentUpdate: update, developmentLocked: locked, developmentSelection: selection,
    mergeReserve: reserve, mergeBatch: batch, mergePatch: patch,
    mergeBatches: () => db.prepare('SELECT data FROM merge_batches ORDER BY rowid DESC LIMIT 100').all().map(r => JSON.parse(r.data))};
}
