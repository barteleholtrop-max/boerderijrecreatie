const LABELS = {actueel: 'Actueel', updates: 'Updates beschikbaar', offline: 'Offline', fout: 'Fout', onbekend: 'Nog niet gecontroleerd'};

export function createVersionUI({root, apiBase, locked, say}) {
  const panel = document.createElement('section'); panel.id = 'version-panel'; panel.hidden = true;
  panel.innerHTML = `<h3>Versie & updates</h3>
    <p class="notice">GitHub <strong>main</strong> bevat alleen goedgekeurde, samengevoegde wijzigingen. Branches en open pull requests zijn nog niet goedgekeurd en gelden niet als geïnstalleerd. <span id="version-mode"></span></p>
    <p id="version-status" class="version-status" role="status" aria-live="polite"></p>
    <dl class="version-facts">
      <dt>Lokale branch</dt><dd id="version-branch"></dd>
      <dt>Actieve versie</dt><dd id="version-head"></dd>
      <dt>GitHub main</dt><dd id="version-remote"></dd>
      <dt>Nieuwe commits op main</dt><dd id="version-behind"></dd>
      <dt>Laatste controle</dt><dd id="version-last"></dd>
      <dt>Volgende controle</dt><dd id="version-next"></dd>
    </dl>
    <p id="version-message"></p>
    <div id="version-pending" hidden><h4 id="version-pending-title"></h4><ul id="version-pending-list"></ul></div>
    <details id="version-history" hidden><summary>Doorgevoerde wijzigingen</summary><ul id="version-history-list"></ul></details>
    <div class="actions"><button id="version-check" type="button">Nu controleren</button><button id="version-preflight" type="button" class="primary">Bijwerken…</button></div>
    <p id="version-result" class="version-result" role="status" aria-live="polite" hidden></p>
    <section id="version-plan" hidden><h3>Veiligheidscontrole vóór bijwerken</h3>
      <p id="version-plan-summary"></p>
      <div id="version-blockers"></div><div id="version-warnings"></div>
      <h4>Risicoklasse</h4><ul id="version-risk"></ul>
      <h4>Binnenkomende commits</h4><ul id="version-commits"></ul>
      <h4>Gevolgen</h4><ul id="version-consequences"></ul>
      <form id="version-confirm" hidden><label>Typ ter bevestiging <code id="version-phrase"></code><input name="confirmation" autocomplete="off" spellcheck="false" required></label>
        <div class="actions"><button id="version-submit" type="submit" class="primary">Bevestigen en bijwerken (alleen fast-forward)</button><button id="version-cancel" type="button">Annuleren</button></div></form>
    </section>`;
  root.querySelector('dialog').append(panel);
  const badge = document.createElement('button'); badge.type = 'button'; badge.className = 'version-badge'; badge.hidden = true;
  root.append(badge);
  const $ = s => panel.querySelector(s);
  let data = null, plan = null;
  const time = value => value ? new Date(value).toLocaleString('nl-NL') : '—';
  // Every action ends in exactly one visible outcome; 'bezig' is shown only while waiting.
  const OUTCOMES = {bezig: '', klaar: 'Controle geslaagd', bijgewerkt: 'Bijgewerkt', geblokkeerd: 'Geblokkeerd', geannuleerd: 'Geannuleerd', fout: 'Fout'};
  function outcome(kind, text) {
    const el = $('#version-result'); el.hidden = false; el.dataset.outcome = kind;
    el.textContent = OUTCOMES[kind] ? `${OUTCOMES[kind]}: ${text}` : text;
    if (kind !== 'bezig') say(el.textContent, kind === 'geblokkeerd' || kind === 'fout');
  }
  const failure = (kind, message) => Object.assign(new Error(message), {kind});
  // Version calls get their own time limit and readable errors, so a lost or
  // non-JSON answer can never leave the panel waiting forever.
  async function request(route, data, timeout) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response;
      try { response = await fetch(apiBase + route, {method: data ? 'POST' : 'GET', headers: data ? {'Content-Type': 'application/json'} : {}, body: data ? JSON.stringify(data) : undefined, cache: 'no-store', signal: controller.signal}); }
      catch { throw failure('fout', controller.signal.aborted ? `Geen antwoord van de lokale server binnen ${Math.round(timeout / 1000)} seconden.` : 'De lokale server is niet bereikbaar; mogelijk is hij gestopt of herstart.'); }
      let result = null;
      try { result = await response.json(); } catch { if (controller.signal.aborted) throw failure('fout', `Geen volledig antwoord van de lokale server binnen ${Math.round(timeout / 1000)} seconden.`); }
      if (!response.ok) throw failure([400, 409].includes(response.status) ? 'geblokkeerd' : 'fout', result?.error || `Onverwacht antwoord van de lokale server (HTTP ${response.status}).`);
      if (!result) throw failure('fout', 'Het antwoord van de lokale server was onleesbaar.');
      return result;
    } finally { clearTimeout(timer); }
  }
  async function working(button, label, work) {
    const text = button.textContent; button.textContent = label;
    try { await work(); } finally { button.textContent = text; }
  }
  const list = (el, items, className) => el.replaceChildren(...items.map(text => { const p = document.createElement(el.tagName === 'UL' ? 'li' : 'p'); p.textContent = text; if (className) p.className = className; return p; }));

  function render() {
    if (!data) return;
    const status = $('#version-status');
    status.textContent = (data.checking ? 'Bezig met controleren… · ' : '') + (LABELS[data.status] || data.status);
    status.dataset.status = data.status;
    $('#version-branch').textContent = data.branch ? data.branch + (data.onMain ? ' (goedgekeurde hoofdlijn)' : ' — branchwerk, nog niet samengevoegd') : 'losgekoppelde commit';
    $('#version-head').textContent = data.shortHead ? `${data.shortHead}${data.subject ? ' · ' + data.subject : ''}${data.committed ? ' · ' + time(data.committed) : ''}` : '—';
    $('#version-mode').textContent = data.autoApply
      ? 'Alles wat op main is samengevoegd (door jou goedgekeurd) wordt automatisch bijgewerkt: alleen fast-forward, nooit over lokale wijzigingen heen. Updates met nieuwe pakketten of databasewijzigingen worden verwerkt bij de volgende start van boerbart-test.'
      : 'Controleren haalt alleen gegevens op; er wordt niets bijgewerkt zonder jouw expliciete bevestiging.';
    const pending = data.pending;
    $('#version-pending').hidden = !pending;
    if (pending) {
      $('#version-pending-title').textContent = pending.kind === 'herstart'
        ? `Klaar voor de volgende start: update naar ${pending.target.slice(0, 7)} (stop met Ctrl+C en start boerbart-test opnieuw)`
        : `Automatisch bijwerken geblokkeerd${pending.target ? ' (update naar ' + pending.target.slice(0, 7) + ')' : ''}`;
      list($('#version-pending-list'), pending.kind === 'herstart' ? pending.reasons.map(r => `${r.label}: ${r.files.slice(0, 5).join(', ')}${r.files.length > 5 ? ', …' : ''}`) : pending.blockers);
    }
    const history = data.history || [];
    $('#version-history').hidden = !history.length;
    list($('#version-history-list'), history.map(h => `${time(h.at)} · ${h.mode === 'automatisch' ? 'automatisch' : 'na bevestiging'} · ${h.from.slice(0, 7)} → ${h.to.slice(0, 7)} · ${h.commits.map(c => c.subject).slice(0, 3).join('; ')}${h.commits.length > 3 ? ` (+${h.commits.length - 3})` : ''}`));
    $('#version-remote').textContent = data.shortRemoteHead || '—';
    $('#version-behind').textContent = data.behind == null ? '—' : String(data.behind);
    $('#version-last').textContent = time(data.lastCheck) + (data.lastSuccess && data.lastSuccess !== data.lastCheck ? ` (laatst geslaagd: ${time(data.lastSuccess)})` : '');
    $('#version-next').textContent = data.nextCheck ? `${time(data.nextCheck)} · elke ${data.intervalMinutes} minuten` : '—';
    $('#version-message').textContent = data.message;
    // Never disabled for a state reason: the safety check itself explains why updating is not possible.
    badge.hidden = data.status !== 'updates';
    badge.textContent = !data.onMain ? `Nieuwe commits op main (${data.behind})` : data.pending?.kind === 'herstart' ? `Update bij volgende start (${data.behind})` : `Updates beschikbaar (${data.behind})`;
  }
  async function refresh() {
    try { data = await request('/version', null, 15000); render(); return true; }
    catch { return false; /* The site keeps working; the panel shows the last known status. */ }
  }
  function hidePlan() { plan = null; $('#version-plan').hidden = true; $('#version-confirm').hidden = true; $('#version-confirm').reset(); }
  function showPlan(result) {
    plan = result; $('#version-plan').hidden = false;
    $('#version-plan-summary').textContent = result.target ? `Van ${result.head.slice(0, 7)} naar ${result.target.slice(0, 7)} · ${result.commits.length} commit(s) · ${result.files} bestand(en).` : '';
    list($('#version-blockers'), result.blockers, 'error');
    list($('#version-warnings'), result.warnings, 'notice');
    list($('#version-risk'), !result.risk ? [] : result.risk.level === 'laag' ? ['Laag risico: alleen opmaak, teksten, afbeeldingen, documentatie of tests.'] : result.risk.reasons.map(r => `${r.label}: ${r.files.slice(0, 5).join(', ')}${r.files.length > 5 ? ', …' : ''}`));
    list($('#version-commits'), result.commits.map(c => `${c.id} ${c.subject}`));
    list($('#version-consequences'), result.consequences);
    $('#version-confirm').hidden = !result.ok;
    $('#version-phrase').textContent = result.confirmation || '';
  }
  $('#version-check').onclick = () => locked(() => working($('#version-check'), 'Bezig met controleren…', async () => {
    data = await request('/version/check', {}, 90000); render(); hidePlan(); say('Versie gecontroleerd. Er is niets gewijzigd.');
  }));
  $('#version-preflight').onclick = () => locked(() => working($('#version-preflight'), 'Veiligheidscontrole loopt…', async () => {
    hidePlan(); outcome('bezig', 'Veiligheidscontrole loopt…');
    try {
      const result = await request('/version/preflight', {}, 120000); showPlan(result);
      if (result.ok) outcome('klaar', 'lees de gevolgen en bevestig hieronder om bij te werken. Er is nog niets gewijzigd.');
      else outcome('geblokkeerd', result.blockers.join(' ') + ' Er is niets gewijzigd.');
    } catch (error) { outcome(error.kind || 'fout', error.message + ' Er is niets gewijzigd.'); }
  }));
  $('#version-cancel').onclick = () => { hidePlan(); outcome('geannuleerd', 'er is niets gewijzigd.'); };
  $('#version-confirm').onsubmit = event => { event.preventDefault(); locked(() => working($('#version-submit'), 'Bezig met bijwerken…', async () => {
    const p = plan; if (!p) return;
    const confirmation = $('#version-confirm').elements.confirmation.value.trim();
    if (confirmation !== p.confirmation) return outcome('geblokkeerd', `typ exact: ${p.confirmation}. Er is niets gewijzigd.`);
    if (!confirm(`Lokale main fast-forwarden naar ${p.target.slice(0, 7)}? Er wordt niets geïnstalleerd, gemigreerd of herstart.`)) return outcome('geannuleerd', 'er is niets gewijzigd.');
    outcome('bezig', `Bezig met bijwerken naar ${p.target.slice(0, 7)}…`);
    try {
      const result = await request('/version/update', {token: p.token, confirmed: true, confirmation}, 240000);
      data = result.version; render(); hidePlan();
      outcome('bijgewerkt', `lokale main staat nu op ${result.to.slice(0, 7)}. ${result.consequences.join(' ')}`);
    } catch (error) {
      if (error.kind !== 'geblokkeerd') {
        // The answer may be lost although Git finished: read the actual local commit before reporting.
        const now = await request('/version', null, 15000).catch(() => null);
        if (now) { data = now; render(); }
        if (now?.head === p.target) { hidePlan(); return outcome('bijgewerkt', `lokale main staat nu op ${p.target.slice(0, 7)} (het antwoord van de server ging verloren; de commit is daarna gecontroleerd). ${p.consequences.join(' ')}`); }
        return outcome('fout', error.message + ' Bijwerken is niet bevestigd. Controleer `git status` en `git log -1` in de terminal voordat je het opnieuw probeert.');
      }
      outcome('geblokkeerd', error.message + ' Er is niets gewijzigd.');
    }
  })); };
  badge.onclick = () => { const dialog = root.querySelector('dialog'); if (!dialog.open) dialog.showModal(); show(); };
  async function show() {
    for (const s of ['#form', '#review', '#list', '#development-panel', '#collection-edit', '#collection-approve', '#collection-dispatch']) { const el = root.querySelector(s); if (el) el.hidden = true; }
    panel.hidden = false; await refresh();
  }
  const ready = refresh();
  // Reading the cached status is cheap; the server itself checks GitHub every 5 minutes.
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  return {ready, show, hide() { panel.hidden = true; }};
}
