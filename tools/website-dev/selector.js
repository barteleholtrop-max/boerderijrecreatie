// Shared browser module. Never read textContent, innerHTML, field values, href,
// src, labels, record IDs or arbitrary data attributes to describe a selection.
const pages = new Set(['home', 'plan', 'menu', 'here', 'shop', 'info']);
const sheets = new Set(['nav', 'plan', 'playbook', 'playreview', 'request', 'requestDone', 'cart', 'route', 'contact', 'allergens', 'paid', 'planned', 'shopcart', 'shopconfirmed', 'storevisit', 'subscription']);
const activities = new Map([['Speelboerderij', 'play'], ['Ite by Boerderijrecreatie', 'yte'], ['Boerderijwinkel', 'shop'], ['Groepen & feesten', 'groups'], ['Zingeving & ontmoeting', 'meeting']]);
function hash(value) {
  let n = 2166136261;
  for (const c of value) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
  return (n >>> 0).toString(16).padStart(8, '0');
}
function signature(element) {
  const type = element instanceof HTMLInputElement && ['text','password','email','number','date','checkbox','radio','search','tel','url','file','hidden','submit','button'].includes(element.type) ? element.type : '';
  return hash([element.localName, type, element.children.length, ...[...element.children].slice(0, 40).map(child => child.localName)].join('|'));
}
export function currentView(application, element) {
  if (application === 'backoffice') {
    const value = document.querySelector('main[data-bb-view], main [data-bb-view]')?.getAttribute('data-bb-view');
    return /^(dashboard|approvals|tasks|yte|quotes|shop|payroll|finance|marketing|website|beheer|gast|product-editor|ops-(facturen|ingredients|voorraad|recepten|week)(-ingredient)?(-invoice)?(-recipe)?|cash-(yte|zelfservice|winkel)(-options)?(-receipt)?|work-(kok|barista|winkel)-(demo|orders)|sheets-(connected|disconnected))$/.test(value || '') ? value : null;
  }
  const card = element?.closest('.design-card') || document.querySelector('.design-card.chosen');
  const index = card ? Number(card.id.replace('design-', '')) : -1;
  const state = typeof states !== 'undefined' && index >= 0 && index < 4 ? states[index] : null;
  if (!state) return '';
  if (!pages.has(state.page) || (state.sheet && !sheets.has(state.sheet))) return null;
  return [index, pages.has(state.page) ? state.page : 'unknown', state.sheet ? sheets.has(state.sheet) ? state.sheet : 'other' : 'none', state.sheet ? activities.get(state.activity) || 'none' : 'none'].join('|');
}
export function locate(element, application) {
  if (!(element instanceof HTMLElement) || ['body', 'html', 'script', 'style'].includes(element.localName)) return null;
  const steps = []; let node = element;
  while (node && node !== document.body) {
    const index = [...node.parentElement.children].filter(child => child.localName === node.localName).indexOf(node) + 1;
    steps.unshift(`${node.localName}:nth-of-type(${index})`); node = node.parentElement;
  }
  const view = currentView(application, element);
  if (node !== document.body || steps.length > 40 || view === null) return null;
  return {version: 1, application, route: location.pathname, view, selector: 'body > ' + steps.join(' > '), signature: signature(element), tag: element.localName};
}
export function resolveLocation(anchor, application) {
  if (!anchor || anchor.application !== application || anchor.route !== location.pathname) return null;
  let element; try { element = document.querySelector(anchor.selector); } catch { return null; }
  if (!element || currentView(application, element) !== anchor.view || element.localName !== anchor.tag || signature(element) !== anchor.signature || !element.getClientRects().length || element.checkVisibility?.({opacityProperty: true, visibilityProperty: true}) === false) return null;
  return element;
}
export function createSelection({host, root, application, onSelect, onOpen}) {
  const box = document.createElement('div'); box.className = 'selection-box'; box.hidden = true;
  const toolbar = document.createElement('div'); toolbar.className = 'selection-toolbar'; toolbar.hidden = true;
  toolbar.innerHTML = '<span>Klik op een onderdeel om er een opmerking bij te schrijven.</span><button type="button">Selecteren stoppen (Esc)</button>';
  const pins = document.createElement('div'); pins.className = 'selection-pins';
  root.append(box, toolbar, pins);
  let active = false, hovered = null, selectedAnchor = null, proposals = [], queued = false;
  function rect(element, overlay) {
    const r = element.getBoundingClientRect();
    overlay.style.left = Math.max(0, r.left) + 'px'; overlay.style.top = Math.max(0, r.top) + 'px';
    overlay.style.width = Math.max(8, r.width) + 'px'; overlay.style.height = Math.max(8, r.height) + 'px';
  }
  function update() {
    queued = false;
    const selected = active ? hovered : resolveLocation(selectedAnchor, application);
    box.hidden = !selected; if (selected) rect(selected, box);
    pins.replaceChildren();
    if (active) return;
    const offsets = new Map();
    proposals.forEach((proposal, index) => {
      const element = resolveLocation(proposal.location, application); if (!element) return;
      const r = element.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'selection-pin';
      const offset = offsets.get(element) || 0; offsets.set(element, offset + 1);
      pin.textContent = String(index + 1); pin.setAttribute('aria-label', 'Opmerking ' + (index + 1));
      pin.title = 'Opmerking bekijken'; pin.style.left = Math.max(4, Math.min(innerWidth - 38, r.right - 16 - offset * 32)) + 'px'; pin.style.top = Math.max(4, r.top - 12) + 'px';
      pin.addEventListener('click', () => { selectedAnchor = proposal.location; onOpen(proposal); update(); }); pins.append(pin);
    });
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  function own(event) { return event.composedPath().includes(host); }
  function target(event) {
    const el = event.target instanceof Element ? event.target : null;
    return el?.closest('button,a,input,textarea,select,img') || (el instanceof HTMLElement ? el : null);
  }
  function stop() { active = false; hovered = null; toolbar.hidden = true; schedule(); }
  toolbar.querySelector('button').addEventListener('click', stop);
  window.addEventListener('keydown', event => { if (active && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stop(); } }, true);
  window.addEventListener('pointermove', event => { if (active && !own(event)) { hovered = target(event); schedule(); } }, true);
  // Capture before React, native links, forms and drawer handlers can act.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) window.addEventListener(type, event => {
    if (!active || own(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (type !== 'click') return;
    const anchor = locate(target(event), application);
    if (anchor) { selectedAnchor = anchor; stop(); onSelect(anchor); }
  }, true);
  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-bb-view']});
  addEventListener('scroll', schedule, true); addEventListener('resize', schedule); addEventListener('popstate', schedule);
  return {
    start() { active = true; hovered = null; selectedAnchor = null; toolbar.hidden = false; schedule(); },
    setProposals(value) { proposals = value; schedule(); },
    show(anchor) { selectedAnchor = anchor; schedule(); return !!resolveLocation(anchor, application); },
    clear() { selectedAnchor = null; schedule(); },
  };
}
