import {insist} from './errors.mjs';

const issueTask = batch => `${batch.issue ? 'Gebruik dit GitHub Issue als ontwikkelopdracht: ' + batch.issue.url + '\n\n' : ''}${batch.body}\n\nStart niet automatisch: de eigenaar moet deze opdracht zelf aan Codex geven. Lever een pull request; merge of publiceer niets zonder goedkeuring.`;
export const presentBatch = batch => ({...batch, task: issueTask(batch)});

export async function dispatchBatch({store, input, actor, board, repository, github, recoverOnly = false, resume = false}) {
  if (resume) insist(input?.confirmed === true, 400, 'Bevestig de inhoud voordat je de verzending hervat.');
  let batch;
  if (recoverOnly || resume) { batch = store.batch(input?.batchId); insist(batch, 404, 'Verzending niet gevonden.'); }
  else batch = store.reserve(input, actor, board, repository);
  if (['sent', 'cancelled'].includes(batch.state)) return presentBatch(batch);
  if (batch.state !== 'prepared' || recoverOnly) {
    // Read-only reconciliation, also after a process restart. No second create.
    const issue = await github.find(batch.id, batch.createdAt);
    if (issue) batch = store.updateBatch(batch.id, 'sent', {issue, error: null, reconciledBy: actor, sentAt: new Date().toISOString()});
    return presentBatch(batch);
  }
  store.validateBatch(batch.id, board);
  try { await github.check(); }
  catch (error) { store.updateBatch(batch.id, 'prepared', {error: 'GitHub-toegang ontbreekt. Herstel de toegang en hervat deze verzending.'}, 'prepared'); throw error; }
  const claimed = store.updateBatch(batch.id, 'sending', {error: null}, 'prepared');
  if (!claimed) return presentBatch(store.batch(batch.id));
  try {
    const issue = await github.create(batch.title, batch.body);
    batch = store.updateBatch(batch.id, 'sent', {issue, error: null, sentBy: actor, sentAt: new Date().toISOString()});
  } catch (error) {
    batch = store.updateBatch(batch.id, error.definitive ? 'prepared' : 'uncertain', {error: 'Het aanmaken is niet bevestigd. Controleer GitHub voordat je opnieuw verstuurt.'}, 'sending') || store.batch(batch.id);
  }
  return presentBatch(batch);
}
