export function createCollectionUI({root, apiBase, api, locked, say, showForm, onPins, context, onDirty}) {
  const $ = selector => root.querySelector(selector), list = $('#list'), dialog = $('dialog');
  list.innerHTML = `<h3>Alle verbeteringsvoorstellen</h3><p>Website en backoffice samen. Selecteer voorstellen, bevestig de planbordgoedkeuring en verstuur ze als één opdracht.</p>
    <label class="check"><input id="choose-all" type="checkbox">Alle beschikbare voorstellen selecteren</label><p id="chosen-count" class="meta"></p>
    <div class="actions"><button id="bulk-approve" type="button">Geselecteerde goedkeuren</button><button id="to-codex" type="button" class="primary">Geselecteerde voorstellen naar Codex</button></div>
    <div id="items"></div><details><summary>Verzendgeschiedenis</summary><div id="batch-log"></div></details>`;
  const panels = document.createElement('div');
  panels.innerHTML = `<form id="collection-edit" hidden><h3>Voorstel bewerken</h3><p class="notice">De locatie blijft behouden. Een bestaande goedkeuring vervalt na bewerken; opnieuw beoordelen is nodig.</p>
    <label>Opmerking<textarea name="description" rows="5" maxlength="10000" required></textarea></label><label>Onderdeel<input name="component" maxlength="240" required></label>
    <label for="collection-topic">Gekoppeld planbordonderdeel</label><select id="collection-topic" name="topicId"></select>
    <label class="check"><input name="privacyConfirmed" type="checkbox" required>De opmerking bevat geen gevoelige bedrijfsgegevens.</label><div class="actions"><button type="submit" class="primary">Bewerking bewaren</button><button type="button" id="edit-back">Terug naar overzicht</button></div></form>
    <form id="collection-approve" hidden><h3>Planbordgoedkeuring bevestigen</h3><p id="approval-count"></p><p class="notice">Het planbord blijft leidend. Dit venster registreert een daar vastgelegde beslissing en verandert geen planbordafspraak.</p>
    <label>Verwijzing naar de planbordbeslissing<textarea id="approval-reference" rows="3" maxlength="2000" required placeholder="Bijvoorbeeld de URL of datum en omschrijving van de vastgelegde beslissing."></textarea></label>
    <label class="check"><input id="approval-confirmed" type="checkbox" required>Deze goedkeuring is al vastgelegd in het centrale planbord.</label><div class="actions"><button type="submit" class="primary">Goedkeuring vastleggen</button><button type="button" id="approve-back">Terug naar overzicht</button></div></form>
    <section id="collection-dispatch" hidden><h3>Gezamenlijke opdracht voor Codex</h3><p id="dispatch-state" class="notice"></p><a id="issue-link" target="_blank" rel="noopener" hidden>GitHub Issue openen</a>
    <label>Kopieerbare ontwikkelopdracht<textarea id="codex-command" rows="12" readonly></textarea></label><button id="copy-command" type="button">Opdracht kopiëren</button>
    <p class="notice">Een GitHub Issue start Codex niet automatisch. Kopieer de opdracht en geef die zelf aan Codex. De hoofdbranch wordt niet automatisch gewijzigd.</p>
    <label id="dispatch-confirm-label" class="check"><input id="dispatch-confirm" type="checkbox">Ik heb de opdracht gecontroleerd en geef toestemming om deze inhoud in de getoonde private GitHub-repository te plaatsen.</label>
    <div class="actions"><button id="send-issue" type="button" class="primary">GitHub Issue aanmaken</button><button id="recover-issue" type="button" hidden>Controleer GitHub-status</button><button id="cancel-issue" type="button" hidden>Reservering opheffen</button><button id="dispatch-back" type="button">Terug naar overzicht</button></div></section>`;
  dialog.append(panels);
  let records = [], batches = [], chosen = new Set(), edit = null, approvalItems = [], active = null, sending = false, pendingManage = null;
  const statusName = state => ({prepared: 'Nog niet verstuurd', sending: 'Wordt verwerkt — nog niet bevestigd', uncertain: 'Status onbekend — controleer GitHub', sent: 'Verzonden', cancelled: 'Geannuleerd'}[state] || state);
  const items = proposals => proposals.map(p => ({id: p.id, revision: p.revision}));
  const picked = () => records.filter(p => chosen.has(p.id));
  function hide() { list.hidden = true; for (const id of ['collection-edit', 'collection-approve', 'collection-dispatch']) $('#' + id).hidden = true; }
  function formView(id) { hide(); $('#form').hidden = true; $('#review').hidden = true; $('#' + id).hidden = false; }
  function actions() {
    const selected = picked(); $('#chosen-count').textContent = `${selected.length} geselecteerd · ${records.length} voorstellen · maximaal 20 per opdracht`;
    $('#bulk-approve').disabled = sending || !selected.length || selected.length > 20 || selected.some(p => p.dispatch || !p.topic || !['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd'].includes(p.status));
    $('#to-codex').disabled = sending || !selected.length || selected.length > 20 || selected.some(p => p.dispatch || p.status !== 'Goedgekeurd' || p.approval?.proposalRevision !== p.revision);
    const available = records.filter(p => !p.dispatch);
    $('#choose-all').checked = available.length > 0 && available.every(p => chosen.has(p.id));
    $('#choose-all').indeterminate = selected.length > 0 && !$('#choose-all').checked;
    $('#send-issue').disabled = sending || !$('#dispatch-confirm').checked;
  }
  const button = (name, work) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = name; el.addEventListener('click', work); return el; };
  function render() {
    $('#items').replaceChildren();
    if (!records.length) $('#items').textContent = 'Er zijn nog geen voorstellen. Begin met een nieuw idee.';
    for (const p of records) {
      const row = document.createElement('article'); row.className = 'collection-row'; row.dataset.proposalId = p.id;
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = chosen.has(p.id); check.disabled = !!p.dispatch;
      check.setAttribute('aria-label', 'Selecteer voorstel ' + p.id);
      check.addEventListener('change', () => { check.checked ? chosen.add(p.id) : chosen.delete(p.id); actions(); });
      const detail = button('', () => { showForm(p); say('Voorstel teruggevonden.'); }); detail.className = 'proposal';
      const title = document.createElement('strong'), meta = document.createElement('span'), location = document.createElement('span');
      title.textContent = p.description;
      meta.textContent = `${p.application === 'backoffice' ? 'Backoffice' : 'Website'} · ${p.status} · ${p.topic?.title || 'Nog niet gekoppeld'}${p.dispatch ? ' · ' + statusName(p.dispatch.state) : p.status === 'Goedgekeurd' && !p.approval ? ' · planbordbevestiging nodig' : ''}`;
      location.textContent = `${p.component} · ${p.location?.route || new URL(p.pageUrl).pathname}${p.location ? ' · ' + p.location.tag + ' · ' + p.location.view : ''}`;
      detail.append(title, meta, location);
      const controls = document.createElement('div'); controls.className = 'collection-controls';
      const editButton = button('Bewerken', () => beginEdit(p)); editButton.setAttribute('aria-label', 'Bewerk voorstel ' + p.id); editButton.disabled = !!p.dispatch || !['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd'].includes(p.status);
      const approve = button('Goedkeuren', () => beginApprove([p])); approve.setAttribute('aria-label', 'Keur voorstel goed ' + p.id); approve.disabled = !!p.dispatch || !p.topic || !['Idee', 'In ontwerp', 'Klaar voor beoordeling', 'Goedgekeurd'].includes(p.status);
      const remove = button('Verwijderen', () => locked(async () => {
        if (!confirm('Dit voorstel uit het overzicht verwijderen? Een bestaand GitHub Issue blijft behouden.')) return;
        await manage({action: 'delete', items: items([p])}); chosen.delete(p.id); await showList(); say('Voorstel verwijderd uit het overzicht.');
      })); remove.setAttribute('aria-label', 'Verwijder voorstel ' + p.id); remove.disabled = !!p.dispatch && p.dispatch.state !== 'sent';
      const link = document.createElement('a'); const url = new URL(p.pageUrl); url.search = ''; url.hash = ''; url.searchParams.set('voorstel', p.id); link.href = url.href; link.textContent = 'Directe link';
      controls.append(editButton, approve, remove, link);
      const page = document.createElement('a'); page.href = p.pageUrl; page.textContent = 'Pagina openen'; controls.append(page);
      if (p.location) { const details = document.createElement('details'), summary = document.createElement('summary'), data = document.createElement('pre'); summary.textContent = 'Selectielocatie'; data.textContent = JSON.stringify(p.location, null, 2); details.append(summary, data); controls.append(details); }
      if (p.dispatch?.issue) { const issue = document.createElement('a'); issue.href = p.dispatch.issue.url; issue.textContent = 'Issue #' + p.dispatch.issue.number; issue.target = '_blank'; issue.rel = 'noopener'; controls.append(issue); }
      row.append(check, detail, controls); $('#items').append(row);
    }
    $('#batch-log').replaceChildren();
    for (const b of batches) {
      const row = document.createElement('div'); row.className = 'batch-row';
      const label = document.createElement('p'); label.textContent = `${statusName(b.state)} · ${b.items.length} voorstellen · ${new Date(b.createdAt).toLocaleString('nl-NL')}`;
      row.append(label, button('Opdracht bekijken', () => showBatch(b))); $('#batch-log').append(row);
    }
    actions();
  }
  async function reload() {
    const data = await api(apiBase + '/collection'); records = data.proposals; batches = data.batches;
    chosen = new Set([...chosen].filter(id => records.some(p => p.id === id)));
    onPins(records.filter(p => p.application === context().application)); render();
  }
  async function showList() { hide(); await reload(); $('#form').hidden = true; $('#review').hidden = true; list.hidden = false; onDirty(false); }
  async function manage(payload) {
    const signature = JSON.stringify(payload);
    if (!pendingManage || pendingManage.signature !== signature) pendingManage = {signature, payload: {...payload, requestId: crypto.randomUUID()}};
    const result = await api(apiBase + '/collection/manage', pendingManage.payload); pendingManage = null; return result;
  }
  function beginEdit(p) {
    edit = p; formView('collection-edit'); $('#collection-edit').reset();
    const fields = $('#collection-edit').elements; fields.description.value = p.description; fields.component.value = p.component;
    fields.topicId.replaceChildren(new Option('Nog niet gekoppeld', ''));
    for (const topic of context().board.topics) fields.topicId.add(new Option(topic.title, topic.id)); fields.topicId.value = p.topic?.id || '';
    fields.description.focus(); onDirty(false);
  }
  function beginApprove(proposals) {
    approvalItems = items(proposals); formView('collection-approve'); $('#collection-approve').reset();
    $('#approval-count').textContent = `${proposals.length} voorstel(len) goedkeuren. Het centrale planbord wordt niet automatisch aangepast.`; onDirty(false);
  }
  function showBatch(b) {
    active = b; formView('collection-dispatch'); $('#codex-command').value = b.task || b.body;
    $('#dispatch-state').textContent = `${b.state ? statusName(b.state) : 'Controleer de opdracht vóór verzending'} · ${b.repository || context().repository}${b.error ? '. ' + b.error : ''}`;
    $('#issue-link').hidden = !b.issue; if (b.issue) $('#issue-link').href = b.issue.url;
    const canSend = !b.state || b.state === 'prepared'; $('#dispatch-confirm-label').hidden = !canSend; $('#send-issue').hidden = !canSend; $('#dispatch-confirm').checked = false;
    $('#recover-issue').hidden = !['sending', 'uncertain'].includes(b.state); $('#cancel-issue').hidden = b.state !== 'prepared'; actions(); onDirty(false);
  }
  async function openProposal(id) { showForm(await api(apiBase + '/collection/' + encodeURIComponent(id))); }
  $('#choose-all').addEventListener('change', event => { chosen = event.target.checked ? new Set(records.filter(p => !p.dispatch).map(p => p.id)) : new Set(); render(); });
  $('#bulk-approve').addEventListener('click', () => beginApprove(picked()));
  $('#to-codex').addEventListener('click', () => locked(async () => { const preview = await api(apiBase + '/collection/preview', {items: items(picked())}); showBatch({...preview, requestId: crypto.randomUUID()}); }));
  $('#collection-edit').addEventListener('input', () => onDirty(true));
  $('#collection-approve').addEventListener('input', () => onDirty(true));
  $('#collection-edit').addEventListener('submit', event => { event.preventDefault(); locked(async () => {
    const fields = event.target.elements;
    await manage({action: 'edit', items: items([edit]), description: fields.description.value, component: fields.component.value, topicId: fields.topicId.value, privacyConfirmed: fields.privacyConfirmed.checked});
    onDirty(false); await showList(); say('Bewerking bewaard. Een eerdere goedkeuring is ingetrokken.');
  }); });
  $('#collection-approve').addEventListener('submit', event => { event.preventDefault(); locked(async () => {
    await manage({action: 'approve', items: approvalItems, reference: $('#approval-reference').value, boardConfirmed: $('#approval-confirmed').checked});
    onDirty(false); await showList(); say('Planbordgoedkeuring vastgelegd. Je kunt de geselecteerde voorstellen nu gezamenlijk versturen.');
  }); });
  for (const id of ['edit-back', 'approve-back', 'dispatch-back']) $('#' + id).addEventListener('click', () => {
    if (id === 'dispatch-back' || confirm('Terug naar het overzicht? Bewaar eventuele wijzigingen eerst.')) { onDirty(false); locked(showList); }
  });
  $('#dispatch-confirm').addEventListener('change', actions);
  $('#send-issue').addEventListener('click', () => locked(async () => {
    if (!$('#dispatch-confirm').checked) return;
    $('#dispatch-state').textContent = 'GitHub Issue wordt aangemaakt… Een Issue start Codex niet automatisch.';
    try {
      const result = active.id
        ? await api(apiBase + '/collection/retry', {batchId: active.id, confirmed: true})
        : await api(apiBase + '/collection/send', {items: active.items, requestId: active.requestId, repository: active.repository, confirmed: true});
      await reload(); showBatch(result);
      say(result.state === 'sent' ? 'GitHub Issue aangemaakt. Kopieer de opdracht en geef die zelf aan Codex.' : 'Het versturen is nog niet bevestigd. Gebruik de verzendgeschiedenis om de status te controleren.', result.state !== 'sent');
    } catch (error) {
      await reload();
      const saved = batches.find(b => b.state !== 'cancelled' && (b.id === active.id || (b.items.length === active.items.length && b.items.every(i => active.items.some(p => p.id === i.id && p.revision === i.revision)))));
      if (saved) showBatch(saved); else $('#dispatch-state').textContent = error.message;
      throw error;
    }
  }));
  $('#recover-issue').addEventListener('click', () => locked(async () => { const b = await api(apiBase + '/collection/recover', {batchId: active.id}); await reload(); showBatch(b); }));
  $('#cancel-issue').addEventListener('click', () => locked(async () => {
    if (!confirm('De verzending is nog niet gestart. De reservering opheffen?')) return;
    await api(apiBase + '/collection/cancel', {batchId: active.id}); await showList(); say('Reservering opgeheven.');
  }));
  $('#copy-command').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#codex-command').value); say('Opdracht gekopieerd. Plak deze zelf bij Codex.'); }
    catch { $('#codex-command').focus(); $('#codex-command').select(); say('De opdracht is geselecteerd. Druk op Ctrl+C om te kopiëren.'); }
  });
  return {showList, hide, openProposal, setBusy(value) { sending = value; panels.inert = value; list.inert = value; actions(); }};
}
