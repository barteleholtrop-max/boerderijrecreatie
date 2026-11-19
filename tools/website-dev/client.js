(async () => {
  if (document.getElementById('bb-development')) return;
  const apiBase = new URL(document.currentScript.src).pathname.replace(/\/client\.js$/, '');
  const {createSelection} = await import(apiBase + '/selector.js');
  const {createDevelopmentUI} = await import(apiBase + '/development-client.js');
  const {createCollectionUI} = await import(apiBase + '/collection-client.js');
  const {createVersionUI} = await import(apiBase + '/version-client.js');
  const host = document.createElement('div');
  host.id = 'bb-development';
  const ui = host.attachShadow({mode: 'open'});
  ui.innerHTML = `<link rel="stylesheet" href="${apiBase}/client.css">
    <button id="launch" class="launch">＋ Verbetering voorstellen</button><button id="select-launch" class="select-launch">Onderdeel aanwijzen</button>
    <dialog aria-labelledby="bb-title"><header><div><span class="eyebrow">BOER BART · ONTWIKKELATELIER</span><h2 id="bb-title">Een idee voor de boerderij</h2></div><button id="close" class="quiet" aria-label="Venster sluiten">×</button></header>
      <nav aria-label="Voorstellen"><button id="new-tab" type="button">Nieuw voorstel</button><button id="select" type="button">Onderdeel selecteren</button><button id="list-tab" type="button">Voorstellen terugvinden</button><button id="development-tab" type="button">Ontwikkelingen & dagelijkse goedkeuring</button><button id="version-tab" type="button" hidden>Versie & updates</button><a href="${apiBase}/export" download>Exporteren</a></nav>
      <p id="source" class="notice"></p><p id="message" role="status" aria-live="polite"></p>
      <div id="list" hidden><h3>Lokale voorstellen</h3><p>Deze lijst bevat voorstellen, geen nieuwe planbordafspraken.</p><div id="items"></div></div>
      <form id="form"><p id="meta" class="meta"></p><p id="location-meta" class="notice" hidden></p>
        <label>Wat wil je verbeteren?<textarea name="description" rows="5" maxlength="10000" required placeholder="Vertel wat je ziet en wat je graag anders zou willen."></textarea></label>
        <label>Pagina-URL<input name="pageUrl" type="url" maxlength="2000" required></label>
        <label>Pagina of onderdeel<input name="component" maxlength="240" required></label>
        <label for="bb-topic">Planbordonderdeel</label><select id="bb-topic" name="topicId"><option value="">Nog niet gekoppeld</option></select>
        <p class="hint">Controleer het gekozen onderdeel. Een verwijzing verandert geen afspraak op het planbord.</p>
        <div id="upload"><label>Afbeelding of screenshot (optioneel)<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <p class="hint">PNG, JPEG of WebP, maximaal 3 MB. Voeg alleen beelden toe die hier bewaard mogen worden.</p>
        <div id="attachment" hidden><img alt="Bijlage bij het voorstel"><a target="_blank" rel="noopener">Afbeelding openen</a><label class="check"><input name="removeAttachment" type="checkbox">Bestaande bijlage verwijderen</label></div>
        </div><label id="privacy" class="check" hidden><input name="privacyConfirmed" type="checkbox">Mijn opmerking bevat geen persoonsgegevens, bedragen, tokens of bedrijfsgeheimen.</label><p class="hint">Er worden geen paginateksten, veldwaarden, HTML of screenshots automatisch meegestuurd.</p><div class="actions"><button id="save" type="submit">Concept bewaren</button><button id="submit" type="button" class="primary">Indienen voor beoordeling</button></div>
        <p class="hint">Indienen geeft de status ‘Klaar voor beoordeling’. Er wordt geen code uitgevoerd of bestaande functionaliteit gewijzigd.</p>
      </form>
      <section id="review" hidden><h3>Beoordeling en voortgang</h3><ol id="statuses"></ol><p id="decision-note" class="notice">Leg de leidende beslissing ook op het planbord vast. Deze lokale registratie synchroniseert niet met het planbord en start geen AI.</p><label>Beslissing, onderbouwing of testbewijs<textarea id="decision" rows="3" maxlength="2000"></textarea></label><button id="advance" class="primary" type="button"></button><button id="handoff" type="button">Opdracht voor Codex / Claude downloaden</button><details><summary>Historie</summary><ol id="history"></ol></details></section>
    </dialog>`;
  document.body.append(host);
  const $ = selector => ui.querySelector(selector), dialog = $('dialog'), form = $('#form');
  let collection;
  let context, selected = null, capturedCard, dirty = false, busy = false, pending = null;
  const fields = form.elements;
  const say = (text, error = false) => { $('#message').textContent = text; $('#message').className = error ? 'error' : 'success'; };
  async function api(url, data) {
    const response = await fetch(url, data ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Opslaan lukt nu niet.');
    return result;
  }
  const kind = tag => ({button:'Knop', a:'Link', img:'Afbeelding', input:'Invoerveld', textarea:'Tekstveld', select:'Keuzeveld'}[tag] || 'Onderdeel');
  function contextFromPage() {
    if (context.application === 'backoffice') return {component: 'Backoffice', topicId: '', pageUrl: location.origin + location.pathname};
    const card = capturedCard?.isConnected ? capturedCard : document.querySelector('.design-card.chosen') || document.querySelector('.design-card');
    const index = card ? Number(card.id.replace('design-', '')) : -1;
    // The existing prototype switches screens without navigation. Read its actual
    // screen state; do not infer a section from arbitrary CSS selectors or input values.
    const state = typeof states !== 'undefined' && index >= 0 ? states[index] : null;
    const names = {home: 'Welkom', plan: 'Bezoek plannen', menu: 'Bestellen', here: 'Ik ben er al', shop: 'Winkel', info: 'Praktisch'};
    const activity = ['Speelboerderij', 'Ite by Boerderijrecreatie', 'Boerderijwinkel', 'Groepen & feesten', 'Zingeving & ontmoeting'].includes(state?.activity) ? state.activity : '';
    const component = state ? [names[state.page] || 'Website', state.sheet && activity].filter(Boolean).join(' · ') : 'Website';
    const topic = ['plan', 'playbook'].includes(state?.sheet) && state.activity === 'Speelboerderij' ? context.board.topics.find(t => t.title === 'Reserveren Speelboerderij') : null;
    return {component, topicId: topic?.id || '', pageUrl: location.origin + location.pathname};
  }
  document.addEventListener('click', event => { const card = event.target.closest?.('.design-card'); if (card) capturedCard = card; }, true);
  const discard = () => !dirty || confirm('Je hebt wijzigingen die nog niet zijn bewaard. Wil je doorgaan zonder deze wijzigingen?');
  function showForm(proposal, anchor = null) {
    ui.querySelector('#development-panel')?.setAttribute('hidden', ''); ui.querySelector('#version-panel')?.setAttribute('hidden', '');
    collection?.hide();
    selected = proposal || {id: crypto.randomUUID(), revision: 0, ...contextFromPage(), description: '', status: 'Idee', topic: null, location: anchor};
    if (!proposal && anchor) { selected.pageUrl = location.origin + anchor.route; selected.component += ' · ' + kind(anchor.tag); }
    dirty = false; pending = null;
    form.reset();
    fields.description.value = selected.description;
    fields.component.value = selected.component;
    fields.pageUrl.value = selected.pageUrl;
    fields.pageUrl.readOnly = !!selected.location || context.application === 'backoffice';
    fields.privacyConfirmed.required = !!selected.location || context.application === 'backoffice';
    fields.privacyConfirmed.checked = !!selected.privacyConfirmed;
    $('#privacy').hidden = !fields.privacyConfirmed.required;
    $('#upload').hidden = context.application === 'backoffice';
    $('#location-meta').hidden = !selected.location;
    if (selected.location) $('#location-meta').textContent = kind(selected.location.tag) + (selection.show(selected.location) ? ' geselecteerd. Alleen de technische locatie wordt opgeslagen.' : ' — deze locatie is nu niet zichtbaar of gewijzigd. Open dezelfde schermweergave of selecteer opnieuw.');
    else selection.clear();
    const topicId = proposal ? proposal.topic?.id || '' : selected.topicId;
    if (topicId && ![...fields.topicId.options].some(o => o.value === topicId)) {
      fields.topicId.add(new Option('Niet meer beschikbaar — kies opnieuw', topicId));
    }
    fields.topicId.value = topicId;
    $('#list').hidden = true; form.hidden = false;
    $('#review').hidden = !proposal;
    $('#meta').textContent = proposal ? `${proposal.deletedAt ? 'Verwijderd · ' : ''}${proposal.status} · ${proposal.application || 'website'} · door ${proposal.author} · ${new Date(proposal.createdAt).toLocaleString('nl-NL')} · versie ${proposal.revision}` : 'Nieuw idee · alleen lokaal';
    const editable = !selected.deletedAt && !selected.dispatch && ['Idee', 'In ontwerp', 'Klaar voor beoordeling'].includes(selected.status);
    for (const field of form.querySelectorAll('input,textarea,select,button')) field.disabled = !editable;
    $('#save').textContent = proposal ? 'Wijzigingen bewaren' : 'Concept bewaren';
    $('#attachment').hidden = !proposal?.attachment;
    if (proposal?.attachment) {
      const url = apiBase + '/attachments/' + proposal.id;
      $('#attachment img').src = url; $('#attachment a').href = url;
    } else { $('#attachment img').removeAttribute('src'); $('#attachment a').removeAttribute('href'); }
    $('#statuses').replaceChildren();
    for (const status of context.statuses) {
      const li = document.createElement('li'); li.textContent = status;
      if (status === selected.status) { li.className = 'current'; li.setAttribute('aria-current', 'step'); }
      $('#statuses').append(li);
    }
    $('#history').replaceChildren();
    for (const item of proposal?.history || []) {
      const li = document.createElement('li');
      li.textContent = `${new Date(item.at).toLocaleString('nl-NL')} · ${item.by} · ${item.status}${item.decision ? ' — ' + item.decision : ''}`;
      $('#history').append(li);
    }
    const next = context.statuses[context.statuses.indexOf(selected.status) + 1];
    $('#advance').hidden = !next; $('#advance').textContent = next ? 'Vastleggen: ' + next : '';
    $('#advance').disabled = !!selected.deletedAt || !!(selected.dispatch && selected.dispatch.state !== 'sent');
    $('#decision').value = ''; $('#decision').disabled = !next;
  }
  async function refreshContext() {
    context = await api(apiBase + '/context');
    $('#source').textContent = `${context.board.source} · revisie ${context.board.revision}. ${context.board.notice}`;
    fields.topicId.replaceChildren(new Option('Nog niet gekoppeld', ''));
    for (const topic of [...context.board.topics].sort((a, b) => a.title.localeCompare(b.title, 'nl'))) fields.topicId.add(new Option(topic.title + ' · ' + topic.status, topic.id));
  }
  async function showList() { ui.querySelector('#development-panel')?.setAttribute('hidden', ''); ui.querySelector('#version-panel')?.setAttribute('hidden', ''); await collection.showList(); dirty = false; }
  async function locked(work) {
    if (busy) return;
    busy = true; dialog.setAttribute('aria-busy', 'true');
    form.inert = true; $('#review').inert = true; collection?.setBusy(true);
    const disabled = [...ui.querySelectorAll('button')].map(button => [button, button.disabled]);
    for (const [button] of disabled) button.disabled = true;
    try { await work(); } catch (error) { say(error.message || 'Dit lukt nu niet. Je invoer blijft bewaard in dit venster.', true); }
    finally {
      busy = false; dialog.removeAttribute('aria-busy');
      form.inert = false; $('#review').inert = false;
      for (const [button, wasDisabled] of disabled) button.disabled = wasDisabled;
      $('#new-tab').disabled = !context; $('#list-tab').disabled = !context;
      collection?.setBusy(false);
      $('#advance').disabled = !!selected?.deletedAt || !!(selected?.dispatch && selected.dispatch.state !== 'sent');
      // A successful mutation may have moved the item into a read-only status.
      if (selected && !['Idee', 'In ontwerp', 'Klaar voor beoordeling'].includes(selected.status)) for (const button of form.querySelectorAll('button')) button.disabled = true;
    }
  }
  async function attachment() {
    const file = fields.image.files[0]; if (!file) return null;
    if (file.size > 3 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Kies PNG, JPEG of WebP, maximaal 3 MB.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Afbeelding lezen lukt niet.')); reader.readAsDataURL(file);
    });
    return {name: file.name, type: file.type, data};
  }
  async function mutate(data) {
    const signature = JSON.stringify(data);
    if (!pending || pending.signature !== signature) pending = {signature, data: {...data, requestId: crypto.randomUUID()}};
    const result = await api(apiBase + '/proposals', pending.data);
    pending = null; return result;
  }
  async function save(action) {
    if (!form.reportValidity()) return;
    await locked(async () => {
      const result = await mutate({id: selected.id, revision: selected.revision, action,
        description: fields.description.value, component: fields.component.value, pageUrl: fields.pageUrl.value,
        topicId: fields.topicId.value, location: selected.location || null, privacyConfirmed: fields.privacyConfirmed.checked, attachment: context.application === 'backoffice' ? null : await attachment(), removeAttachment: fields.removeAttachment.checked});
      showForm(result);
      selection.setProposals((await api(apiBase + '/proposals')).proposals);
      say(action === 'submit' ? 'Ingediend voor beoordeling. Het voorstel staat in de lokale lijst; het planbord is niet gewijzigd.' : 'Bewaard. Je vindt dit voorstel terug bij ‘Voorstellen terugvinden’.');
    });
  }
  const selection = createSelection({host, root: ui, application: apiBase === '/__dev' ? 'website' : 'backoffice',
    onSelect(anchor) { if (!dialog.open) dialog.showModal(); showForm(null, anchor); say('Schrijf je opmerking bij het gemarkeerde onderdeel.'); fields.description.focus(); },
    onOpen(proposal) { if (!discard()) return; if (!dialog.open) dialog.showModal(); showForm(proposal); say('Opmerking bij dit onderdeel.'); }
  });
  collection = createCollectionUI({root: ui, apiBase, api, locked, say, showForm,
    onPins: proposals => selection.setProposals(proposals), context: () => context, onDirty: value => { dirty = value; }});
  async function beginSelection() {
    if (busy || !discard()) return;
    try { await refreshContext(); dialog.close(); dirty = false; selection.start(); }
    catch (error) { if (!dialog.open) dialog.showModal(); say(error.message, true); }
  }
  $('#select').addEventListener('click', beginSelection);
  $('#select-launch').addEventListener('click', beginSelection);
  $('#launch').addEventListener('click', async () => {
    if (apiBase !== '/__dev') {
      dialog.showModal();
      await locked(async () => { await refreshContext(); await showList(); say('Bekijk een opmerking of kies Onderdeel selecteren voor een nieuw voorstel.'); });
      return;
    }
    dialog.showModal(); say('Planbordonderdelen laden…');
    form.hidden = true; $('#review').hidden = true; $('#list').hidden = true;
    await locked(async () => { await refreshContext(); showForm(); say(''); fields.description.focus(); });
  });
  $('#close').addEventListener('click', () => { if (!busy && discard()) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy || !discard()) event.preventDefault(); });
  $('#new-tab').addEventListener('click', () => { if (apiBase !== '/__dev') beginSelection(); else if (discard()) { showForm(); say(''); } });
  $('#list-tab').addEventListener('click', () => { if (discard()) locked(showList); });
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  form.addEventListener('submit', event => { event.preventDefault(); save('save'); });
  $('#submit').addEventListener('click', () => save('submit'));
  $('#advance').addEventListener('click', () => locked(async () => {
    if (dirty) throw new Error('Bewaar eerst je wijzigingen.');
    const status = context.statuses[context.statuses.indexOf(selected.status) + 1], decision = $('#decision').value.trim();
    if (!decision) { $('#decision').focus(); throw new Error('Beschrijf eerst de beslissing of het testbewijs.'); }
    if (!confirm(`Wil je de lokale status vastleggen als ‘${status}’? Leg de leidende beslissing ook op het planbord vast. Er wordt geen code uitgevoerd.`)) return;
    showForm(await mutate({id: selected.id, revision: selected.revision, action: 'advance', status, decision}));
    say('Beslissing vastgelegd. Het planbord en de website zijn niet gewijzigd.');
  }));
  $('#handoff').addEventListener('click', () => {
    const p = selected;
    const content = `# Websitevoorstel ${p.id}\n\nStatus: ${p.status}\nPagina: ${p.pageUrl}\nOnderdeel: ${p.component}\nPlanbord: ${p.topic ? p.topic.title + ' (' + p.topic.id + '), lokale revisie ' + p.topic.boardRevision : 'Nog niet gekoppeld'}\nAuteuraccount: ${p.author}\n\n## Voorstel\n${p.description}\n\n## Beslissingen\n${p.history.map(h => h.at + ' · ' + h.by + ' · ' + h.status + (h.decision ? ': ' + h.decision : '')).join('\n')}\n\n## Werkwijze voor Codex en Claude Code\nLees eerst het actuele centrale planbord. Deze lokale status is geen synchronisatie met het planbord. Controleer eigenaarstoestemming vóór je goedgekeurde onderdelen wijzigt. Werk op een aparte Git-branch, behoud bestaande functies en gegevens, voeg relevante tests toe en lever een pull request ter beoordeling. Geen automatische uitvoering, merge of publicatie.\n${p.attachment ? '\nBijlage: open de afbeelding in de aangemelde ontwikkelmodus en voeg deze afzonderlijk toe.\n' : ''}`;
    const url = URL.createObjectURL(new Blob([content], {type: 'text/markdown;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `voorstel-${p.id}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  try { await refreshContext(); selection.setProposals((await api(apiBase + '/proposals')).proposals);
    const proposalId = new URL(location.href).searchParams.get('voorstel');
    if (proposalId && /^[a-f0-9-]{36}$/i.test(proposalId)) {
      try { await collection.openProposal(proposalId); dialog.showModal(); }
      catch (error) { dialog.showModal(); form.hidden = true; $('#review').hidden = true; say(error.message, true); }
    }
  } catch { /* Opening the dialog offers an explicit retry. */ }
  const developmentUI = createDevelopmentUI({root: ui, apiBase, api, locked, say});
  $('#development-tab').addEventListener('click', () => { if (discard()) locked(() => developmentUI.show()); });
  // Version status belongs to the local website development server only.
  if (apiBase === '/__dev') {
    const versionUI = createVersionUI({root: ui, apiBase, api, locked, say});
    versionUI.ready.then(available => { $('#version-tab').hidden = !available; });
    $('#version-tab').addEventListener('click', () => { if (discard()) locked(() => versionUI.show()); });
    $('#development-tab').addEventListener('click', () => versionUI.hide());
  }
  $('#list-tab').addEventListener('click', () => { ui.querySelector('#development-panel').hidden = true; });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
})();
