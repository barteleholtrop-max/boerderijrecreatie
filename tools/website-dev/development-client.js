export function createDevelopmentUI({root, apiBase, api, locked, say}) {
  const panel = document.createElement('section'); panel.id = 'development-panel'; panel.hidden = true;
  panel.innerHTML = `<h3>Centraal verbeteringenoverzicht</h3><p>Planbordafspraken blijven leidend. Doorvoeren betekent samenvoegen in GitHub; er wordt geen live website gepubliceerd.</p>
    <nav><a href="${apiBase}/development/export/codex" download>Export voor Codex</a><a href="${apiBase}/development/export/claude" download>Export voor Claude Code</a></nav>
    <label>Statusfilter<select id="development-filter"><option value="">Alle ontwikkelingen</option><option value="ready">Klaar om door te voeren</option></select></label>
    <div id="development-list"></div><p id="development-count" role="status"></p><button id="development-prepare" type="button">Geselecteerde wijzigingen controleren</button>
    <form id="development-form" hidden><h3>Ontwikkelaar en voortgang</h3><p id="development-component"></p>
      <label>Ontwikkelaar<input name="developer" maxlength="120" required></label><label>GitHub-branch<input name="branch" maxlength="200" required></label>
      <label>Pull-requestnummer<input name="pullRequest" type="number" min="1" step="1" required></label><label>Commit-SHA (40 tekens)<input name="headSha" pattern="[a-fA-F0-9]{40}" required></label>
      <label>Afhankelijkheden (voorstel-ID’s, gescheiden door komma’s)<textarea name="dependencies" rows="2"></textarea></label>
      <label>Onderbouwing / testbewijs<textarea name="note" maxlength="2000" required rows="3"></textarea></label>
      <button type="submit">Toewijzing bewaren / opnieuw testen</button><button id="development-advance" type="button"></button><button id="development-back" type="button">Sluiten</button>
      <details><summary>Ontwikkelgeschiedenis</summary><pre id="development-history"></pre></details>
    </form><h3>Dagelijkse controles</h3><p id="development-enabled" class="notice"></p><div id="development-batches"></div>`;
  root.querySelector('dialog').append(panel);
  const $ = s => panel.querySelector(s), form = $('#development-form');
  let data, editing, selected = new Set();
  const button = (label, work) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.onclick = () => locked(work); return el; };
  const post = (action, input) => api(`${apiBase}/development/${action}`, input);
  function edit(p) {
    editing = p; form.reset(); form.hidden = false;
    const d = p.development || {};
    for (const key of ['developer','branch','pullRequest','headSha']) form.elements[key].value = d[key] || '';
    form.elements.dependencies.value = (d.dependencies || []).join(', ');
    $('#development-component').textContent = `${p.component} · ${p.developmentStatus}`;
    const next = data.statuses[data.statuses.indexOf(p.developmentStatus) + 1];
    $('#development-advance').hidden = !d.status || !next || next === 'Doorgevoerd';
    $('#development-advance').textContent = 'Vastleggen: ' + (next || '');
    $('#development-history').textContent = JSON.stringify(d.history || [], null, 2);
  }
  function render() {
    $('#development-list').replaceChildren();
    const filter = $('#development-filter').value;
    for (const p of data.proposals.filter(p => !filter || (filter === 'ready' ? p.developmentStatus === 'Klaar om samen te voegen' : p.developmentStatus === filter))) {
      const row = document.createElement('article'); row.className = 'proposal';
      const title = document.createElement('strong'); title.textContent = `${p.application} · ${p.component}`;
      const text = document.createElement('p'); text.textContent = p.description;
      const meta = document.createElement('p'); meta.textContent = `${p.developmentStatus} · ${p.development?.developer || 'Nog niet toegewezen'} · ${new Date(p.createdAt).toLocaleString('nl-NL')} · ${p.id}`;
      const page = document.createElement('a'); page.href = p.pageUrl; page.textContent = 'Pagina openen'; page.target = '_blank'; page.rel = 'noopener';
      const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('aria-label', 'Selecteer ' + p.component);
      check.disabled = p.developmentStatus !== 'Klaar om samen te voegen'; check.checked = selected.has(p.id);
      check.onchange = () => { check.checked ? selected.add(p.id) : selected.delete(p.id); count(); };
      row.append(check, title, text, meta, page);
      if (p.development) { const link = document.createElement('a'); link.href = `https://github.com/${data.repository}/pull/${p.development.pullRequest}`; link.textContent = ' · Pull request #' + p.development.pullRequest; link.target = '_blank'; link.rel = 'noopener'; row.append(link); }
      row.append(button('Ontwikkelaar / voortgang', async () => edit(p))); $('#development-list').append(row);
    }
    count(); $('#development-batches').replaceChildren();
    for (const b of data.batches) {
      const row = document.createElement('article'); row.className = 'proposal';
      const title = document.createElement('strong'); title.textContent = `${b.proposals.length} wijzigingen · ${b.state} · ${b.id}`; row.append(title);
      const details = document.createElement('p'); details.textContent = b.proposals.map(p => `${p.component} (#${p.development.pullRequest}, ${p.development.headSha.slice(0,8)})`).join('; '); row.append(details);
      if (b.error) { const error = document.createElement('p'); error.textContent = b.error; row.append(error); }
      if (b.candidate) { const link = document.createElement('a'); link.href = b.candidate.url; link.textContent = 'Gecombineerde pull request bekijken en beoordelen'; link.target = '_blank'; link.rel = 'noopener'; row.append(link); }
      if (['testing','ready'].includes(b.state)) row.append(button('Tests en voorwaarden opnieuw controleren', async () => { await post('check', {batchId: b.id}); await refresh(); say('Gecombineerde versie gecontroleerd. De eigenaar kan nu expliciet bevestigen.'); }));
      if (b.state === 'ready') row.append(button('Goedgekeurde wijzigingen samenvoegen', async () => {
        if (!confirm(`Deze ${b.proposals.length} geteste wijzigingen samenvoegen naar main?\n${details.textContent}\nEr wordt geen live website gepubliceerd.`)) return;
        const confirmation = prompt(`Typ ter bevestiging: SAMENVOEGEN ${b.id}`);
        if (confirmation !== `SAMENVOEGEN ${b.id}`) return;
        const result = await post('confirm', {batchId: b.id, confirmed: true, confirmation}); await refresh(); say(result.state === 'merged' ? 'Samenvoeging bevestigd door GitHub. Geen publicatie uitgevoerd.' : result.error || result.state);
      }));
      if (['preparing','testing','ready','blocked'].includes(b.state)) row.append(button('Controle annuleren', async () => { if (confirm('Controle annuleren? De GitHub-branch en pull request blijven behouden voor de historie.')) { await post('cancel', {batchId: b.id}); await refresh(); } }));
      if (['merging','uncertain'].includes(b.state)) row.append(button('Status herstellen', async () => { await post('recover', {batchId: b.id}); await refresh(); }));
      $('#development-batches').append(row);
    }
    $('#development-enabled').textContent = data.mergeEnabled ? 'Live planbord, hoofdbranchbescherming, oorspronkelijke PR’s en gecombineerde tests worden vóór samenvoegen opnieuw gecontroleerd.' : 'Samenvoegen staat uit totdat de server is ingesteld, main is beschermd en automatische live-publicatie is ontkoppeld. Voortgang en exports werken wel.';
  }
  function count() { $('#development-count').textContent = `${selected.size} geteste wijzigingen geselecteerd`; }
  async function refresh() {
    data = await api(`${apiBase}/development`);
    selected = new Set([...selected].filter(id => data.proposals.some(p => p.id === id && p.developmentStatus === 'Klaar om samen te voegen')));
    if ($('#development-filter').options.length === 2) for (const status of data.statuses) $('#development-filter').add(new Option(status, status));
    render();
  }
  form.onsubmit = e => { e.preventDefault(); if (!form.reportValidity()) return; locked(async () => {
    if (!confirm('Deze toewijzing bewaren? Eerder testbewijs vervalt en de status wordt In ontwikkeling.')) return;
    await post('update', {id: editing.id, proposalRevision: editing.revision, revision: editing.development?.revision || 0, action: 'assign', developer: form.elements.developer.value, branch: form.elements.branch.value, pullRequest: Number(form.elements.pullRequest.value), headSha: form.elements.headSha.value, dependencies: form.elements.dependencies.value.split(',').map(s => s.trim()).filter(Boolean), note: form.elements.note.value});
    form.hidden = true; await refresh(); say('Ontwikkelaar en GitHub-koppeling bewaard.');
  }); };
  $('#development-advance').onclick = () => locked(async () => {
    const status = data.statuses[data.statuses.indexOf(editing.developmentStatus) + 1];
    if (!form.elements.note.value.trim()) throw new Error('Vul een onderbouwing of testbewijs in.');
    await post('update', {id: editing.id, proposalRevision: editing.revision, revision: editing.development.revision, action: 'advance', status, note: form.elements.note.value});
    form.hidden = true; await refresh(); say('Voortgang vastgelegd.');
  });
  $('#development-back').onclick = () => { form.hidden = true; };
  $('#development-filter').onchange = render;
  $('#development-prepare').onclick = () => locked(async () => {
    const items = data.proposals.filter(p => selected.has(p.id)).map(p => ({id: p.id, proposalRevision: p.revision, revision: p.development.revision}));
    const batch = await post('prepare', {items}); await refresh(); say(batch.state === 'testing' ? 'Integratie-PR aangemaakt. Wacht op de gecombineerde tests en laat de PR beoordelen.' : batch.error || batch.state);
  });
  return {async show() {
    for (const s of ['#form','#review','#list','#version-panel','#collection-edit','#collection-approve','#collection-dispatch']) { const el = root.querySelector(s); if (el) el.hidden = true; }
    panel.hidden = false; await refresh();
  }};
}
