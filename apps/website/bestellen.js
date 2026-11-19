// Bestelpagina voor gasten. Het aanbod (namen, prijzen, btw, beschikbaarheid, keuzes en allergenen)
// komt uitsluitend live uit de centrale backoffice: GET /api/public/products. Deze pagina bewaart
// nooit eigen prijzen; het mandje onthoudt alleen product-ID, keuzes, aantal en opmerking, en rekent
// elk bedrag opnieuw uit met de actuele gegevens. Bestellen gaat via POST /api/public/orders: de server
// rekent alles opnieuw uit en legt de bestelling vast met status 'wacht op betaling'. Daarna betaalt de gast via
// Mollie (POST /api/public/payments) en komt terug op deze pagina met ?bestelling=<aanvraagnummer>; de backoffice
// controleert de betaling zelf bij Mollie. Pas na betalen gaat de bestelling naar keuken, bar of winkel.
// Eigen bedrag ("Wat is het je waard?") en groepscode (?groep=CODE, de gastheer betaalt) komen uit
// GET /api/public/order-options; de backoffice controleert beide opnieuw. Op groepsrekening betaalt de gast niets.
// Gezamenlijke rekening (wens eigenaar 5 november 2026): bij „Hoe wil je betalen?” kiest de gast iDEAL of een rekening.
// Hij opent zelf een rekening (met een maximum) of doet mee met een code. Iedereen op een rekening laat naam, e-mail en
// telefoon achter. De rekeninghouder beheert hem via ?rekening=<beheerlink>; een betaalverzoek (deel) opent ?deel=<id>.
(() => {
  'use strict';
  // Tijdelijk op het startscherm (wens eigenaar 8 november 2026): de gast kiest hoe lang hij de app houdt. Is die tijd voorbij, dan wist
  // de app alles wat hij op deze telefoon bewaarde (mandje, gegevens, koppeling met het BB-saldo) vóórdat er iets wordt gelezen.
  // Een app kan zichzelf niet van het startscherm halen; de gast krijgt uitleg hoe dat moet.
  const KEEP_KEY = 'bestellen-houden-tot';
  const expiredApp = (() => { try { const until = Number(localStorage.getItem(KEEP_KEY) || 0); if (!until || Date.now() < until) return false;
    for (const k of Object.keys(localStorage)) if (k.startsWith('bb-')) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('bb-')) sessionStorage.removeItem(k);
    return true; } catch { return false; } })();
  const STORAGE_KEY = 'bb-bestelling-v2'; // v2: keuzes als ID's in plaats van posities
  const REFRESH_MS = 60_000; // de backoffice ververst het aanbod hooguit één keer per minuut
  const MAX_QTY = 20;
  const ROUTES = {
    menu: {label: 'Eten & drinken', hint: 'Je bestelling gaat naar de keuken of de koffiebar. Je ziet straks wanneer het klaarstaat.'},
    winkel: {label: 'Uit de winkel', hint: 'Producten uit de boerderijwinkel hebben een eigen mandje. Zo komt er niets per ongeluk bij de keuken terecht.'},
  };

  const $ = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('nl-NL', {style: 'currency', currency: 'EUR'}).format(cents / 100);
  const meta = document.querySelector('meta[name="boerbart-backoffice"]')?.content.trim();
  // Op de lokale websitepoorten (3002/3003) staat de backoffice op poort 3001. Anders, zoals in de telefoonstand,
  // komen pagina en backoffice via hetzelfde adres.
  const localSite = ['3002', '3003'].includes(location.port) || location.protocol === 'file:';
  const backoffice = (meta || (localSite ? `http://${location.hostname || 'localhost'}:3001` : location.origin)).replace(/\/$/, '');

  // Bedragvelden (wens eigenaar 8 november 2026): het telefoontoetsenbord moet weg kunnen. Knop „Klaar” naast het veld,
  // en Enter (toets ‘klaar’ op het toetsenbord) sluit het toetsenbord bij elk bedragveld.
  function doneButton(input) {
    input.setAttribute('enterkeyhint', 'done');
    return h('button', {type: 'button', class: 'amount-done', text: 'Klaar', onclick: () => input.blur()});
  }
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key === 'Enter' && t instanceof HTMLInputElement && t.getAttribute('inputmode') === 'decimal') { e.preventDefault(); t.blur(); }
  });
  /** Bouwt DOM-elementen; tekst gaat altijd via textContent, nooit als HTML. */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'svg') el.innerHTML = ICONS[v]; // alleen vaste iconen uit deze file
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
    return el;
  }
  const ICONS = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c8 0 14-5 14-14-9 0-14 6-14 14Zm0 0 7-7"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18Z"/><path d="m9 13 6 0"/></svg>',
    basket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  };

  // ---------- toestand ----------
  // pending: een verstuurde maar (nog) niet bevestigde bestelling. Bij opnieuw proberen gaat hetzelfde aanvraagnummer mee,
  // zodat de backoffice er nooit twee bestellingen van maakt.
  // Zelfservicekassa in de winkel (besluit eigenaar 4 november 2026): bestellen.html?zelfservice=1 op een tablet.
  // Alleen het winkelmandje; afrekenen met de eigen telefoon (iDEAL of BB-saldo, zie hieronder), daarna weer leeg.
  // Eigen pagina zelfkassa.html (wens eigenaar 12 november 2026); het oude adres bestellen.html?zelfservice=1 blijft werken.
  const kiosk = /\/zelfkassa\.html$/.test(location.pathname) || new URLSearchParams(location.search).has('zelfservice');
  // Zelfscan op de eigen telefoon (wens eigenaar 12 november 2026): eigen pagina zelfscan.html met een eigen app-icoon. Alleen de winkel.
  const zelfscan = /\/zelfscan\.html$/.test(location.pathname);
  if (zelfscan) { document.documentElement.classList.add('zelfscan'); const t = document.querySelector('.intro h1'); if (t) t.textContent = 'Zelfscan'; }
  if (kiosk) document.documentElement.classList.add('zelfservice');
  if (kiosk) { const t = document.querySelector('.intro h1'); if (t) t.textContent = 'Zelfkassa'; }
  // In de winkel (wens eigenaar 9 november 2026): de tablet, en een telefoon die de winkel opent via de Zelfkassa-knop van de
  // ledenpagina of een QR-sticker (?winkel=1). Dan zijn ook producten met een etiketprijs te koop, nu in de winkel afgerekend.
  const inShop = kiosk || (() => {
    const here = zelfscan || new URLSearchParams(location.search).has('winkel');
    try { if (here) sessionStorage.setItem('bb-in-winkel', '1'); return here || sessionStorage.getItem('bb-in-winkel') === '1'; } catch { return here; }
  })();
  // De boerderijwinkel gaat via zelfscannen (besluit eigenaar 11 november 2026: „dat mag eerst wel weg … wellicht doen we dat later
  // weer”). Op de gewone bestelpagina staan alleen eten en drinken; op de zelfkassa (?zelfservice=1) en in de winkel (?winkel=1:
  // QR-sticker, Zelfkassa-knop van de ledenpagina) blijft de winkel. Vooraf bestellen en afhalen is uit, de code staat er nog:
  // weer aanzetten = SHOP_ONLINE op true. (window.BB_SHOP_ONLINE alleen voor de tests van die bewaarde route.)
  const SHOP_ONLINE = window.BB_SHOP_ONLINE === true;
  const shopHere = SHOP_ONLINE || inShop;
  const state = {status: 'loading', products: [], byId: new Map(), route: 'menu', carts: {menu: [], winkel: []}, updated: null, pending: null, sending: false,
    // options: wat de backoffice toestaat. groupCode: de code uit de link. chosen: wat de gast intypt bij "Wat is het je waard?".
    options: {ownAmount: null, group: null, groupProblem: null, pickupDays: [], checked: false}, groupCode: null, chosen: '',
    // Winkel: nu meenemen of later ophalen (afhaalmoment en naam, wens eigenaar 3 november 2026).
    pickup: {mode: 'nu', date: '', time: '', name: ''},
    // Betaalkeuze en gegevens voor een gezamenlijke rekening. token: de geheime beheerlink van een nieuwe rekening.
    pay: {method: 'eigen', mode: 'nieuw', billName: '', limit: '', warn: '', code: '', token: ''}, guest: {name: '', email: '', phone: '', remember: false},
    // member: voornaam en beschikbaar dividend van het gekoppelde lid (null = deze telefoon is niet gekoppeld).
    member: null};
  // De backoffice bepaalt het mandje (op basis van de werkafdeling); oudere antwoorden zonder route vallen terug op de afdeling.
  const routeOf = p => ((p.route ? p.route === 'winkel' : p.department.trim().toLowerCase() === 'winkel') ? 'winkel' : 'menu');
  const API_ROUTE = {menu: 'eten-drinken', winkel: 'winkel'};

  function load() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const r of Object.keys(ROUTES)) if (Array.isArray(saved.carts?.[r])) state.carts[r] = saved.carts[r].filter(validShape);
        if (saved.route in ROUTES) state.route = saved.route;
        if (saved.pending && typeof saved.pending.requestId === 'string' && typeof saved.pending.body === 'string') state.pending = saved.pending;
        if (typeof saved.groupCode === 'string') state.groupCode = cleanCode(saved.groupCode);
      }
    } catch { /* geen opslag beschikbaar: dan begint het mandje leeg */ }
    try { const g = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); if (g && typeof g === 'object') for (const k of ['name', 'email', 'phone']) if (typeof g[k] === 'string') state.guest[k] = g[k].slice(0, 200); state.guest.remember = g.remember === true; } catch {}
    // Een link met ?groep=CODE (bijvoorbeeld via een QR-code op het feest) gaat altijd voor.
    const fromLink = new URLSearchParams(location.search).get('groep');
    if (fromLink) state.groupCode = cleanCode(fromLink);
    // Eigen rekening van vandaag op dit toestel: verder bestellen op dezelfde rekening (ook na het sluiten van de pagina).
    else if (!state.groupCode && !kiosk) { const e = myBills().find(b => b.kind === 'eigen' && Date.now() - (b.at || 0) < 12 * 3600000); if (e) state.groupCode = cleanCode(e.code); }
  }
  const validShape = l => l && typeof l.id === 'string' && Array.isArray(l.choices) && l.choices.every(c => c === null || typeof c === 'string') && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= MAX_QTY && typeof (l.note ?? '') === 'string';
  function save() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({route: state.route, carts: state.carts, pending: state.pending, groupCode: state.groupCode})); } catch { /* niet erg */ }
  }

  const cleanCode = v => { const c = String(v).toUpperCase().replace(/[\s-]/g, ''); return /^[A-Z2-9]{8}$/.test(c) ? c : null; };
  // QR-code van de rekeninghouder scannen (wens eigenaar 5 november 2026). De QR bevat de meedoe-link (?groep=CODE) of
  // alleen de code. Scannen in de pagina kan met de camera en BarcodeDetector (onder andere Chrome op Android). Kan dat
  // niet (bijvoorbeeld Safari, of de camera is geweigerd), dan legt de pagina uit dat de gewone camera-app de link opent
  // en de code dan vanzelf invult. Er wordt niets opgeslagen of verstuurd; het beeld blijft op de telefoon.
  const codeFromScan = text => { try { const u = new URL(text); return cleanCode(u.searchParams.get('groep') || ''); } catch { return cleanCode(text); } };
  const SCAN_FALLBACK = 'Scannen in deze pagina lukt op deze telefoon niet. Open de camera-app en richt die op de QR-code van de rekeninghouder: de bestelpagina opent dan met de code al ingevuld.';
  async function scanQr(onCode, onFallback) {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return onFallback(SCAN_FALLBACK);
    let detector; try { detector = new window.BarcodeDetector({formats: ['qr_code']}); } catch { return onFallback(SCAN_FALLBACK); }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false}); }
    catch { return onFallback('De camera mag niet gebruikt worden. ' + SCAN_FALLBACK); }
    const video = h('video', {playsinline: true, muted: true, class: 'scan-video'});
    const note = h('p', {class: 'hint', 'aria-live': 'polite', text: 'Richt de camera op de QR-code van de rekeninghouder.'});
    let done = false;
    const stop = () => { done = true; stream.getTracks().forEach(t => t.stop()); layer.remove(); };
    const layer = h('div', {class: 'scan-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'QR-code scannen'},
      h('div', {class: 'scan-box'}, h('h4', {text: 'QR-code scannen'}), video, note,
        h('button', {type: 'button', class: 'secondary center', onclick: stop, text: 'Annuleren'})));
    document.body.append(layer);
    // Niet op play() wachten: dat kan blijven hangen tot de camera beeld geeft; het zoeken begint meteen.
    video.muted = true; video.srcObject = stream; video.play().catch(() => {});
    const tick = async () => {
      if (done) return;
      try {
        for (const r of await detector.detect(video)) {
          const code = codeFromScan(r.rawValue || '');
          if (code) { stop(); return onCode(code); }
          note.textContent = 'Dit is geen QR-code van een rekening. Probeer het nog eens.';
        }
      } catch {}
      setTimeout(tick, 250);
    };
    tick();
  }
  // Etiket fotograferen (wens eigenaar 9 november 2026): een foto van het prijsetiket (bijvoorbeeld runderlever: gewicht maal kiloprijs
  // is het totaal). De backoffice laat Claude product en bedrag lezen (POST /api/public/etiket); de klant ziet het en
  // tikt zelf op „Ja, in mijn mandje”. De foto wordt op het apparaat verkleind (onder 1 MB) en nergens bewaard.
  async function shrinkPhoto(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.65, 0.5, 0.35]) { const url = canvas.toDataURL('image/jpeg', q); if (url.length < 950000) return url; }
    return null;
  }
  // Streepjescode op de foto (wens eigenaar 10 november 2026: „kan het fotograferen ook streepjescodes herkennen?”): de tablet of
  // telefoon zoekt hem zelf (BarcodeDetector, als de browser dat kan) en stuurt hem mee. Een bekende code gaat dan meteen, zonder dat
  // de backoffice de foto hoeft te lezen; een onbekende helpt de backoffice een nieuw product te maken. Lukt het niet: gewoon de foto.
  async function barcodeIn(blob) {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = (await window.BarcodeDetector.getSupportedFormats?.() || ['ean_13']).filter(f => ['ean_13', 'ean_8', 'upc_a', 'upc_e'].includes(f));
      if (!formats.length) return null;
      const found = await new window.BarcodeDetector({formats}).detect(await createImageBitmap(blob));
      const code = found.map(f => String(f.rawValue || '').replace(/\D/g, '')).find(c => c.length >= 8 && c.length <= 14);
      return code || null;
    } catch { return null; }
  }
  // Meerdere etiketten achter elkaar (wens eigenaar 9 november 2026: „een reeks foto's: nog een foto toevoegen, nog een, en dan klaar”).
  // Elke foto wordt meteen gelezen, terwijl de klant de volgende maakt. Bij Klaar gaan alle gelezen etiketten in één keer in het mandje.
  // Hooguit LABEL_BATCH foto's per reeks (de backoffice leest er 6 per minuut per apparaat). Vanuit een product (forId) blijft het één foto.
  const LABEL_BATCH = 6;
  let labelBatch = null;
  function photoLabel(forId = null) {
    if (forId) return photoLabelOne(forId);
    if (!labelBatch || $('sheet').hidden || $('sheet').dataset.kind !== 'labels') labelBatch = {items: [], seq: 0};
    nextLabelPhoto();
  }
  // Volgend etiket: bij voorkeur in onze eigen camera (met „Volgend etiket” en „Klaar” in beeld), anders de camera-app van de telefoon.
  function nextLabelPhoto() { if (!openLabelCamera()) pickLabelPhoto(file => addLabelPhoto(file)); }
  // Eigen camerascherm voor de reeks etiketten (wens eigenaar 10 november 2026: „in het fotoscherm zelf een volgende foto kunnen
  // drukken of klaar; nu is dat nog onduidelijk”). Groot beeld van de camera, onderin een grote knop „Foto maken” en „Klaar”,
  // bovenin hoeveel foto's er zijn en wat er al gelezen is. Elke foto wordt meteen gelezen (addLabelPhoto), de klant kan
  // doorgaan. Geen spiegelbeeld. Lukt de camera niet (geen toestemming, oude browser), dan de camera-app van de telefoon.
  let labelCam = null;
  function openLabelCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return false;
    if (labelCam) return true;
    const video = h('video', {class: 'cam-video', autoplay: true, muted: true, playsinline: true});
    video.muted = true; video.setAttribute('playsinline', '');
    const status = h('p', {class: 'cam-status', 'aria-live': 'polite', text: 'Richt op het etiket en tik op Foto maken.'});
    const shot = h('button', {type: 'button', class: 'cam-shot'}, h('span', {'aria-hidden': 'true', text: '📸'}), h('b', {text: 'Foto maken'}));
    const done = h('button', {type: 'button', class: 'cam-done'}, 'Klaar');
    const close = h('button', {type: 'button', class: 'cam-close', 'aria-label': 'Stoppen met fotograferen', text: '×'});
    const flash = h('div', {class: 'cam-flash', hidden: true});
    const root = h('div', {class: 'label-cam', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Etiketten fotograferen'},
      video, flash, h('div', {class: 'cam-top'}, status, close), h('div', {class: 'cam-bottom'}, done, shot));
    const cam = labelCam = {root, video, stream: null, status, shot, done};
    const stop = () => { cam.stream?.getTracks().forEach(t => t.stop()); root.remove(); if (labelCam === cam) labelCam = null; document.documentElement.classList.remove('cam-open'); };
    cam.stop = stop;
    close.onclick = () => { stop(); if (labelBatch?.items.length) renderLabelBatch(); else { labelBatch = null; } };
    done.onclick = () => { stop(); if (labelBatch?.items.length) renderLabelBatch(); else labelBatch = null; };
    shot.onclick = () => {
      if (!labelBatch || !video.videoWidth) return;
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      flash.hidden = false; setTimeout(() => { flash.hidden = true; }, 150);
      c.toBlob(blob => { if (!blob) return; addLabelPhoto(blob); updateLabelCamera(); }, 'image/jpeg', 0.9);
    };
    document.body.append(root); document.documentElement.classList.add('cam-open');
    updateLabelCamera();
    // Eerst precies de achtercamera; heeft het toestel die niet (sommige tablets), dan de camera die er is.
    const size = {width: {ideal: 1920}, height: {ideal: 1080}};
    navigator.mediaDevices.getUserMedia({video: {facingMode: {exact: facing()}, ...size}, audio: false})
      .catch(() => navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: facing()}, ...size}, audio: false}))
      .then(stream => { if (labelCam !== cam) { stream.getTracks().forEach(t => t.stop()); return; } cam.stream = stream; video.srcObject = stream; video.play().catch(() => {}); })
      .catch(() => {
        // Geen toestemming of geen camera: een knop naar de camera-app van de telefoon (een tik, dus de browser laat hem toe).
        if (labelCam !== cam) return; cam.failed = true;
        status.textContent = 'De camera opent hier niet (geen toestemming?). Gebruik de camera-app van je telefoon.';
        const app = h('button', {type: 'button', class: 'cam-shot', onclick: () => { stop(); pickLabelPhoto(file => addLabelPhoto(file)); }}, h('span', {'aria-hidden': 'true', text: '📷'}), h('b', {text: 'Camera-app openen'}));
        shot.replaceWith(app);
      });
    return true;
  }
  function updateLabelCamera() {
    const cam = labelCam, batch = labelBatch; if (!cam || !batch || cam.failed) return;
    const n = batch.items.length, ok = batch.items.filter(i => i.status === 'ok').length, reading = batch.items.filter(i => i.status === 'reading').length;
    const full = n >= LABEL_BATCH;
    const last = [...batch.items].reverse().find(i => i.status !== 'reading');
    const lastText = !last ? '' : last.status === 'ok' ? `✓ ${last.product.name} ${money(last.data.totalCents)}. ` : `Foto ${last.n} niet gelezen, die kun je straks opnieuw doen. `;
    cam.status.textContent = !n ? 'Richt op het etiket en tik op Foto maken.'
      : full ? `${lastText}${n} foto's: dat is het maximum. Tik op Klaar.`
      : `${lastText}${n} ${n === 1 ? 'foto' : "foto's"}${ok ? ` · ${ok} gelezen` : ''}${reading ? ` · ${reading} bezig` : ''}. Volgend etiket, of tik op Klaar.`;
    cam.shot.disabled = full;
    cam.shot.querySelector('b').textContent = n ? 'Volgend etiket' : 'Foto maken';
    cam.done.textContent = n ? `Klaar (${n})` : 'Stoppen';
    if (full) cam.done.classList.add('cam-done-now'); else cam.done.classList.remove('cam-done-now');
  }
  function pickLabelPhoto(onFile) {
    const input = h('input', {type: 'file', accept: 'image/*', capture: facing(), hidden: true});
    input.addEventListener('change', () => { const file = input.files?.[0]; input.remove(); if (file) onFile(file); });
    document.body.append(input); input.click();
  }
  async function addLabelPhoto(file, replace = null) {
    const batch = labelBatch; if (!batch) return;
    const item = replace || {n: ++batch.seq};
    Object.assign(item, {status: 'reading', product: null, data: null, error: ''});
    if (!replace) batch.items.push(item);
    if (!labelCam) renderLabelBatch(); updateLabelCamera();
    let image = null; try { image = await shrinkPhoto(file); } catch {}
    const r = image ? await readLabelImage(image, await barcodeIn(file)) : {ok: false, error: 'Deze foto kunnen we niet gebruiken.'};
    if (labelBatch !== batch || !batch.items.includes(item)) return; // reeks gesloten of foto weggehaald
    Object.assign(item, r.ok ? {status: 'ok', product: r.product, data: r.data} : {status: 'error', error: r.error});
    if (!labelCam) renderLabelBatch(); updateLabelCamera();
  }
  function renderLabelBatch() {
    const batch = labelBatch; if (!batch) return;
    if (!$('sheet').hidden && $('sheet').dataset.kind !== 'labels') return; // de klant is met iets anders bezig
    const items = batch.items, ok = items.filter(i => i.status === 'ok'), reading = items.some(i => i.status === 'reading');
    const sum = ok.reduce((t, i) => t + i.data.totalCents, 0), full = items.length >= LABEL_BATCH;
    const row = i => h('li', {class: 'label-item ' + i.status},
      h('div', {},
        i.status === 'reading' ? h('b', {text: `Foto ${i.n} · we lezen het etiket…`})
          : i.status === 'ok' ? [h('b', {text: i.product.name}), h('small', {text: (i.data.weightGrams && i.data.unitPriceCents ? `${kg(i.data.weightGrams)} × ${money(i.data.unitPriceCents)} per kg` : (i.data.labelName && i.data.labelName.toLowerCase() !== i.product.name.toLowerCase() ? 'etiket: ' + i.data.labelName : '')) + (i.data.checked ? '' : ' · kijk even of het bedrag klopt')})]
          : [h('b', {text: `Foto ${i.n} niet gelezen`}), h('small', {text: i.error})]),
      i.status === 'ok' ? h('strong', {text: money(i.data.totalCents)})
        : i.status === 'error' ? h('button', {type: 'button', class: 'text-button label-retry', onclick: () => pickLabelPhoto(f => addLabelPhoto(f, i)), text: 'Opnieuw'}) : h('span', {class: 'label-spinner', 'aria-hidden': 'true'}),
      i.status !== 'reading' ? h('button', {type: 'button', class: 'bon-remove', 'aria-label': `Foto ${i.n} weghalen`, onclick: () => { batch.items.splice(batch.items.indexOf(i), 1); if (!batch.items.length) { labelBatch = null; closeSheet(); } else renderLabelBatch(); }, text: '×'}) : null);
    const done = ok.length === 1 && items.length === 1 ? 'Ja, in mijn mandje' : `Alle ${ok.length} in mijn mandje`;
    openSheet('labels', items.length > 1 ? `Etiketten (${items.length})` : 'Etiket', h('div', {class: 'label-batch'},
      h('ol', {class: 'label-list', 'aria-live': 'polite'}, items.map(row)),
      h('p', {class: 'fine', text: full ? `Dit zijn er ${LABEL_BATCH}: zet ze eerst in je mandje, dan kun je verder.` : 'Nog een product met een etiket? Maak gerust de volgende foto, we lezen ondertussen verder.'})),
    [h('button', {type: 'button', class: 'primary', 'data-autofocus': !reading && ok.length ? true : null, disabled: reading || !ok.length, onclick: () => addLabelBatch()},
        h('span', {text: reading ? 'Even lezen…' : ok.length ? done : 'Nog niets gelezen'}), ok.length ? h('b', {text: money(sum)}) : null),
      full ? null : h('button', {type: 'button', class: 'secondary label-more', 'data-autofocus': reading || !ok.length ? true : null, onclick: () => nextLabelPhoto()}, '📸 Nog een etiket')]);
  }
  function addLabelBatch() {
    const batch = labelBatch; if (!batch) return;
    let added = 0, sum = 0; const later = [];
    for (const i of batch.items.filter(x => x.status === 'ok')) {
      const p = i.product, d = i.data;
      const line = {id: p.id, choices: p.optionGroups.map(() => null), qty: 1, note: '', price: p.customerPrice ? d.totalCents : undefined};
      if (!p.customerPrice) delete line.price;
      if (lineProblem(line)) { later.push(i); continue; }
      const same = !p.customerPrice && cart().find(l => l.id === p.id && l.note === '' && l.choices.every(c => c === null) && l.price === undefined);
      if (same) same.qty = Math.min(MAX_QTY, same.qty + 1); else cart().push(line);
      added++; sum += d.totalCents;
    }
    save(); labelBatch = null; state.route = 'winkel'; closeSheet(); render();
    if (later.length) { const i = later[0]; return openProduct(i.product.id, {choices: i.product.optionGroups.map(() => null), qty: 1, note: '', price: i.data.totalCents}); }
    toast(added === 1 ? `${batch.items.find(x => x.status === 'ok').product.name} (${money(sum)}) toegevoegd` : `${added} producten (${money(sum)}) toegevoegd`);
  }
  function photoLabelOne(forId = null) {
    const input = h('input', {type: 'file', accept: 'image/*', capture: facing(), hidden: true});
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.remove(); if (!file) return;
      openSheet('receipt', 'Etiket lezen', h('div', {class: 'done'}, h('p', {text: 'We lezen het etiket…'})));
      let image = null; try { image = await shrinkPhoto(file); } catch {}
      if (!image) return labelProblem('Deze foto kunnen we niet gebruiken. Probeer het opnieuw.', forId);
      const r = await readLabelImage(image, await barcodeIn(file));
      if (!r.ok) return labelProblem(r.error, forId);
      labelConfirm(r.product, r.data, forId);
    });
    document.body.append(input); input.click();
  }
  // Eén foto van een etiket of verpakking laten lezen (POST /api/public/etiket), met de streepjescode als de tablet die al vond.
  async function readLabelImage(image, barcode = null) {
    let res = null, d = {};
    try {
      res = await fetch(backoffice + '/api/public/etiket', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify(barcode ? {image, barcode} : {image})});
      d = await res.json().catch(() => ({}));
    } catch {}
    if (!res?.ok || !d.ok) return {ok: false, error: typeof d.error === 'string' ? d.error : 'Het etiket kon nu niet worden gelezen. Typ het bedrag zelf in.'};
    // Nog niet in de productlijst: de backoffice heeft het net aangemaakt (niet op het startscherm).
    if (d.product && isProduct(d.product) && !state.byId.has(d.product.id)) {
      const fresh = normalizeProduct(d.product); newProducts.set(fresh.id, fresh); state.products.push(fresh); state.byId.set(fresh.id, fresh);
    }
    const p = state.byId.get(d.productId);
    if (!p || routeOf(p) !== 'winkel' || !p.available) return {ok: false, error: 'Dit product is nu niet te koop. Vraag het even aan een van ons.'};
    return {ok: true, product: p, data: d};
  }
  function labelProblem(text, forId) {
    openSheet('receipt', 'Etiket lezen', h('div', {class: 'done'}, h('p', {class: 'honest', role: 'alert', text})),
      [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: () => forId ? photoLabelOne(forId) : photoLabel(), text: 'Nog een foto maken'}),
        forId ? h('button', {type: 'button', class: 'text-button', onclick: () => openProduct(forId), text: 'Zelf het bedrag invullen'})
          : h('button', {type: 'button', class: 'text-button', onclick: closeSheet, text: 'Terug'})]);
  }
  const kg = g => (g / 1000).toFixed(3).replace('.', ',') + ' kg';
  function labelConfirm(p, d, forId) {
    const other = forId && forId !== p.id ? state.byId.get(forId) : null;
    const add = () => {
      if (!p.customerPrice) { closeSheet(); return quickAdd(p); }
      const line = {id: p.id, choices: p.optionGroups.map(() => null), qty: 1, note: '', price: d.totalCents};
      if (lineProblem(line)) return openProduct(p.id, {choices: p.optionGroups.map(() => null), qty: 1, note: '', price: d.totalCents});
      cart().push(line); save(); closeSheet(); render(); toast(`${p.name} (${money(d.totalCents)}) toegevoegd`);
    };
    openSheet('receipt', 'Klopt dit?', h('div', {class: 'done label-read'},
      other ? h('p', {class: 'honest', text: `Dit etiket hoort bij ${p.name}, niet bij ${other.name}.`}) : null,
      h('p', {class: 'micro', text: d.labelName || p.name}),
      d.created ? h('p', {class: 'fine', text: 'Nieuw: dit product staat nu ook in onze productlijst.'}) : null,
      h('h3', {class: 'order-number', text: money(d.totalCents)}),
      h('p', {text: p.name + (d.weightGrams && d.unitPriceCents ? ` · ${kg(d.weightGrams)} × ${money(d.unitPriceCents)} per kg` : '')}),
      d.checked ? null : h('p', {class: 'fine', text: 'Kijk even of het bedrag klopt met het etiket.'})),
    [h('button', {type: 'button', class: 'primary', 'data-autofocus': true, onclick: add}, h('span', {text: 'Ja, in mijn mandje'}), h('b', {text: money(d.totalCents)})),
      h('button', {type: 'button', class: 'text-button', onclick: () => photoLabel(forId), text: 'Nee, nog een foto maken'})]);
  }
  const labelButton = h('button', {type: 'button', class: 'primary label-product', hidden: true, onclick: () => photoLabel()}, h('span', {text: '🏷️ Etiket fotograferen'}));
  if (inShop) document.querySelector('.intro')?.append(labelButton);

  // QR-sticker op een winkelproduct (Gerechten & prijzen → QR-stickers): de link bestellen.html?winkel=1&product=<id> opent met een
  // gewone telefoon dat product op de bestelpagina. De camerascanner op de zelfkassa is weg (besluit eigenaar 9 november 2026:
  // „Scan een product kan vervallen”); daar fotografeert de klant de etiketten, ook een reeks achter elkaar.
  const PRODUCT_ID = /^[A-Za-z0-9_-]{1,80}$/;
  let pendingProduct = (() => {
    const q = new URLSearchParams(location.search), id = q.get('product'); if (!id) return null;
    q.delete('product'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    return PRODUCT_ID.test(id) && !kiosk ? id : null;
  })();
  // Etiketten altijd met de achtercamera (besluit eigenaar 12 november 2026: „de etiketscanner altijd op de achterste camera openen, dat
  // werkt het logischst”), ook op de tablet van de zelfkassa en ook als er eerder een andere camera is gekozen.
  const facing = () => 'environment';

  // Op een rekening kan alleen eten en drinken (wens eigenaar 5 november 2026): winkelproducten betaal je altijd zelf.
  const onGroupBill = () => state.groupCode !== null && state.route === 'menu';
  // Gezamenlijke rekening: een nieuwe openen (newBill) of al op een rekening via code of link (onGroupBill).
  const newBill = () => !kiosk && !onGroupBill() && state.route === 'menu' && state.pay.method === 'rekening' && state.pay.mode === 'nieuw';
  // Eigen rekening (wens eigenaar 11 november 2026): standaard bij eten en drinken. Alles komt op je eigen rekening en je rekent
  // na afloop in één keer af, met een zelfgekozen bedrag („Wat is het je waard?”). Dat scheelt betaalkosten per bestelling.
  const newEigen = () => !kiosk && !onGroupBill() && state.route === 'menu' && state.pay.method === 'eigen';
  const onEigen = () => onGroupBill() && state.options.group?.kind === 'eigen';
  const onBill = () => onGroupBill() || newBill() || newEigen();
  // Betalen met dividend (wens eigenaar 5 november 2026): altijd te kiezen, ook als reclame voor de coöperatie. Een lid koppelt
  // zijn telefoon één keer via zijn persoonlijke ledenlink (?lidkoppeling=…); de koppeling blijft op deze telefoon bewaard.
  const MEMBER_KEY = 'bb-lid';
  const memberToken = () => { try { const t = localStorage.getItem(MEMBER_KEY) || ''; return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : ''; } catch { return ''; } };
  const withDividend = () => !kiosk && !onGroupBill() && state.pay.method === 'dividend';
  const BILLS_KEY = 'bb-rekeningen', GUEST_KEY = 'bb-gegevens';
  const myBills = () => { try { const v = JSON.parse(localStorage.getItem(BILLS_KEY) || '[]'); return Array.isArray(v) ? v.filter(b => b && typeof b.token === 'string' && typeof b.name === 'string') : []; } catch { return []; } };
  const rememberBill = b => { try { localStorage.setItem(BILLS_KEY, JSON.stringify([b, ...myBills().filter(x => x.token !== b.token)].slice(0, 5))); } catch {} };
  const newToken = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

  // Een regel klopt alleen als product, beschikbaarheid en keuzes nog overeenkomen met het actuele aanbod.
  function lineProblem(line) {
    const p = state.byId.get(line.id);
    if (!p) return 'niet meer op de kaart';
    if (!p.available) return p.soldOut ? 'uitverkocht' : p.closed ? p.closed.replace(/\.$/, '').toLowerCase() : 'op dit moment niet beschikbaar';
    // Etiketprijs (klant voert prijs in): elke regel heeft zijn eigen bedrag; bij een gewoon product geen eigen bedrag.
    if (p.customerPrice ? !(Number.isSafeInteger(line.price) && line.price > 0) : line.price != null) return 'de prijs is veranderd';
    if (line.choices.length !== p.optionGroups.length) return 'de keuzes zijn veranderd';
    for (const [g, group] of p.optionGroups.entries()) {
      const c = line.choices[g];
      if (c == null) { if (group.required) return 'de keuzes zijn veranderd'; continue; }
      if (!group.choices.some(x => x.id === c)) return 'de keuzes zijn veranderd';
    }
    return null;
  }
  const choiceOf = (p, g, c) => p.optionGroups[g].choices.find(x => x.id === c);
  const unitPrice = line => {
    const p = state.byId.get(line.id);
    return (p.customerPrice ? line.price : p.priceCents) + line.choices.reduce((sum, c, g) => sum + (c == null ? 0 : choiceOf(p, g, c).extraCents), 0);
  };
  const cart = () => state.carts[state.route];
  const count = (r = state.route) => state.carts[r].reduce((n, l) => n + l.qty, 0);
  const total = () => cart().reduce((n, l) => n + unitPrice(l) * l.qty, 0);
  const vatOf = rate => cart().filter(l => state.byId.get(l.id).vat === rate).reduce((n, l) => {
    const gross = unitPrice(l) * l.qty; return n + Math.round(gross - gross / (1 + Number(rate) / 100));
  }, 0);

  function reconcile(previous = state.byId) {
    const dropped = [];
    for (const r of Object.keys(ROUTES)) {
      state.carts[r] = state.carts[r].filter(l => {
        const problem = lineProblem(l);
        if (problem) dropped.push(`${(state.byId.get(l.id) || previous.get(l.id))?.name || 'Een product'} is ${problem}`);
        return !problem;
      });
    }
    if (dropped.length) toast(dropped.length === 1 ? `${dropped[0]} en is uit je mandje gehaald.` : 'Een paar producten zijn niet meer beschikbaar en zijn uit je mandje gehaald.');
    save();
  }

  // ---------- gegevens ophalen ----------
  const isProduct = p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isSafeInteger(p.priceCents) && p.priceCents >= 0
    && ['9', '21'].includes(String(p.vat)) && Array.isArray(p.optionGroups);
  // Product van de backoffice zoals deze pagina het gebruikt (ook voor een net via een etiket aangemaakt product).
  // newProducts: via een etiket aangemaakt (wens eigenaar 9 november 2026), tot de productlijst van de backoffice ze zelf meegeeft.
  const newProducts = new Map();
  const normalizeProduct = p => ({
      ...p, department: String(p.department || 'Overig'), vat: String(p.vat),
      // Keuzevragen zonder ID's kunnen niet worden besteld; dan is het product voor nu niet beschikbaar.
      // Uitverkocht: de backoffice telt de voorraad van dit product en er is niets meer.
      soldOut: p.soldOut === true,
      // Werkplek dicht (wens eigenaar 14 november 2026): de reden van de backoffice, bijvoorbeeld „De keuken is nu gesloten.”
      closed: typeof p.closed === 'string' ? p.closed.slice(0, 120) : '',
      // Op het startscherm (wens eigenaar 9 november 2026): false = geen toets of kaart, wel te scannen en via een etiket te kopen.
      tile: p.tile !== false,
      // Streepjescodes (EAN) van de verpakking, gekoppeld in Gerechten & prijzen (wens eigenaar 9 november 2026).
      barcodes: Array.isArray(p.barcodes) ? p.barcodes.filter(b => typeof b === 'string' && /^\d{6,14}$/.test(b)).slice(0, 20) : [],
      // Wie levert het (wens eigenaar 9 november 2026): alleen een voornaam of de naam van de pot.
      supplier: typeof p.supplier === 'string' && p.supplier.trim() ? p.supplier.trim().slice(0, 40) : null,
      // Prijs van het etiket (bijvoorbeeld rundvlees, verschilt per stuk; wens eigenaar 5 november 2026): alleen bij de
      // zelfservicekassa en in de winkel (inShop). Online staat het product erbij, maar bestel je het in de winkel.
      customerPrice: p.customerPrice === true, inShopOnly: p.customerPrice === true && !inShop,
      available: p.available === true && !(p.customerPrice === true && !inShop) && p.optionGroups.every(g => g.id && Array.isArray(g.choices) && g.choices.every(c => c.id)),
      optionGroups: p.optionGroups.filter(g => Array.isArray(g.choices) && g.choices.length).map(g => ({
        id: String(g.id || ''), title: String(g.title || 'Keuze'), required: g.required === true,
        choices: g.choices.map(c => ({id: String(c.id || ''), label: String(c.label || ''), extraCents: Number.isSafeInteger(c.extraCents) && c.extraCents > 0 ? c.extraCents : 0})),
      })),
  });
  async function fetchProducts() {
    try {
      const res = await fetch(backoffice + '/api/public/products', {headers: {Accept: 'application/json'}, cache: 'no-cache'});
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data?.products)) throw new Error('onverwacht antwoord');
      // Alleen volledige producten tonen; bij twijfel liever weglaten dan een verkeerde prijs.
      state.products = data.products.filter(isProduct).filter(p => zelfscan ? routeOf(p) === 'winkel' : shopHere || routeOf(p) !== 'winkel').map(normalizeProduct);
      // Net via een etiket aangemaakt (wens eigenaar 9 november 2026): de lijst van de backoffice kan een minuut oud zijn.
      for (const [id, p] of newProducts) if (state.products.some(x => x.id === id)) newProducts.delete(id); else state.products.push(p);
      const previous = state.byId;
      state.byId = new Map(state.products.map(p => [p.id, p]));
      state.updated = data.updated || null;
      state.status = 'ready';
      if (!kiosk && !state.products.some(p => routeOf(p) === state.route) && state.products.some(p => routeOf(p) !== state.route) && !count()) state.route = state.route === 'menu' ? 'winkel' : 'menu';
      reconcile(previous);
    } catch {
      // Geen oude of verzonnen prijzen tonen: het mandje blijft bewaard, de kaart wacht op de backoffice.
      state.status = 'error';
      if (!$('sheet').hidden && !['receipt', 'checkout'].includes($('sheet').dataset.kind)) closeSheet();
    }
    render();
    if (pendingProduct && state.status === 'ready') { const id = pendingProduct; pendingProduct = null; if (state.byId.has(id) && $('sheet').hidden) { state.route = routeOf(state.byId.get(id)); render(); openProduct(id); } }
  }

  // Uitstraling (wens eigenaar 9 november 2026): de eigenaar kiest bij Website & uitstraling, de backoffice geeft de keuze mee in
  // /api/public/order-options. bestellen.html zet al de laatst bekende keuze; hier wordt die bijgewerkt en onthouden.
  // ?uitstraling=… bekijkt een uitstraling zonder iets te onthouden. Niet in de zelfkassa en niet bij een website met een eigen thema.
  const LOOKS = ['klassiek', 'd', 'e'];
  const forcedLook = (u => LOOKS.includes(u) ? u : null)(new URLSearchParams(location.search).get('uitstraling'));
  function applyLook(id) {
    const d = document.documentElement;
    if (kiosk || d.classList.contains('thema-site')) return;
    const look = forcedLook || (LOOKS.includes(id) ? id : 'klassiek');
    if (!forcedLook) try { localStorage.setItem('bb-uitstraling', look); } catch {}
    let link = document.getElementById('uitstraling-css');
    if (look === 'klassiek') { delete d.dataset.uitstraling; link?.remove(); return; }
    if (!link) { link = h('link', {rel: 'stylesheet', id: 'uitstraling-css'}); document.head.append(link); }
    if (link.getAttribute('href') !== `bestellen-${look}.css`) link.setAttribute('href', `bestellen-${look}.css`);
    d.dataset.uitstraling = look;
  }

  // Eigen bedrag aan of uit, en is de groepscode (nog) geldig? Bij een storing: normale prijs, de code blijft staan.
  async function fetchOptions() {
    try {
      const q = state.groupCode ? '?groep=' + encodeURIComponent(state.groupCode) : '';
      const res = await fetch(backoffice + '/api/public/order-options' + q, {headers: {Accept: 'application/json'}, cache: 'no-store'});
      const data = await res.json();
      if (!res.ok) throw new Error('status ' + res.status);
      applyLook(data?.uitstraling);
      // Strook „Proefversie” weg zodra er echt betaald wordt (12 november 2026).
      document.querySelectorAll('.notice-strip').forEach(el => { el.hidden = data?.betalen === 'live'; });
      const own = data?.ownAmount;
      state.options = {
        ownAmount: own && own.enabled === true && Number.isInteger(own.maxPercent) ? {maxPercent: own.maxPercent, allowZero: own.allowZero === true} : null,
        group: data?.group && typeof data.group.name === 'string' ? {name: data.group.name, host: String(data.group.host || ''), validUntil: String(data.group.validUntil || ''), kind: data.group.kind === 'eigen' ? 'eigen' : 'groep'} : null,
        groupProblem: typeof data?.groupProblem === 'string' ? data.groupProblem : null, checked: true,
        pickupDays: Array.isArray(data?.pickup?.days) ? data.pickup.days.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Array.isArray(d.times))
          .map(d => ({date: d.date, times: d.times.filter(t => /^\d{2}:\d{2}$/.test(t))})).filter(d => d.times.length) : [],
      };
      // Een eerder gekozen moment dat niet meer bestaat, vervalt (de naam blijft staan).
      // Een eigen rekening die al is afgerekend of verlopen: gewoon verder met een nieuwe (geen melding).
      if (state.groupCode && state.options.groupProblem && myBills().some(b => b.kind === 'eigen' && b.code === state.groupCode)) { state.groupCode = null; state.options.groupProblem = null; save(); }
      const pk = state.pickup, day = state.options.pickupDays.find(d => d.date === pk.date);
      if (!day) { pk.date = ''; pk.time = ''; } else if (!day.times.includes(pk.time)) pk.time = '';
    } catch {
      state.options = {ownAmount: null, group: null, groupProblem: null, pickupDays: [], checked: false};
    }
    renderGroup();
  }
  function leaveGroup() {
    state.groupCode = null; state.pending = null; save();
    if (new URLSearchParams(location.search).has('groep')) history.replaceState(null, '', location.pathname);
    renderGroup(); fetchOptions(); toast('Je bestelt nu zonder groepscode.');
  }
  const hostName = () => state.options.group?.host || state.options.group?.name || 'de gastheer';
  function renderGroup() {
    const banner = $('group-banner');
    if (!state.groupCode) { banner.hidden = true; banner.replaceChildren(); return; }
    const o = state.options, problem = o.groupProblem;
    banner.hidden = false; banner.classList.toggle('problem', !!problem);
    const mine = myBills().find(b => b.code === state.groupCode);
    if (!problem && o.group?.kind === 'eigen') return banner.replaceChildren(
      h('p', {class: 'micro', text: 'Je eigen rekening'}), h('b', {text: o.group.name}),
      h('p', {text: 'Alles wat je bestelt, komt op je rekening. Na afloop reken je in één keer af en kies je zelf wat je geeft.'}),
      mine ? h('button', {type: 'button', class: 'secondary', onclick: () => openHolder(mine.token), text: 'Mijn rekening · afrekenen'}) : null);
    banner.replaceChildren(
      h('p', {class: 'micro', text: 'Groepsrekening'}),
      h('b', {text: problem ? 'Deze groepscode werkt nu niet' : o.group ? o.group.name : 'Groepscode ' + state.groupCode}),
      h('p', {text: problem || (o.group ? `Je bestelt op rekening van ${hostName()}. Jij betaalt niets.` : 'We controleren de groepscode bij het bestellen. Jij betaalt niets.')}),
      h('button', {type: 'button', class: 'text-button', onclick: leaveGroup, text: problem ? 'Zonder deze code bestellen' : 'Toch zelf betalen'}),
      // De rekeninghouder (beheerlink bewaard op dit toestel) kan van hieruit zijn rekening beheren en afrekenen.
      ...myBills().filter(b => b.code === state.groupCode).slice(0, 1).map(b => h('button', {type: 'button', class: 'text-button', onclick: () => openHolder(b.token), text: 'Mijn rekening beheren'})));
  }

  // ---------- weergave ----------
  function render() {
    // Etiketknop altijd in de winkel (melding eigenaar 9 november 2026: „wellicht de klant een foto laten maken”): ook een product
    // dat nog niet in de lijst staat, wordt via de foto van het etiket herkend en aangemaakt.
    labelButton.hidden = !(state.route === 'winkel');
    $('menu').setAttribute('aria-busy', state.status === 'loading');
    renderGroup();
    renderRoutes();
    renderMenu();
    renderBasket();
    renderBon();
  }

  function renderRoutes() {
    const routes = $('routes');
    const has = r => state.products.some(p => routeOf(p) === r);
    const both = !kiosk && state.status === 'ready' && has('menu') && has('winkel');
    routes.hidden = !both;
    routes.replaceChildren(...Object.entries(ROUTES).map(([key, r]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(state.route === key), onclick: () => switchRoute(key),
    }, r.label, count(key) ? h('span', {class: 'count', text: String(count(key)), 'aria-label': `${count(key)} in mandje`}) : null)));
    // Zelfscan (wens eigenaar 12 november 2026): winkelgerichte uitleg in plaats van die over het aparte mandje.
    $('route-hint').textContent = state.status === 'ready' && has(state.route) ? (zelfscan ? 'Tik op een product of fotografeer het etiket. Afrekenen doe je hier, met je eigen telefoon.' : ROUTES[state.route].hint) : '';
  }
  function switchRoute(key) {
    if (key === state.route) return;
    state.route = key; save(); render();
    $('kaart').focus({preventScroll: true});
    window.scrollTo({top: 0});
  }

  function renderMenu() {
    const menu = $('menu'), sections = $('sections');
    if (state.status === 'loading') return;
    if (state.status === 'error') {
      sections.hidden = true;
      menu.replaceChildren(h('div', {class: 'state'}, h('span', {svg: 'cloud'}), h('h2', {text: 'Even geduld…'}),
        h('p', {text: 'We kunnen de kaart nu niet ophalen. Je mandje blijft bewaard. Probeer het zo nog eens, of vraag het aan een van ons.'}),
        h('button', {type: 'button', class: 'secondary center', onclick: () => { state.status = 'loading'; menu.replaceChildren(skeleton()); fetchProducts(); }, text: 'Opnieuw proberen'})));
      return;
    }
    const items = state.products.filter(p => routeOf(p) === state.route && p.tile !== false);
    if (!items.length) {
      sections.hidden = true;
      menu.replaceChildren(h('div', {class: 'state'}, h('span', {svg: 'leaf'}), h('h2', {text: 'De kaart wordt gevuld'}),
        h('p', {text: 'Op dit moment staat hier nog niets klaar om te bestellen. Kijk gerust later nog eens.'})));
      return;
    }
    const groups = new Map();
    for (const p of items) { const category=p.menuCategory||p.department; if (!groups.has(category)) groups.set(category, []); groups.get(category).push(p); }
    const slug = d => 'onderdeel-' + d.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    sections.hidden = groups.size < 2;
    sections.replaceChildren(...[...groups.keys()].map((d, i) => h('a', {href: '#' + slug(d), 'aria-current': String(i === 0), text: d})));
    if (kiosk) sections.hidden = true;
    menu.replaceChildren(...[...groups].map(([dept, list]) => h('section', {class: 'group', id: slug(dept), 'aria-labelledby': slug(dept) + '-t'},
      h('h2', {id: slug(dept) + '-t', text: dept}),
      kiosk ? h('div', {class: 'keys'}, list.map(productKey)) : h('div', {class: 'list'}, list.map(productCard)))));
    observeSections();
  }
  const skeleton = () => h('div', {class: 'skeleton', 'aria-hidden': 'true'}, h('i'), h('i'), h('i'));
  const initial = name => (name.match(/\p{L}/u)?.[0] || '•').toUpperCase();
  const art = (p, cls) => h('div', {class: cls}, p.photo ? h('img', {src: p.photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.replaceWith(h('span', {text: initial(p.name)}))}) : h('span', {text: initial(p.name)}));

  // Zelfkassa als kassa met druktoetsen (wens eigenaar 9 november 2026: „zoals onze kassa”): per product één grote toets met naam
  // en prijs; een tik zet het product op de bon (of opent het product als er eerst een keuze of het etiketbedrag nodig is).
  function productKey(p) {
    const inCart = cart().filter(l => l.id === p.id).reduce((n, l) => n + l.qty, 0);
    const needsChoice = p.customerPrice || p.optionGroups.some(g => g.required);
    return h('button', {type: 'button', class: 'key' + (inCart ? ' has' : '') + (p.available ? '' : ' off'), disabled: !p.available,
      'aria-label': `${p.name}, ${p.customerPrice ? 'prijs van het etiket' : money(p.priceCents)}${inCart ? `, ${inCart} op de bon` : ''}${p.available ? '' : ', niet beschikbaar'}`,
      onclick: () => needsChoice ? openProduct(p.id) : quickAdd(p)},
      // Foto op de toets (melding eigenaar 12 november 2026: „de zelfscankassa toont nog geen afbeeldingen van de producten”).
      // Alleen als het product een foto heeft; lukt het laden niet, dan verdwijnt het vak en blijft de toets zoals hij was.
      p.photo ? h('span', {class: 'key-art'}, h('img', {src: p.photo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: e => e.target.parentNode?.remove()})) : null,
      h('strong', {text: p.name}), p.supplier ? h('small', {class: 'key-supplier', text: 'Geleverd door ' + p.supplier}) : null, h('span', {class: 'key-price', text: !p.available ? (p.soldOut ? 'Uitverkocht' : p.closed ? 'Nu gesloten' : 'Niet beschikbaar') : p.customerPrice ? 'Etiketprijs' : money(p.priceCents)}),
      inCart ? h('b', {class: 'key-count', text: String(inCart)}) : null);
  }
  // De bon (wens eigenaar 10 november 2026: „de indeling met alle producten was beter, nu neemt de bon te veel ruimte in”):
  // een smalle balk onderin met het aantal, het totaal en Afrekenen; „Bekijk bon” klapt de regels (plus, min, weghalen) uit.
  // Zo houden de producten de hele breedte.
  const bon = kiosk ? h('aside', {class: 'kassa-bon', id: 'kassa-bon', 'aria-label': 'Bon'}) : null;
  if (bon) document.body.append(bon);
  let bonOpen = false;
  function renderBon() {
    if (!bon) return;
    const lines = state.status === 'ready' ? cart() : [];
    if (!lines.length) { bonOpen = false; bon.classList.remove('open'); return bon.replaceChildren(h('div', {class: 'bon-bar'}, h('p', {class: 'bon-empty', text: 'Tik op een toets of fotografeer een etiket.'}))); }
    const count = lines.reduce((n, l) => n + l.qty, 0);
    bon.classList.toggle('open', bonOpen);
    bon.replaceChildren(...[
      bonOpen ? h('div', {class: 'bon-panel', id: 'bon-panel'}, h('h2', {text: 'Bon'}),
        h('div', {class: 'bon-lines'}, lines.map((l, i) => {
          const p = state.byId.get(l.id); if (!p) return null;
          const opts = [...(p.customerPrice ? ['etiket ' + money(l.price)] : []), ...l.choices.map((c, g) => c == null ? null : choiceOf(p, g, c).label).filter(Boolean)];
          return h('div', {class: 'bon-line'},
            h('div', {class: 'bon-name'}, h('strong', {text: p.name}), opts.length ? h('small', {text: opts.join(' · ')}) : null),
            stepper(l.qty, v => { l.qty = v; save(); render(); }, `Aantal ${p.name}`),
            h('b', {class: 'bon-price', text: money(unitPrice(l) * l.qty)}),
            h('button', {type: 'button', class: 'bon-remove', 'aria-label': `${p.name} van de bon halen`, onclick: () => { cart().splice(i, 1); save(); render(); }, text: '×'}));
        })),
        h('button', {type: 'button', class: 'text-button', onclick: () => { state.carts.winkel = []; save(); render(); }, text: 'Bon leegmaken'})) : null,
      h('div', {class: 'bon-bar'},
        h('button', {type: 'button', class: 'bon-toggle', 'aria-expanded': bonOpen ? 'true' : 'false', 'aria-controls': 'bon-panel', onclick: () => { bonOpen = !bonOpen; renderBon(); }},
          h('span', {text: `🧾 ${count} ${count === 1 ? 'product' : 'producten'}`}), h('small', {text: bonOpen ? 'Bon sluiten ▾' : 'Bekijk bon ▴'})),
        h('button', {type: 'button', class: 'primary bon-pay', onclick: () => openCheckout()}, h('span', {text: 'Afrekenen'}), h('b', {text: money(total())})))].filter(Boolean));
  }
  // Tabletstand: volledig scherm bij de eerste tik (als app op het beginscherm staat het al volledig scherm, zie zelfkassa-app.json).
  // Niet bij de etiketknoppen: het verzoek verbruikt de tik, en dan mag de camera daarna niet open.
  // Op een telefoon niet (wens eigenaar 9 november 2026): daar is het je eigen toestel, en de grijze melding
  // van de browser over volledig scherm viel over de knop Afrekenen.
  if (kiosk) document.addEventListener('pointerdown', e => {
    if (phoneSized() || document.fullscreenElement || !document.documentElement.requestFullscreen || matchMedia('(display-mode: fullscreen)').matches) return;
    if (e.target.closest?.('.label-product, .label-photo, .label-more, .label-retry, input[type=file]')) return;
    document.documentElement.requestFullscreen().then(freeOrientation).catch(() => {});
  });
  // Meedraaien met het toestel (melding eigenaar 11 november 2026: „de zelfscan-app blijft op liggend staan”). Een eerder geïnstalleerde
  // app Zelfkassa kan de oude vaste stand (liggend) nog onthouden; als app of op volledig scherm mag de pagina die zelf vrijgeven.
  function freeOrientation() { try { screen.orientation?.lock?.('any').catch(() => {}); } catch {} }
  // Ook de gewone bestelpagina als app (melding eigenaar 11 november 2026: „de website opent in landscape”): stand vrijgeven.
  const asApp = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (kiosk || asApp()) { freeOrientation(); document.addEventListener('fullscreenchange', freeOrientation); }

  // Productkaart (verzoek eigenaar 3 november 2026): de kaart opent het product; „+” zet de standaardversie
  // direct in het mandje (of opent het product als er eerst een keuze nodig is); „Personaliseren” opent
  // keuzes, meerprijs, opmerking en aantal.
  function productCard(p) {
    const inCart = cart().filter(l => l.id === p.id).reduce((n, l) => n + l.qty, 0);
    const extra = p.optionGroups.some(g => g.choices.some(c => c.extraCents)) ? 'vanaf ' : '';
    const meta = p.inShopOnly ? 'Prijs per stuk · in de winkel' : !p.available ? (p.soldOut ? 'Uitverkocht' : p.closed || 'Op dit moment niet beschikbaar') : p.customerPrice ? 'Prijs van het etiket' : p.optionGroups.length ? 'Met keuze' : null;
    const needsChoice = p.customerPrice || p.optionGroups.some(g => g.required);
    const priceText = p.customerPrice ? 'ca. ' + money(p.priceCents) : extra + money(p.priceCents) + (Number.isSafeInteger(p.wasCents) && p.wasCents > p.priceCents ? ` (aanbieding, was ${money(p.wasCents)})` : '');
    return h('div', {class: 'product' + (p.available ? '' : ' off')},
      h('button', {
        type: 'button', class: 'product-open', onclick: () => openProduct(p.id),
        'aria-label': `${p.name}, ${priceText}${p.inShopOnly ? ', te koop in de winkel' : p.available ? '' : p.soldOut ? ', uitverkocht' : ', niet beschikbaar'}${inCart ? `, ${inCart} in je mandje` : ''}`,
      }, art(p, 'art'),
      h('span', {}, h('strong', {text: p.name}), p.supplier ? h('span', {class: 'meta supplier', text: 'Geleverd door ' + p.supplier}) : null, meta ? h('span', {class: 'meta', text: meta}) : null, h('span', {class: 'price', text: priceText}))),
      p.available ? h('button', {type: 'button', class: 'personalize', 'aria-label': `Personaliseren: ${p.name}`, onclick: () => openProduct(p.id)}, 'Personaliseren') : null,
      p.available
        ? h('button', {type: 'button', class: 'add' + (inCart ? ' has' : ''), 'aria-label': p.customerPrice ? `${p.name}: vul de prijs van het etiket in` : needsChoice ? `${p.name}: eerst een keuze maken` : `Eén ${p.name} toevoegen${inCart ? ` (nu ${inCart} in je mandje)` : ''}`,
            onclick: () => needsChoice ? openProduct(p.id) : quickAdd(p)}, inCart ? String(inCart) : '+')
        : h('span', {class: 'add', 'aria-hidden': 'true', text: 'op'}));
  }
  // Standaardversie zonder keuzes of opmerking; dezelfde controle als bij toevoegen vanuit het product.
  function quickAdd(p) {
    const line = {id: p.id, choices: p.optionGroups.map(() => null), qty: 1, note: ''};
    if (lineProblem(line)) { openProduct(p.id); return; }
    const same = cart().find(l => l.id === p.id && l.note === '' && l.choices.every(c => c === null));
    if (same) same.qty = Math.min(MAX_QTY, same.qty + 1); else cart().push(line);
    save(); render(); toast(`1× ${p.name} toegevoegd`);
  }

  let sectionObserver;
  function observeSections() {
    sectionObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      for (const a of $('sections').children) a.setAttribute('aria-current', String(a.hash === '#' + visible.target.id));
    }, {rootMargin: '-140px 0px -55% 0px'});
    document.querySelectorAll('.group').forEach(s => sectionObserver.observe(s));
  }

  function renderBasket() {
    const n = state.status === 'ready' ? count() : 0;
    $('open-basket').hidden = !n || kiosk;
    $('basket-badge').textContent = String(n);
    $('open-basket').setAttribute('aria-label', `${state.route === 'winkel' ? 'Je winkelmandje' : 'Je bestelling'} bekijken, ${n} ${n === 1 ? 'product' : 'producten'}`);
    $('basket-bar').hidden = !n || !$('sheet').hidden || kiosk;
    if (n) {
      $('basket-bar-label').textContent = `${state.route === 'winkel' ? 'Je winkelmandje' : 'Bekijk je bestelling'} · ${n}`;
      $('basket-bar-total').textContent = money(total());
    }
  }

  // ---------- paneel ----------
  let lastFocus = null;
  function openSheet(kind, title, body, foot = []) {
    const sheet = $('sheet');
    if (sheet.hidden) lastFocus = document.activeElement;
    sheet.dataset.kind = kind;
    $('sheet-title').textContent = title;
    $('sheet-body').replaceChildren(...[body].flat(Infinity).filter(Boolean));
    $('sheet-foot').replaceChildren(...foot.flat().filter(Boolean));
    $('sheet-body').scrollTop = 0;
    sheet.hidden = false; $('scrim').hidden = false;
    document.body.classList.add('locked');
    $('basket-bar').hidden = true;
    (sheet.querySelector('[data-autofocus]') || $('sheet-close')).focus({preventScroll: true});
  }
  function closeSheet() {
    if ($('sheet').dataset.kind === 'labels') labelBatch = null; // reeks etiketten gesloten: niets meer bijwerken
    $('sheet').hidden = true; $('scrim').hidden = true;
    document.body.classList.remove('locked');
    renderBasket();
    if (lastFocus?.isConnected) lastFocus.focus({preventScroll: true});
  }
  $('sheet-close').addEventListener('click', closeSheet);
  $('scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => {
    if ($('sheet').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key === 'Tab') { // focus binnen het paneel houden
      const f = [...$('sheet').querySelectorAll('button:not(:disabled),input,textarea,a[href]')].filter(el => el.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });

  function stepper(value, onChange, label, min = 1) {
    const out = h('output', {text: String(value), 'aria-live': 'polite'});
    return h('div', {class: 'stepper', role: 'group', 'aria-label': label},
      h('button', {type: 'button', 'aria-label': 'Eén minder', disabled: value <= min, onclick: () => onChange(value - 1), text: '−'}),
      out,
      h('button', {type: 'button', 'aria-label': 'Eén meer', disabled: value >= MAX_QTY, onclick: () => onChange(value + 1), text: '+'}));
  }

  // Productdetail: keuzes, allergenen, opmerking en aantal.
  function openProduct(id, draft) {
    const p = state.byId.get(id);
    if (!p) return;
    const d = draft || {choices: p.optionGroups.map(() => null), qty: 1, note: '', price: null};
    const labelOk = () => !p.customerPrice || (Number.isSafeInteger(d.price) && d.price > 0);
    const missing = () => !labelOk() || p.optionGroups.some((g, i) => g.required && d.choices[i] == null);
    const price = () => ((p.customerPrice ? d.price || 0 : p.priceCents) + d.choices.reduce((s, c, g) => s + (c == null ? 0 : choiceOf(p, g, c).extraCents), 0)) * d.qty;

    const addBtn = h('button', {type: 'button', class: 'primary', onclick: add});
    const refresh = () => {
      addBtn.disabled = !p.available || missing();
      addBtn.replaceChildren(h('span', {text: !p.available ? (p.soldOut ? 'Uitverkocht' : p.closed ? 'Nu gesloten' : 'Nu niet beschikbaar') : !labelOk() ? 'Vul eerst de prijs in' : missing() ? 'Maak eerst een keuze' : 'Voeg toe aan bestelling'}), h('b', {text: p.available ? money(price()) : ''}));
    };
    const groups = p.optionGroups.map((g, gi) => h('fieldset', {},
      h('legend', {}, g.title, h('em', {class: g.required ? 'need' : '', text: g.required ? 'Kies er één' : 'Optioneel'})),
      [...(g.required ? [] : [null]), ...g.choices].map(c => h('label', {class: 'choice'},
        h('input', {type: 'radio', name: 'g' + gi, checked: d.choices[gi] === (c ? c.id : null), disabled: !p.available, onchange: () => { d.choices[gi] = c ? c.id : null; refresh(); }}),
        h('span', {text: c ? c.label : 'Geen'}),
        c && c.extraCents ? h('small', {text: '+ ' + money(c.extraCents)}) : null))));

    const allergens = h('section', {class: 'allergens'}, h('h3', {text: 'Allergenen'}),
      p.allergensChecked && p.allergens
        ? (p.allergens.length ? h('div', {class: 'chips'}, p.allergens.map(a => h('span', {text: a}))) : h('p', {text: 'Gecontroleerd: er zijn geen allergenen vermeld.'}))
        : h('p', {text: 'Heb je een allergie of dieetwens? Vraag het even aan een van ons voordat je bestelt. Dan weten we het zeker.'}));

    // Etiketprijs: het bedrag van het etiket op dit stuk (incl. btw).
    const labelInput = h('input', {id: 'line-price', inputmode: 'decimal', autocomplete: 'off', placeholder: 'bijv. ' + money(p.priceCents).replace(/\s/g, ' '),
      oninput: e => { const c = parseEuro(e.target.value); d.price = Number.isSafeInteger(c) && c > 0 ? c : null; refresh(); }});
    if (d.price) labelInput.value = (d.price / 100).toFixed(2).replace('.', ',');
    const label = p.customerPrice && p.available ? h('label', {class: 'note label-price', for: 'line-price'}, 'Prijs op het etiket (€)', labelInput,
      h('small', {text: 'Elk stuk weegt anders. Typ het bedrag dat op het etiket van jouw stuk staat, of maak een foto van het etiket.'}),
      h('button', {type: 'button', class: 'secondary label-photo', onclick: () => photoLabel(p.id)}, '📷 Foto van het etiket')) : null;
    const note = h('textarea', {id: 'line-note', maxlength: '200', rows: '2', placeholder: 'Bijvoorbeeld: graag zonder ui', oninput: e => { d.note = e.target.value; }});
    note.value = d.note;
    const qtyWrap = h('div', {class: 'qty-row'}, h('span', {text: 'Aantal'}));
    const drawQty = () => qtyWrap.replaceChildren(h('span', {text: 'Aantal'}), stepper(d.qty, v => { d.qty = v; drawQty(); refresh(); }, 'Aantal'));
    drawQty(); refresh();

    function add() {
      const fresh = state.byId.get(id); // altijd tegen het actuele aanbod controleren
      const line = {id, choices: [...d.choices], qty: d.qty, note: d.note.trim().slice(0, 200), ...(p.customerPrice ? {price: d.price} : {})};
      if (!fresh || lineProblem(line)) { toast('Dit product is net veranderd. Kijk nog even op de kaart.'); closeSheet(); render(); return; }
      const same = cart().find(l => l.id === id && l.note === line.note && l.price === line.price && l.choices.every((c, i) => c === line.choices[i]));
      if (same) same.qty = Math.min(MAX_QTY, same.qty + line.qty); else cart().push(line);
      save(); closeSheet(); render();
      toast(`${line.qty}× ${p.name} toegevoegd`);
    }

    openSheet('product', p.name, [
      art(p, 'detail-art'),
      h('p', {class: 'detail-price', text: p.customerPrice ? 'Ongeveer ' + money(p.priceCents) + ' per stuk' : money(p.priceCents)}),
      p.inShopOnly ? h('p', {class: 'dept', text: 'De prijs verschilt per stuk en staat op het etiket. Dit product koop je in de winkel.'}) : null,
      label,
      h('p', {class: 'dept', text: p.inShopOnly ? p.department : p.available ? p.department : `${p.department} · ${p.soldOut ? 'uitverkocht' : p.closed ? p.closed.replace(/\.$/, '').toLowerCase() : 'op dit moment niet beschikbaar'}`}),
      groups,
      allergens,
      p.available ? h('label', {class: 'note', for: 'line-note'}, 'Opmerking', note) : null,
      p.available ? qtyWrap : null,
    ], [addBtn]);
  }

  // Mandje met aantallen, opmerkingen en het totaal uit de actuele prijzen.
  function openBasket() {
    if (state.status !== 'ready') return;
    const title = state.route === 'winkel' ? 'Dyn winkelmandje' : 'Dyn bestelling';
    if (!cart().length) {
      openSheet('basket', title, h('div', {class: 'empty'}, h('span', {svg: 'basket'}), h('p', {text: 'Je hebt nog niets gekozen.'})),
        [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: closeSheet, text: zelfscan ? 'Verder winkelen' : 'Kies iets lekkers'})]);
      return;
    }
    const lines = cart().map((l, i) => {
      const p = state.byId.get(l.id);
      const opts = [...(p.customerPrice ? ['etiket ' + money(l.price) + ' per stuk'] : []), ...l.choices.map((c, g) => c == null ? null : choiceOf(p, g, c).label).filter(Boolean)];
      return h('div', {class: 'line'},
        h('div', {}, h('strong', {text: p.name}), opts.length ? h('p', {class: 'opts', text: opts.join(' · ')}) : null, l.note ? h('p', {class: 'opts', text: '“' + l.note + '”'}) : null),
        h('span', {class: 'line-price', text: money(unitPrice(l) * l.qty)}),
        stepper(l.qty, v => { l.qty = v; save(); render(); openBasket(); }, `Aantal ${p.name}`),
        h('button', {type: 'button', class: 'text-button', onclick: () => { cart().splice(i, 1); save(); render(); toast(`${p.name} verwijderd`); openBasket(); }, text: 'Verwijderen'}));
    });
    const vat = ['9', '21'].map(r => [r, vatOf(r)]).filter(([, v]) => v > 0).map(([r, v]) => `${money(v)} btw ${r}%`).join(' · ');
    openSheet('basket', title, [
      lines,
      h('div', {class: 'totals'}, h('span', {text: 'Totaal'}), h('b', {text: money(total())})),
      h('p', {class: 'vat', text: 'Inclusief ' + (vat || 'btw')}),
    ], [
      h('button', {type: 'button', class: 'primary', 'data-autofocus': true, onclick: () => openCheckout()}, h('span', {text: 'Verder'}), h('b', {text: '→'})),
      h('button', {type: 'button', class: 'text-button', onclick: closeSheet, text: 'Nog iets toevoegen'}),
    ]);
  }

  // Afronden: de bestelling wordt verstuurd naar de backoffice, die alles opnieuw uitrekent en vastlegt.
  // Daarna betalen via Mollie: de bestelling wacht op betaling en gaat pas daarna naar keuken, bar of winkel.
  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID(); // niet beschikbaar op http buiten localhost
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  };
  const orderBody = () => JSON.stringify({route: API_ROUTE[state.route], lines: cart().map(l => {
    const p = state.byId.get(l.id);
    return {productId: l.id, version: p.version, quantity: l.qty, note: l.note || '', ...(p.customerPrice ? {priceCents: l.price} : {}),
      selections: Object.fromEntries(l.choices.flatMap((c, g) => c == null ? [] : [[p.optionGroups[g].id, c]]))};
  }), chosenCents: onBill() || withDividend() ? null : chosenCents(), groupCode: state.groupCode,
    ...(withDividend() ? {dividend: memberToken()} : {}),
    ...(withDividend() && state.pay.first === 'bb' ? {saldoEerst: 'bb'} : {}),
    ...(onBill() ? {guest: {name: state.guest.name.trim(), email: state.guest.email.trim(), phone: state.guest.phone.trim()}} : {}),
    // Eigen rekening (wens eigenaar 11 november 2026): naam, e-mail en telefoon maken meteen je klantenkaart.
    ...(rememberOn() || newEigen() || onEigen() ? {klant: {name: state.guest.name.trim(), email: state.guest.email.trim(), phone: state.guest.phone.trim(), toestemming: true}} : {}),
    ...(newBill() ? {openBill: {name: state.pay.billName.trim(), limitCents: parseEuro(state.pay.limit), token: state.pay.token || (state.pay.token = newToken())}} : {}),
    ...(newEigen() ? {openBill: {kind: 'eigen', name: 'Rekening van ' + state.guest.name.trim(), warnCents: state.pay.warn.trim() ? parseEuro(state.pay.warn) : null, token: state.pay.token || (state.pay.token = newToken())}} : {}),
    ...(pickupLater() ? {pickup: {date: state.pickup.date, time: state.pickup.time, name: state.pickup.name.trim()}} : {})});

  // Afhalen (alleen winkel): de backoffice geeft de momenten uit de openingstijden en controleert de keuze opnieuw.
  // Wens eigenaar 10 november 2026: „de keuze in de winkel of vooraf bestellen werkt verwarrend; ga ervan uit dat ze sowieso in de
  // winkel zijn”. In de winkel (tablet, Zelfkassa-knop of QR-sticker) is er geen keuze. Online is „nu, in de winkel” de vaste
  // stand; vooraf bestellen kan nog via een klein linkje.
  const pickupOn = () => !inShop && state.route === 'winkel' && state.options.pickupDays.length > 0;
  const pickupLater = () => pickupOn() && state.pickup.mode === 'later';
  const dayName = date => new Intl.DateTimeFormat('nl-NL', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'}).format(new Date(date + 'T12:00:00Z'));
  function pickupProblem() {
    if (!pickupLater()) return null;
    if (cart().some(l => state.byId.get(l.id)?.customerPrice)) return 'Producten met een etiketprijs neem je nu mee uit de winkel; die kun je niet vooraf bestellen.';
    if (!state.pickup.date || !state.pickup.time) return 'Kies een dag en tijd om op te halen.';
    if (state.pickup.name.trim().length < 2) return 'Vul je naam in, dan weten we voor wie de bestelling is.';
    return null;
  }
  function pickupField(send) {
    const pk = state.pickup, box = h('div', {class: 'pickup'});
    const hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    const refresh = () => {
      const problem = pickupProblem();
      hint.classList.toggle('warn', !!problem);
      hint.textContent = pickupLater() ? (problem || `We leggen het klaar voor ${dayName(pk.date)} om ${pk.time}.`) : ''; hint.hidden = !hint.textContent;
      send.disabled = blocked();
    };
    const draw = () => {
      const day = state.options.pickupDays.find(d => d.date === pk.date);
      const toggle = (mode, label) => h('button', {type: 'button', class: 'text-button pickup-toggle', onclick: () => { pk.mode = mode; draw(); }, text: label});
      const parts = pk.mode === 'later'
        ? [h('h4', {text: 'Vooraf bestellen, later ophalen'}), toggle('nu', 'Toch niet: ik ben nu in de winkel')]
        : [toggle('later', 'Liever vooraf bestellen en later ophalen?')];
      if (pk.mode === 'later') {
        const days = h('select', {id: 'pickup-day', onchange: e => { pk.date = e.target.value; pk.time = ''; draw(); }},
          h('option', {value: '', text: 'Kies een dag'}), state.options.pickupDays.map(d => h('option', {value: d.date, text: dayName(d.date), selected: d.date === pk.date})));
        const times = h('select', {id: 'pickup-time', disabled: !day, onchange: e => { pk.time = e.target.value; refresh(); }},
          h('option', {value: '', text: day ? 'Kies een tijd' : 'Kies eerst een dag'}), (day ? day.times : []).map(t => h('option', {value: t, text: t, selected: t === pk.time})));
        const name = h('input', {id: 'pickup-name', autocomplete: 'name', maxlength: '80', placeholder: 'Bijvoorbeeld Jansen', value: pk.name, oninput: e => { pk.name = e.target.value.slice(0, 80); refresh(); }});
        parts.push(h('div', {class: 'pickup-grid'},
          h('label', {for: 'pickup-day', text: 'Dag'}), days, h('label', {for: 'pickup-time', text: 'Tijd'}), times,
          h('label', {for: 'pickup-name', text: 'Op naam van'}), name));
      }
      parts.push(hint);
      box.replaceChildren(...parts);
      refresh();
    };
    draw();
    return box;
  }

  // "Wat is het je waard?": leeg = normale waarde. Geeft centen, null (normaal) of NaN (ongeldig).
  function parseEuro(text) {
    const t = String(text).replace(/[€\s]/g, '');
    if (t === '') return null;
    const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(t);
    return m ? Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0')) : NaN;
  }
  const ownAmountOn = () => !!state.options.ownAmount && !onBill() && !withDividend();
  const maxChosen = () => Math.floor(total() * state.options.ownAmount.maxPercent / 100);
  const EMPTY_WORTH = 'Typ zelf in wat je wilt geven.';
  function chosenProblem() {
    if (!ownAmountOn()) return null;
    const c = parseEuro(state.chosen);
    // Het veld begint leeg en de gast typt zelf zijn bedrag (wens eigenaar 5 november 2026: zo wordt het een bewuste keuze).
    if (c === null) return EMPTY_WORTH;
    if (Number.isNaN(c)) return 'Vul een bedrag in, bijvoorbeeld 12,50.';
    if (c === 0 && !state.options.ownAmount.allowZero) return `Kies een bedrag hoger dan ${money(0)}.`;
    if (c > maxChosen()) return `Online kun je maximaal ${money(maxChosen())} kiezen. Bedankt voor je gulheid!`;
    return null;
  }
  // Alleen een geldig, afwijkend bedrag gaat mee; gelijk aan de normale waarde = gewoon de normale prijs.
  const chosenCents = () => { if (!ownAmountOn() || chosenProblem()) return null; const c = parseEuro(state.chosen); return c === null || c === total() ? null : c; };
  const toPay = () => onBill() ? 0 : withDividend() ? total() : (chosenCents() ?? total());
  // Presentatie van de bestaande serverregels: verdeel het gekozen bedrag in hele centen
  // naar normale regelwaarde, grootste rest eerst. Btw wordt per regel afgerond.
  function paidVat(lines, amount) {
    const sum = lines.reduce((n, l) => n + l.totalCents, 0);
    if (!sum) return [...new Set(lines.map(l => l.vat))].map(rate => [rate, 0]);
    const divisor = BigInt(sum), numerators = lines.map(l => BigInt(l.totalCents) * BigInt(amount));
    const shares = numerators.map(n => Number(n / divisor));
    const order = numerators.map((n, i) => ({i, rest: n % divisor})).sort((a, b) => a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1);
    let remainder = amount - shares.reduce((n, v) => n + v, 0);
    for (let k = 0; remainder > 0; k++, remainder--) shares[order[k].i]++;
    return ['9', '21'].filter(rate => lines.some(l => l.vat === rate)).map(rate => [rate,
      lines.reduce((n, l, i) => n + (l.vat === rate ? Math.round(shares[i] * Number(rate) / (100 + Number(rate))) : 0), 0)]);
  }
  const checkoutLines = () => cart().map(l => ({totalCents: unitPrice(l) * l.qty, vat: state.byId.get(l.id).vat}));
  function vatSummary(lines, amount, group = false) {
    return h('div', {class: 'vat-summary', 'aria-live': 'polite'},
      h('p', {class: 'vat-title', text: group === 'eigen' ? 'Btw in deze bestelling · op je rekening' : group ? 'Btw in de normale waarde · op de groepsrekening' : 'Inbegrepen in jouw totaal'}),
      paidVat(lines, amount).map(([rate, cents]) => h('div', {class: 'vat-row'}, h('span', {text: `Waarvan btw ${rate}%`}), h('span', {text: money(cents)}))));
  }
  function worthExplanation() {
    return h('details', {class: 'worth-explanation'},
      h('summary', {text: 'Waarom mag je zelf de prijs bepalen?'}),
      h('p', {text: 'Wat fijn dat je er bent! We maken onze producten met aandacht en liefde. Voor ons is die waarde niet zomaar in een prijs uit te drukken.'}),
      h('p', {text: 'De voorgestelde prijs is gebaseerd op gemiddelde prijzen van bedrijven uit de regio. Die geeft je een houvast, maar jij mag geven wat goed voelt.'}),
      h('p', {text: 'Zo willen we een plek zijn voor iedereen. Je mag meer of minder geven. Dat is helemaal vrijwillig en zonder druk. Je typt zelf in wat je geeft; de gemiddelde waarde bij collega’s is daarbij een houvast.'}),
      h('p', {text: 'Na aftrek van de btw verdelen we jouw bijdrage in drie gelijke delen:'}),
      h('ul', {class: 'worth-distribution'},
        h('li', {text: 'Voor de mensen die het mogelijk maken.'}),
        h('li', {text: 'Voor onderhoud van de gebouwen, inrichting en alles wat daarbij hoort.'}),
        h('li', {text: 'Voor de boerderij en inkopen.'})));

  }
  function worthField(send, vat) {
    const hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    const update = () => {
      const problem = chosenProblem(), c = parseEuro(state.chosen), empty = problem === EMPTY_WORTH;
      hint.classList.toggle('warn', !!problem && !empty);
      hint.textContent = empty ? `Typ zelf in wat je wilt geven: van ${state.options.ownAmount.allowZero ? money(0) : money(1)} tot ${money(maxChosen())}. De gemiddelde waarde bij collega’s is een houvast.`
        : problem || (c === 0 ? `Je kiest ${money(0)}. Dat mag; we zien het apart in de administratie.`
        : `Je geeft ${money(c)}${c === total() ? ', de gemiddelde waarde bij collega’s' : ` in plaats van ${money(total())}`}.`);
      vat.replaceChildren(...(problem ? [h('p', {text: empty ? 'De btw zie je zodra je je bedrag hebt ingevuld.' : 'Vul een geldig bedrag in om de btw te zien.'})] : [...vatSummary(checkoutLines(), toPay()).childNodes]));
      send.disabled = blocked();
      send.querySelector('b').textContent = state.sending || empty ? '' : money(toPay());
    };
    const input = h('input', {id: 'worth', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Jouw bedrag', value: state.chosen,
      'aria-describedby': 'worth-hint', oninput: e => { state.chosen = e.target.value.slice(0, 12); update(); }});
    hint.id = 'worth-hint';
    queueMicrotask(update);
    return h('div', {class: 'worth'},
      h('h4', {text: 'Geef wat goed voelt'}),
      h('p', {class: 'worth-farm', text: 'Boer Bart, een boerderij van overvloed.'}),
      h('div', {class: 'normal'}, h('span', {text: 'Gemiddelde waarde bij collega’s'}), h('b', {text: money(total())})),
      h('label', {for: 'worth', text: 'Jouw bedrag'}),
      h('div', {class: 'amount'}, h('span', {text: '€', 'aria-hidden': 'true'}), input, doneButton(input)),
      hint, worthExplanation());
  }

  // ---------- Hoe wil je betalen? (gezamenlijke rekening, wens eigenaar 5 november 2026) ----------
  const blocked = () => state.sending || !!chosenProblem() || !!pickupProblem() || !!payProblem();
  function payProblem() {
    if (kiosk) return null;
    if (!onGroupBill() && state.route === 'menu' && state.pay.method === 'rekening' && state.pay.mode === 'code') return 'Vul de code van de rekening in.';
    if (withDividend()) {
      if (!state.member) return 'Koppel eerst deze telefoon via Inloggen bij Bloei Foundation (tot dat er is: via je persoonlijke ledenlink).';
      if (total() > state.member.availableCents) return `Je tegoed is niet genoeg: er is nog ${money(state.member.availableCents)} beschikbaar.`;
    }
    if (newBill()) {
      if (state.pay.billName.trim().length < 2) return 'Geef de rekening een naam, bijvoorbeeld „Familie Jansen”.';
      const limit = parseEuro(state.pay.limit);
      if (!Number.isSafeInteger(limit) || limit < 1000) return 'Kies een maximum vanaf ' + money(1000) + '.';
      if (limit > 500000) return 'Kies een maximum tot ' + money(500000) + '.';
      if (limit < total()) return 'Je maximum is lager dan deze bestelling.';
    }
    if (newEigen() && state.pay.warn.trim()) {
      const w = parseEuro(state.pay.warn);
      if (!Number.isSafeInteger(w) || w < 100 || w > 50000) return 'Kies een grens tussen ' + money(100) + ' en ' + money(50000) + ', of laat hem leeg.';
    }
    if (onBill()) {
      const g = state.guest;
      if (g.name.trim().length < 2) return 'Vul je naam in.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.email.trim())) return 'Vul een geldig e-mailadres in.';
      if (g.phone.replace(/\D/g, '').length < 9) return 'Vul een geldig telefoonnummer in.';
    }
    if (rememberOn()) {
      const g = state.guest;
      if (g.name.trim().length < 2) return 'Vul je naam in, of zet „Onthoud mij” uit.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.email.trim())) return 'Vul een geldig e-mailadres in, of zet „Onthoud mij” uit.';
    }
    return null;
  }
  // Klantenkaart (wens eigenaar 8 november 2026): alleen met toestemming. Niet op de winkeltablet (zelfservice).
  const rememberOn = () => !kiosk && state.guest.remember === true;
  async function fetchMember() {
    const t = memberToken(); if (!t) { state.member = null; return; }
    try {
      const res = await fetch(backoffice + '/api/public/dividend?lid=' + encodeURIComponent(t), {headers: {Accept: 'application/json'}, cache: 'no-store'});
      const d = await res.json().catch(() => ({}));
      if (res.status === 404) { try { localStorage.removeItem(MEMBER_KEY); } catch {} state.member = null; return; }
      state.member = res.ok && Number.isSafeInteger(d.availableCents) ? {name: String(d.name || ''), availableCents: d.availableCents, bondCents: Number.isSafeInteger(d.bondCents) ? d.bondCents : d.availableCents, bbCents: Number.isSafeInteger(d.bbCents) ? d.bbCents : 0, year: d.year, expires: /^\d{4}-\d{2}-\d{2}$/.test(d.expires || '') ? d.expires : null} : null;
    } catch { /* geen verbinding: dan blijft het zoals het was */ }
  }
  function dividendBlock(rerender) {
    const m = state.member, box = h('div', {class: 'dividend'});
    if (m) {
      // Rentesaldo (euro's, uit inleg) en BB-saldo (uit deelname). Het lid kiest zelf welk saldo eerst gaat (wens eigenaar 8 november 2026).
      box.append(h('p', {}, h('b', {text: `Hoi ${m.name}!`}), m.bbCents > 0 && m.bondCents > 0
        ? ` Je kunt nog ${money(m.availableCents)} besteden: ${money(m.bondCents)} rentesaldo en ${money(m.bbCents)} aan BB-saldo (waarde bij Boer Bart).`
        : m.bbCents > 0 ? ` Je kunt nog ${money(m.availableCents)} besteden met je BB-saldo (waarde bij Boer Bart).`
        : ` Je kunt nog ${money(m.availableCents)} besteden met je rentesaldo.`));
      if (m.bbCents > 0 && m.bondCents > 0) {
        const first = state.pay.first === 'bb' ? 'bb' : 'rente';
        const pick = v => { state.pay.first = v; save(); rerender(); };
        box.append(h('div', {class: 'choice-row', role: 'radiogroup', 'aria-label': 'Wat wil je eerst gebruiken?'},
          h('span', {class: 'hint', text: 'Wat wil je eerst gebruiken?'}),
          h('button', {type: 'button', role: 'radio', 'aria-checked': String(first === 'rente'), class: 'chip' + (first === 'rente' ? ' on' : ''), text: 'Eerst rentesaldo', onclick: () => pick('rente')}),
          h('button', {type: 'button', role: 'radio', 'aria-checked': String(first === 'bb'), class: 'chip' + (first === 'bb' ? ' on' : ''), text: 'Eerst BB-saldo', onclick: () => pick('bb')})));
      }
      if (m.expires && m.bondCents > 0) box.append(h('p', {class: 'hint', text: `Je rentesaldo vervalt op ${new Date(m.expires + 'T12:00:00Z').toLocaleDateString('nl-NL', {day:'numeric', month:'long', year:'numeric', timeZone:'Europe/Amsterdam'})}.`}));
      if (total() > m.availableCents) box.append(h('p', {class: 'hint warn', text: 'Dat is niet genoeg voor deze bestelling. Kies iDEAL of haal iets uit je mandje.'}));
      return box;
    }
    const email = h('input', {id: 'member-email', type: 'email', autocomplete: 'email', placeholder: 'naam@voorbeeld.nl', value: state.guest.email || ''});
    const answer = h('p', {class: 'hint', 'aria-live': 'polite'});
    box.append(
      h('p', {text: 'Ben je lid? Betaal hier met je BB-saldo (en je opneembare dividend uit Bloei). Koppel daarvoor één keer deze telefoon via je ledenpagina.'}),
      h('div', {class: 'pickup-grid'}, h('label', {for: 'member-email', text: 'Je e-mail'}), email),
      h('button', {type: 'button', class: 'secondary', onclick: async () => {
        try { const res = await fetch(backoffice + '/api/public/dividend', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({email: email.value.trim()})});
          const d = await res.json().catch(() => ({})); answer.textContent = d.message || d.error || ''; } catch { answer.textContent = 'Geen verbinding. Probeer het zo opnieuw.'; }
      }, text: 'Hoe koppel ik mijn telefoon?'}), answer,
      h('p', {class: 'fine', text: 'Vragen over je Bloei-tegoed of je persoonlijke ledenlink? Rianne en Bartele helpen je.'}));
    return box;
  }
  function payField(send, rerender, worth = null) {
    const pay = state.pay, box = h('div', {class: 'pickup pay'});
    if (state.route !== 'menu' && (pay.method === 'rekening' || pay.method === 'eigen')) pay.method = 'ideal'; // winkelproducten niet op de rekening
    const choice = (value, label, sub, current, set) => h('label', {class: 'pickup-choice' + (current === value ? ' on' : '')},
      h('input', {type: 'radio', name: 'pay-' + (set === 'method' ? 'method' : 'mode'), value, checked: current === value, onchange: () => { pay[set] = value; if (value === 'dividend') fetchMember().then(rerender); else rerender(); }}),
      h('span', {}, h('b', {text: label}), sub ? h('small', {text: ' ' + sub}) : null));
    // Eten en drinken (wens eigenaar 11 november 2026): „Achteraf betalen” (standaard), een gezamenlijke rekening, of „Nu betalen”.
    // Bij Nu betalen eerst hoeveel je wilt betalen („Geef wat goed voelt”), dan hoe: via een betaalverzoek of met je BB-tegoed.
    // Winkel en zelfscan (wens eigenaar 13 november 2026: „eerst vragen hoeveel je wil betalen”): eerst het bedrag, dan hoe.
    const parts = state.route === 'menu' ? menuPay() : [...(worth ? [worth] : []), h('h4', {text: 'Hoe wil je betalen?'}),
      h('div', {class: 'pickup-modes', role: 'radiogroup', 'aria-label': 'Hoe wil je betalen?'},
        // Eten en drinken: standaard op je eigen rekening, na afloop afrekenen (wens eigenaar 11 november 2026).
        state.route === 'menu' ? choice('eigen', 'Op je eigen rekening', '(na afloop in één keer afrekenen)', pay.method, 'method') : null,
        state.route === 'menu' ? choice('rekening', 'Op een gezamenlijke rekening', '(met familie of vrienden)', pay.method, 'method') : null,
        choice('ideal', state.route === 'menu' ? 'Nu betalen via een betaalverzoek' : 'Betalen via een betaalverzoek', '(je betaalt in je eigen bank-app)', pay.method, 'method'),
        // Op een rekening kan alleen eten en drinken; dividend kan altijd (wens eigenaar 5 november 2026).
        choice('dividend', 'Met je BB-saldo', '(leden, ook Bloei-dividend)', pay.method, 'method'))];
    function menuPay() {
      const now = pay.method === 'ideal' || pay.method === 'dividend';
      const top = h('label', {class: 'pickup-choice' + (now ? ' on' : '')},
        h('input', {type: 'radio', name: 'pay-method', value: 'nu', checked: now, onchange: () => { pay.method = 'ideal'; rerender(); }}),
        h('span', {}, h('b', {text: 'Nu betalen'}), h('small', {text: ' (met een betaalverzoek of je BB-tegoed)'})));
      const list = [h('h4', {text: 'Hoe wil je betalen?'}),
        h('div', {class: 'pickup-modes', role: 'radiogroup', 'aria-label': 'Hoe wil je betalen?'},
          choice('eigen', 'Achteraf betalen', '(alles op je rekening, na afloop in één keer afrekenen)', pay.method, 'method'),
          choice('rekening', 'Op een gezamenlijke rekening', '(met familie of vrienden)', pay.method, 'method'), top)];
      if (!now) return list;
      if (worth) list.push(h('h4', {text: 'Hoeveel wil je betalen?'}), worth);
      const sub = (value, label, small) => h('label', {class: 'pickup-choice' + (pay.method === value ? ' on' : '')},
        h('input', {type: 'radio', name: 'pay-now', value, checked: pay.method === value, onchange: () => { pay.method = value; if (value === 'dividend') fetchMember().then(rerender); else rerender(); }}),
        h('span', {}, h('b', {text: label}), h('small', {text: ' ' + small})));
      list.push(h('h4', {text: 'Hoe wil je nu betalen?'}),
        h('div', {class: 'pickup-modes', role: 'radiogroup', 'aria-label': 'Hoe wil je nu betalen?'},
          sub('ideal', 'Via een betaalverzoek', '(iDEAL, in je eigen bank-app)'), sub('dividend', 'Met je BB-tegoed', '(leden, ook Bloei-dividend)')));
      if (pay.method === 'dividend' && state.options.ownAmount) list.push(h('p', {class: 'hint', text: 'Met je BB-tegoed betaal je de gemiddelde waarde.'}));
      return list;
    }
    if (state.route !== 'menu' && pay.method === 'dividend' && state.options.ownAmount) parts.push(h('p', {class: 'hint', text: 'Met je BB-saldo betaal je de gemiddelde waarde.'}));
    if (pay.method === 'dividend') parts.push(dividendBlock(rerender));
    if (pay.method === 'eigen' && state.route === 'menu') {
      parts.push(h('p', {class: 'hint', text: 'Je bestelling gaat meteen naar de keuken of de koffiebar. Bestel gerust nog iets: alles komt op je rekening. Na afloop reken je in één keer af en kies je zelf wat je geeft.'}),
        h('div', {class: 'pickup-grid'},
          h('label', {for: 'bill-warn', text: 'Waarschuw me boven (€, mag leeg)'}),
          h('input', {id: 'bill-warn', inputmode: 'decimal', placeholder: 'Bijvoorbeeld 40', value: pay.warn, oninput: e => { pay.warn = e.target.value.slice(0, 10); refresh(); }})));
    }
    if (pay.method === 'rekening') {
      parts.push(h('div', {class: 'pickup-modes', role: 'radiogroup', 'aria-label': 'Welke rekening?'},
        choice('nieuw', 'Nieuwe rekening openen', 'Jij bent de rekeninghouder.', pay.mode, 'mode'),
        choice('code', 'Ik heb een code', 'Van wie de rekening opende.', pay.mode, 'mode')));
      if (pay.mode === 'nieuw') {
        parts.push(h('div', {class: 'pickup-grid'},
          h('label', {for: 'bill-name', text: 'Naam rekening'}),
          h('input', {id: 'bill-name', maxlength: '60', placeholder: 'Bijvoorbeeld Familie Jansen', value: pay.billName, oninput: e => { pay.billName = e.target.value.slice(0, 60); refresh(); }}),
          h('label', {for: 'bill-limit', text: 'Maximum (€)'}),
          h('input', {id: 'bill-limit', inputmode: 'decimal', placeholder: 'Bijvoorbeeld 100', value: pay.limit, oninput: e => { pay.limit = e.target.value.slice(0, 10); refresh(); }})),
          h('p', {class: 'hint', text: 'Is het maximum bereikt, dan kan er niets meer bij tot jij het verhoogt. Je krijgt een code om te delen: alleen wie die heeft, bestelt op je rekening.'}));
      } else {
        const input = h('input', {id: 'bill-code', maxlength: '12', autocomplete: 'off', placeholder: 'Bijvoorbeeld ABCD-EFGH', value: pay.code, oninput: e => { pay.code = e.target.value; useBtn.disabled = !cleanCode(pay.code); }});
        const useBtn = h('button', {type: 'button', class: 'secondary', disabled: !cleanCode(pay.code), onclick: async () => {
          const code = cleanCode(pay.code); if (!code) return;
          state.groupCode = code; pay.method = 'ideal'; pay.code = ''; state.pending = null; save();
          await fetchOptions(); openCheckout(state.options.groupProblem || null);
        }, text: 'Deze code gebruiken'});
        const scanHint = h('p', {class: 'hint', 'aria-live': 'polite'});
        const scanBtn = h('button', {type: 'button', class: 'secondary center', onclick: () => scanQr(code => {
          pay.code = code; input.value = code; useBtn.disabled = false; useBtn.click();
        }, text => { scanHint.textContent = text; })}, h('span', {text: 'QR-code scannen'}));
        parts.push(h('div', {class: 'pickup-grid'}, h('label', {for: 'bill-code', text: 'Code'}), input), useBtn, scanBtn, scanHint);
      }
    }
    const hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    // Alleen meldingen over de rekening zelf; die over naam, e-mail en telefoon staan bij „Jouw gegevens”.
    const refresh = () => { const problem = payProblem(), own = problem && /rekening|maximum|grens/i.test(problem) ? problem : ''; hint.classList.toggle('warn', !!own); hint.textContent = (pay.method === 'rekening' && pay.mode === 'nieuw') || pay.method === 'eigen' ? own : ''; send.disabled = blocked(); };
    parts.push(hint); box.replaceChildren(...parts); refresh();
    return box;
  }
  // Op je eigen rekening (melding eigenaar 11 november 2026: „de 2e keer wordt weer om de gegevens gevraagd”): zijn naam, e-mail en
  // telefoon al bekend, dan alleen een regel „op naam van”, met de mogelijkheid ze aan te passen.
  const guestKnown = () => { const g = state.guest; return g.name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.email.trim()) && g.phone.replace(/\D/g, '').length >= 9; };
  let editGuest = false;
  function guestKnownLine() {
    return h('p', {class: 'hint'}, `Op naam van ${state.guest.name.trim()}. `, h('button', {type: 'button', class: 'text-button', onclick: () => { editGuest = true; openCheckout(); }, text: 'Gegevens aanpassen'}));
  }
  // Naam, e-mail en telefoon: verplicht op een rekening (de factuur laat zien wie wat bestelde). Bewaard op dit toestel.
  function guestField(send) {
    const g = state.guest, hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    const keep = () => { try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch {} };
    const refresh = () => { const p = payProblem(); hint.classList.toggle('warn', !!p); hint.textContent = p || (newEigen() || onEigen() ? 'Je gegevens komen op je klantenkaart bij Boer Bart en op de factuur van je rekening.' : 'Je gegevens staan op de factuur van de rekening.'); send.disabled = blocked(); };
    const field = (key, label, type, auto, ph) => [h('label', {for: 'guest-' + key, text: label}),
      h('input', {id: 'guest-' + key, type, autocomplete: auto, maxlength: key === 'email' ? '200' : '80', placeholder: ph, value: g[key], oninput: e => { g[key] = e.target.value; keep(); refresh(); }})];
    const box = h('div', {class: 'pickup guest'}, h('h4', {text: 'Jouw gegevens'}),
      h('div', {class: 'pickup-grid'}, field('name', 'Naam', 'text', 'name', 'Voor- en achternaam'), field('email', 'E-mail', 'email', 'email', 'naam@voorbeeld.nl'), field('phone', 'Telefoon', 'tel', 'tel', '06 12 34 56 78')), hint);
    refresh();
    return box;
  }

  // „Onthoud mij als klant van Boer Bart” (wens eigenaar 8 november 2026): met toestemming komt de bestelling op je klantenkaart.
  // Zonder vinkje wordt de bestelling gewoon afgehandeld, zonder klantenkaart. Op een rekening staan naam en e-mail al hierboven.
  function rememberField(send) {
    const g = state.guest, keep = () => { try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch {} };
    const hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    const refresh = () => { const p = rememberOn() ? payProblem() : null; hint.classList.toggle('warn', !!p); hint.textContent = p || ''; send.disabled = blocked(); };
    const field = (key, label, type, auto, ph) => [h('label', {for: 'klant-' + key, text: label}),
      h('input', {id: 'klant-' + key, type, autocomplete: auto, maxlength: key === 'email' ? '200' : '80', placeholder: ph, value: g[key], oninput: e => { g[key] = e.target.value; keep(); refresh(); }})];
    // Alleen velden als het vinkje aan staat, en niet op een rekening: daar staan naam en e-mail al bij „Jouw gegevens”.
    const slot = h('div', {}), makeFields = () => h('div', {class: 'pickup-grid'}, field('name', 'Naam', 'text', 'name', 'Voor- en achternaam'), field('email', 'E-mail', 'email', 'email', 'naam@voorbeeld.nl'), field('phone', 'Telefoon (mag leeg)', 'tel', 'tel', '06 12 34 56 78'));
    const show = () => slot.replaceChildren(...(g.remember && !onBill() ? [makeFields()] : []));
    show();
    const box = h('div', {class: 'pickup guest remember'},
      h('label', {class: 'checkline'}, h('input', {type: 'checkbox', checked: g.remember, onchange: e => { g.remember = e.target.checked; show(); keep(); refresh(); }}), h('span', {text: 'Onthoud mij als klant van Boer Bart'})),
      h('p', {class: 'fine', text: 'Dan bewaren we je naam, e-mail en wat je bestelt op je klantenkaart, zodat we je beter kunnen helpen. Zonder vinkje bestel je gewoon, zonder klantenkaart. Wil je later dat we het weghalen? Mail ons, dan verwijderen we je kaart.'}),
      slot, hint);
    refresh();
    return box;
  }

  // Na het openen: de code delen (QR, WhatsApp, link) en de eigen beheerlink bewaren.
  const joinLink = code => location.origin + location.pathname + '?groep=' + code;
  const holderLink = token => location.origin + location.pathname + '?rekening=' + token;
  const qrImg = (url, alt) => h('img', {class: 'qr', src: backoffice + '/api/public/qr?url=' + encodeURIComponent(url), alt, width: '220', height: '220'});
  const share = (text, url) => h('div', {class: 'share-row'},
    h('a', {class: 'secondary', href: 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), target: '_blank', rel: 'noopener', text: 'Deel via WhatsApp'}),
    h('button', {type: 'button', class: 'secondary', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link gekopieerd.'); } catch { prompt('Kopieer de link:', url); } }, text: 'Link kopiëren'}));
  function payShopNow() { switchRoute('winkel'); openCheckout('Je hebt ook nog producten uit de winkel. Die reken je nu af via een betaalverzoek.'); }
  function openBillOpened(r, bill) {
    const link = joinLink(bill.code);
    openSheet('receipt', 'Je rekening is geopend', h('div', {class: 'done'},
      h('div', {class: 'seal', svg: 'check'}),
      h('p', {class: 'micro', text: 'Rekening'}), h('h3', {text: bill.name}),
      h('p', {text: `Je bestelling ${r.number} staat erop en gaat meteen naar de keuken of de koffiebar.`}),
      h('p', {class: 'micro', text: 'Code om te delen'}), h('h3', {class: 'order-number', text: bill.code.slice(0, 4) + '-' + bill.code.slice(4)}),
      h('p', {text: 'Laat anderen deze QR-code scannen, of deel de link. Alleen wie de code heeft, kan op je rekening bestellen.'}),
      qrImg(link, 'QR-code om mee te bestellen op deze rekening'), share(`Bestel mee op de rekening „${bill.name}” bij Boer Bart:`, link),
      h('p', {class: 'honest', text: 'Bewaar je eigen beheerlink: daarmee zie je wat erop staat, verhoog je het maximum en reken je af. Hij staat ook op dit toestel.'}),
      h('p', {}, h('a', {href: holderLink(bill.token), text: 'Mijn rekening beheren'}))),
    [state.carts.winkel.length ? h('button', {type: 'button', class: 'primary', onclick: payShopNow}, h('span', {text: 'Winkelproducten nu afrekenen'}), h('b', {text: '›'})) : null,
      h('button', {type: 'button', class: state.carts.winkel.length ? 'text-button' : 'primary center', 'data-autofocus': true, onclick: closeSheet, text: 'Terug naar de kaart'})]);
  }

  // ---------- Rekeninghouder (?rekening=<beheerlink>) en betaalverzoek (?deel=<id>) ----------
  async function billApi(query, body) {
    const res = await fetch(backoffice + '/api/public/rekening' + (query || ''), body ? {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify(body)} : {headers: {Accept: 'application/json'}, cache: 'no-store'});
    const d = await res.json().catch(() => ({}));
    // detail: wat bunq of Mollie zelf zei, zodat duidelijk is waarom betalen niet lukt.
    if (!res.ok) throw new Error((typeof d.error === 'string' ? d.error : 'Dat lukt nu niet. Probeer het zo opnieuw.') + (typeof d.detail === 'string' && d.detail ? ' (' + d.detail.slice(0, 200) + ')' : ''));
    return d;
  }
  const fmtDate = iso => new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam'}).format(new Date(iso));
  let billTimer = null;
  async function openHolder(token, message) {
    clearTimeout(billTimer);
    let b;
    // De beheerlink gaat in de body, niet in het adres (#192).
    try { b = await billApi('', {houder: token, action: 'lezen'}); }
    catch (e) { return openSheet('receipt', 'Rekening', h('div', {class: 'done'}, h('p', {class: 'honest', role: 'alert', text: e.message})), [h('button', {type: 'button', class: 'primary center', onclick: () => openHolder(token), text: 'Opnieuw proberen'})]); }
    const known = myBills().find(x => x.token === token);
    rememberBill({...(known || {}), token, name: b.name, code: b.code, ...(b.kind === 'eigen' ? {kind: 'eigen', at: known?.at || Date.now()} : {})});
    if (b.kind === 'eigen') return openEigenHolder(token, b, message);
    const f = b.fill, inv = b.invoice, open = b.status === 'actief' && !b.paidAt;
    const bar = h('div', {class: 'bill-bar' + (f.full ? ' full' : f.near ? ' near' : '')}, h('span', {style: `width:${f.percent}%`}));
    const parts = [h('p', {class: 'micro', text: 'Gezamenlijke rekening'}), h('h3', {text: b.name}),
      inv.paid ? h('div', {class: 'paid-stamp', text: 'Voldaan'}) : null,
      h('div', {class: 'summary'}, h('div', {}, h('span', {text: 'Op de rekening'}), h('b', {text: money(f.spentCents)})), open ? h('div', {}, h('span', {text: 'Maximum'}), h('b', {text: money(f.limitCents)})) : null),
      open ? bar : null,
      open && f.full ? h('p', {class: 'honest', text: 'De rekening is vol: er kan niets meer bij tot je het maximum verhoogt.'}) : null,
      message ? h('p', {class: 'honest', role: 'alert', text: message}) : null];
    const foot = [];
    if (open) {
      const link = joinLink(b.code);
      parts.push(h('p', {class: 'micro', text: 'Code om te delen'}), h('h3', {class: 'order-number', text: b.code.slice(0, 4) + '-' + b.code.slice(4)}), qrImg(link, 'QR-code om mee te bestellen'), share(`Bestel mee op de rekening „${b.name}” bij Boer Bart:`, link));
      const limit = h('input', {id: 'new-limit', inputmode: 'decimal', placeholder: 'Nieuw maximum in €', value: ''});
      parts.push(h('div', {class: 'pickup'}, h('h4', {text: 'Maximum aanpassen'}), h('div', {class: 'pickup-grid'}, h('label', {for: 'new-limit', text: 'Nieuw maximum'}), limit),
        h('button', {type: 'button', class: 'secondary', onclick: async () => { try { await billApi('', {houder: token, action: 'maximum', limitCents: parseEuro(limit.value)}); toast('Maximum aangepast.'); openHolder(token); } catch (e) { openHolder(token, e.message); } }, text: 'Opslaan'})));
      // Meebetalen (wens eigenaar 5 november 2026): de rekeninghouder vinkt aan wie mag meebetalen. Het totaal wordt gelijk
      // gedeeld over hem en die personen; ieder kiest zelf wat hij voor zijn deel betaalt.
      const people = Array.isArray(b.participants) ? b.participants : [];
      const picked = new Set();
      const per = () => money(Math.floor(f.spentCents / (1 + picked.size)));
      const sendBtn = h('button', {type: 'button', class: 'primary center', disabled: f.spentCents <= 0, onclick: () => settle([...picked])});
      const label = () => { sendBtn.textContent = picked.size ? `Afrekenen met ${picked.size + 1} personen · ${per()} p.p.` : 'Alles zelf betalen · ' + money(f.spentCents); };
      parts.push(h('div', {class: 'pickup'}, h('h4', {text: 'Rekening betalen'}),
        h('p', {class: 'hint', text: 'Vink aan wie mag meebetalen. Het bedrag wordt gelijk verdeeld over jou en hen; ieder ziet alleen het gedeelde bedrag en kiest zelf wat hij betaalt. Daarna kan er niets meer op de rekening.'}),
        h('div', {class: 'pickup-modes'}, people.map(p => h('label', {class: 'pickup-choice'},
          h('input', {type: 'checkbox', checked: p.holder, disabled: p.holder, onchange: e => { e.target.checked ? picked.add(p.key) : picked.delete(p.key); label(); }}),
          h('span', {text: p.name + (p.holder ? ' (jij)' : '')})))),
        sendBtn));
      label();
      async function settle(keys) { try { await billApi('', {houder: token, action: 'afrekenen', payers: keys}); openHolder(token); } catch (e) { openHolder(token, e.message); } }
    }
    if (b.shares.length && !inv.paid) {
      const others = b.shares.filter(s => !s.holder && s.payer);
      if (others.length) {
        const link = location.origin + location.pathname + '?meebetalen=' + b.code;
        parts.push(h('h4', {text: 'Meebetalen'}), h('p', {class: 'hint', text: 'Eén QR-code voor iedereen die meebetaalt. Wie meldingen aanzette, kreeg al een bericht. Bij de QR-code vult de meebetaler het e-mailadres van zijn bestelling in.'}),
          qrImg(link, 'QR-code om mee te betalen'), share(`Betaal mee aan de rekening „${b.name}” bij Boer Bart:`, link));
      }
      parts.push(h('h4', {text: others.length ? 'Wie heeft betaald' : 'Betalen'}));
      for (const s of b.shares) {
        const who = s.payer ? s.payer + (s.holder ? ' (jij)' : '') : b.shares.length > 1 ? `Deel ${s.position} van ${s.count}` : 'Hele rekening';
        parts.push(h('div', {class: 'share-card' + (s.status === 'betaald' ? ' paid' : '')},
          h('div', {class: 'share-head'}, h('b', {text: who}), h('span', {text: s.status === 'betaald' ? '✓ Betaald' : 'Nog niet betaald'})),
          s.status === 'betaald' ? null : h('button', {type: 'button', class: s.holder ? 'primary center' : 'secondary', onclick: () => openShare(s.id), text: s.holder ? 'Mijn deel betalen · ' + money(s.amountCents) : 'Dit deel zelf betalen · ' + money(s.amountCents)})));
      }
      billTimer = setTimeout(() => { if (!$('sheet').hidden && $('sheet').dataset.kind === 'bill') openHolder(token); }, 15000);
    }
    parts.push(invoiceBlock(inv));
    openSheet('bill', 'Je rekening', h('div', {class: 'done bill'}, parts), [h('button', {type: 'button', class: 'text-button', onclick: () => print(), text: 'Factuur downloaden (PDF)'}), h('button', {type: 'button', class: 'text-button', onclick: closeSheet, text: 'Naar de kaart'})]);
  }
  // Eigen rekening (wens eigenaar 11 november 2026): wat erop staat, de eigen grens, en één knop om af te rekenen.
  function openEigenHolder(token, b, message) {
    const f = b.fill, inv = b.invoice, open = b.status === 'actief' && !b.paidAt;
    const mineShare = b.shares.find(s => s.holder && s.status !== 'vervallen');
    const parts = [h('p', {class: 'micro', text: 'Je eigen rekening'}), h('h3', {text: b.name}),
      inv.paid ? h('div', {class: 'paid-stamp', text: 'Voldaan'}) : null,
      h('div', {class: 'summary'}, h('div', {}, h('span', {text: 'Op je rekening'}), h('b', {text: money(f.spentCents)})),
        b.warnCents ? h('div', {}, h('span', {text: 'Jouw grens'}), h('b', {text: money(b.warnCents)})) : null),
      b.over && !inv.paid ? h('p', {class: 'honest', role: 'alert', text: `Je zit boven je grens van ${money(b.warnCents)}. Bestellen kan nog wel.`}) : null,
      message ? h('p', {class: 'honest', role: 'alert', text: message}) : null];
    const foot = [];
    if (open) {
      const warn = h('input', {id: 'new-warn', inputmode: 'decimal', placeholder: 'Bijvoorbeeld 40 (leeg = geen grens)', value: b.warnCents ? (b.warnCents / 100).toFixed(2).replace('.', ',') : ''});
      parts.push(h('div', {class: 'pickup'}, h('h4', {text: 'Waarschuw me boven'}), h('div', {class: 'pickup-grid'}, h('label', {for: 'new-warn', text: 'Grens (€)'}), warn),
        h('button', {type: 'button', class: 'secondary', onclick: async () => { try { await billApi('', {houder: token, action: 'grens', warnCents: warn.value.trim() ? parseEuro(warn.value) : null}); toast('Grens opgeslagen.'); openHolder(token); } catch (e) { openHolder(token, e.message); } }, text: 'Opslaan'})));
      if (f.spentCents > 0) foot.push(h('button', {type: 'button', class: 'primary', 'data-autofocus': true, onclick: async () => {
        try { const d = await billApi('', {houder: token, action: 'afrekenen', payers: []}); const s = (d.shares || []).find(x => x.holder && x.status === 'open'); if (s) return openShare(s.id); openHolder(token); } catch (e) { openHolder(token, e.message); }
      }}, h('span', {text: 'Afrekenen'}), h('b', {text: money(f.spentCents)})));
      parts.push(h('p', {class: 'hint', text: 'Bij afrekenen gaat je rekening dicht en kies je zelf wat je geeft. Daarna kun je weer gewoon bestellen.'}));
    } else if (mineShare && mineShare.status === 'open') {
      foot.push(h('button', {type: 'button', class: 'primary', 'data-autofocus': true, onclick: () => openShare(mineShare.id)}, h('span', {text: 'Afrekenen'}), h('b', {text: money(mineShare.amountCents)})));
    }
    parts.push(invoiceBlock(inv));
    foot.push(h('button', {type: 'button', class: 'text-button', onclick: () => print(), text: 'Factuur downloaden (PDF)'}), h('button', {type: 'button', class: 'text-button', onclick: closeSheet, text: 'Naar de kaart'}));
    openSheet('bill', 'Je rekening', h('div', {class: 'done bill'}, parts), foot);
  }
  function invoiceBlock(inv) {
    const s = inv.seller || {};
    return h('section', {class: 'invoice', 'aria-label': 'Factuur'},
      h('div', {class: 'invoice-head'}, h('div', {}, h('b', {text: s.name || 'Boer Bart'}), [s.street, [s.postalCode, s.city].filter(Boolean).join(' ')].filter(Boolean).map(t => h('div', {text: t})),
        s.kvk ? h('div', {text: 'KvK ' + s.kvk}) : null, s.vatNumber ? h('div', {text: 'Btw ' + s.vatNumber}) : null),
        h('div', {}, h('b', {text: 'Factuur ' + inv.number}), h('div', {text: fmtDate(inv.date + 'T12:00:00Z')}), h('div', {text: 'Rekening: ' + inv.bill}), inv.holder?.name ? h('div', {text: 'T.a.v. ' + inv.holder.name}) : null)),
      // Overzicht: wat er besteld is en wie er besteld hebben, niet wie wat nam (wens eigenaar 5 november 2026).
      h('div', {class: 'invoice-person'}, (inv.products || []).map(l => h('div', {class: 'invoice-line'}, h('span', {text: `${l.quantity}× ${l.name}`}), h('span', {text: `${l.vat}% · ${money(l.totalCents)}`})))),
      (inv.orderedBy || []).length ? h('p', {class: 'invoice-names', text: 'Besteld door: ' + inv.orderedBy.join(', ')}) : null,
      h('div', {class: 'summary'},
        h('div', {}, h('span', {text: 'Totaal excl. btw'}), h('span', {text: money(inv.exclCents)})),
        inv.vat.map(v => h('div', {}, h('span', {text: `Btw ${v.rate}% over ${money(v.exclCents)}`}), h('span', {text: money(v.vatCents)}))),
        inv.payments.map(p => h('div', {}, h('span', {text: `${p.label} · ${p.method}`}), h('span', {text: '− ' + money(p.amountCents)}))),
        inv.differenceCents ? h('div', {}, h('span', {text: `Geef wat goed voelt (${inv.differenceCents < 0 ? 'minder' : 'meer'} betaald)`}), h('span', {text: (inv.differenceCents < 0 ? '− ' : '+ ') + money(Math.abs(inv.differenceCents))})) : null,
        h('div', {}, h('b', {text: inv.paid ? 'Voldaan' : 'Nog te betalen'}), h('b', {text: money(inv.paid ? inv.paidCents : inv.openCents)}))));
  }
  // Contant bij de kassa (wens eigenaar 11 november 2026): geen betaalverzoek; de kassa ziet „Wil contant betalen” en rekent af.
  async function cashShare(id, chosenCents = null) {
    try { const d = await billApi('', {deel: id, contant: true, ...(chosenCents == null ? {} : {chosenCents})}); return openShare(id); }
    catch (e) { return openShare(id, e.message); }
  }
  async function payShare(id, chosenCents = null) {
    try { const d = await billApi('', {deel: id, page: location.pathname, ...(chosenCents == null ? {} : {chosenCents})}); if (d.checkoutUrl && /^https?:\/\//.test(d.checkoutUrl)) { location.assign(d.checkoutUrl); return; } if (d.paid) return openShare(id); }
    catch (e) { return openShare(id, e.message); }
  }
  async function openShare(id, message, attempt = 0) {
    let d;
    try { d = await billApi('?deel=' + encodeURIComponent(id)); }
    catch (e) { return openSheet('receipt', 'Betaalverzoek', h('div', {class: 'done'}, h('p', {class: 'honest', role: 'alert', text: e.message})), [h('button', {type: 'button', class: 'primary center', onclick: closeSheet, text: 'Naar de kaart'})]); }
    if (!d.paid && !message && attempt > 0 && attempt < 6) { setTimeout(() => openShare(id, null, attempt + 1), 1500); }
    const eigen = d.kind === 'eigen';
    // Eigen rekening afgerekend: de volgende bestelling begint een nieuwe rekening.
    if (eigen && d.paid && state.groupCode && myBills().some(b => b.kind === 'eigen' && b.code === state.groupCode)) { state.groupCode = null; save(); renderGroup(); }
    // Meebetalen: alleen het gedeelde bedrag; met „Geef wat goed voelt” kiest de meebetaler zelf wat hij voor zijn deel betaalt.
    // Minder betaald: zijn deel is afgerekend. Meer: de anderen betalen gewoon hun eigen deel.
    const own = !d.paid && !d.replaced && !d.busy && d.ownAmount && d.payer ? d.ownAmount : null;
    const max = own ? Math.floor(d.amountCents * own.maxPercent / 100) : d.amountCents;
    let chosen = null;
    // Het veld begint leeg, zonder voorbeeldbedrag (melding eigenaar 11 november 2026); het totaal staat erboven als houvast.
    const input = own ? h('input', {id: 'share-worth', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Jouw bedrag'}) : null;
    const hint = h('p', {class: 'hint', 'aria-live': 'polite'});
    const btnAmount = h('b', {text: money(d.amountCents)});
    const payBtn = h('button', {type: 'button', class: 'primary', 'data-autofocus': true, disabled: !d.online, onclick: () => payShare(id, chosen)}, h('span', {text: 'Betalen via betaalverzoek'}), btnAmount);
    const cashBtn = h('button', {type: 'button', class: 'secondary', onclick: () => cashShare(id, chosen), text: 'Contant betalen bij de kassa'});
    if (input) input.addEventListener('input', () => {
      const v = parseEuro(input.value);
      const bad = v !== null && (Number.isNaN(v) || v > max || (v === 0 && !own.allowZero));
      chosen = bad || v === null ? null : v;
      hint.classList.toggle('warn', bad);
      hint.textContent = bad ? `Kies een bedrag van ${money(own.allowZero ? 0 : 1)} tot ${money(max)}.` : v === null ? (eigen ? 'Leeg: je betaalt de gemiddelde waarde.' : 'Leeg laten = het gedeelde bedrag.') : '';
      payBtn.disabled = !d.online || bad;
      btnAmount.textContent = money(chosen ?? d.amountCents);
      payBtn.firstChild.textContent = chosen === 0 ? 'Afronden zonder betalen' : 'Betalen via betaalverzoek';
    });
    openSheet('receipt', d.paid ? 'Tankjewol!' : eigen ? 'Afrekenen' : 'Meebetalen', h('div', {class: 'done'},
      d.paid ? h('div', {class: 'seal', svg: 'check'}) : null,
      h('p', {class: 'micro', text: 'Rekening'}), h('h3', {text: d.bill}),
      h('p', {text: eigen ? 'Totaal van je rekening' : d.payer ? `Gedeeld bedrag${d.holder ? ' · rekening van ' + d.holder : ''}` : d.count > 1 ? `Deel ${d.position} van ${d.count}` : 'De hele rekening'}),
      h('h3', {class: 'order-number', text: money(d.amountCents)}),
      own ? h('div', {class: 'worth'}, h('h4', {text: 'Geef wat goed voelt'}), h('p', {class: 'worth-farm', text: 'Boer Bart, een boerderij van overvloed.'}),
        h('div', {class: 'normal'}, h('span', {text: eigen ? 'Gemiddelde waarde bij collega’s' : 'Gedeeld bedrag'}), h('b', {text: money(d.amountCents)})),
        h('p', {class: 'hint', text: eigen ? 'Typ zelf in wat je geeft voor alles wat je bestelde. Laat je het leeg, dan betaal je de gemiddelde waarde.' : 'Kies zelf wat je voor jouw deel betaalt.'}),
        h('label', {for: 'share-worth', text: 'Jouw bedrag'}), h('div', {class: 'amount'}, h('span', {text: '€', 'aria-hidden': 'true'}), input, doneButton(input)), hint, worthExplanation()) : null,
      !d.paid && d.cash ? h('p', {class: 'honest', role: 'status', text: `Je betaalt ${money(d.toPayCents ?? d.amountCents)} contant bij de kassa. Zeg dat het om de ${d.bill} gaat; wij rekenen het daar met je af.`}) : null,
      d.paid ? h('p', {text: 'Betaald! Dank je wel.'}) : d.replaced ? h('p', {class: 'honest', text: 'Dit betaalverzoek is vervangen door een nieuwe verdeling. Vraag de rekeninghouder om de nieuwe link.'}) : null,
      message ? h('p', {class: 'honest', role: 'alert', text: message}) : null),
    d.paid || d.replaced ? [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: closeSheet, text: 'Naar de kaart'})]
      : [payBtn, cashBtn, d.online ? null : h('p', {class: 'fine', text: 'Online betalen staat nog niet aan. Reken af bij een van ons.'})]);
  }
  // Meebetalen via de ene link of QR-code: eerst het e-mailadres van je bestelling, dan je eigen deel.
  function openJoinPay(code, message) {
    const email = h('input', {id: 'pay-email', type: 'email', autocomplete: 'email', placeholder: 'naam@voorbeeld.nl', value: state.guest.email || ''});
    const go = async () => { try { const d = await billApi('', {meebetalen: code, email: email.value.trim()}); openShare(d.deel); } catch (e) { openJoinPay(code, e.message); } };
    openSheet('receipt', 'Meebetalen', h('div', {class: 'done'},
      h('p', {text: 'Vul het e-mailadres in dat je bij je bestelling gebruikte. Dan zie je het bedrag van jouw deel.'}),
      h('div', {class: 'pickup guest'}, h('div', {class: 'pickup-grid'}, h('label', {for: 'pay-email', text: 'E-mail'}), email)),
      message ? h('p', {class: 'honest', role: 'alert', text: message}) : null),
    [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: go, text: 'Naar mijn deel'})]);
  }

  function openCheckout(message) {
    const n = count();
    const eigenNow = onEigen() || newEigen();
    const vat = vatSummary(checkoutLines(), onBill() ? total() : toPay(), eigenNow ? 'eigen' : onBill());
    const status = typeof message === 'string' ? h('p', {class: 'honest', role: 'alert', text: message}) : null;
    // Zelfkassa: het bedragveld („Wat is het je waard?”) moet de knop „Afrekenen met je telefoon” aanzetten, niet een knop die
    // niet in beeld is (melding eigenaar 9 november 2026: „blijft haken bij zelf waarde toevoegen”).
    const kioskButtons = kiosk ? kioskPayButtons() : null;
    const send = kiosk ? kioskButtons[0] : h('button', {type: 'button', class: 'primary', 'data-autofocus': true, disabled: blocked(), onclick: placeOrder},
      h('span', {text: state.sending ? 'Bestelling wordt verstuurd…' : onEigen() || newEigen() ? 'Op mijn rekening bestellen' : onGroupBill() ? 'Op de rekening bestellen' : newBill() ? 'Rekening openen en bestellen' : withDividend() ? 'Betalen met BB-saldo' : 'Bestelling plaatsen'}), h('b', {text: state.sending ? '' : money(eigenNow ? total() : toPay())}));
    // „Hoeveel wil je betalen?” staat in de betaalkeuze, vóór betaalverzoek of BB-tegoed (eten en drinken: na „Nu betalen”;
    // winkel en zelfscan: bovenaan, wens eigenaar 13 november 2026).
    const worthInPay = !kiosk && !onGroupBill() && total() > 0 && ownAmountOn() ? worthField(send, vat) : null;
    const group = onEigen() ? h('p', {class: 'honest', text: 'Op je eigen rekening. Na afloop reken je in één keer af.'}) : onGroupBill() ? h('p', {class: 'honest', text: state.options.groupProblem || `Op rekening van ${hostName()}${state.options.group ? ' (' + state.options.group.name + ')' : ''}. Jij betaalt niets.`}) : null;
    openSheet('checkout', state.route === 'winkel' ? 'Bijna klaar' : 'Hast alles?', h('div', {class: 'done'},
      h('h3', {text: 'Dyn bestelling yn byld.'}),
      h('div', {class: 'summary'},
        cart().map(l => { const p = state.byId.get(l.id); return h('div', {}, h('span', {text: `${l.qty}× ${p.name}`}), h('span', {text: money(unitPrice(l) * l.qty)})); }),
        h('div', {}, h('b', {text: `${ownAmountOn() ? 'Gemiddelde waarde incl. btw' : 'Totaal inclusief btw'} · ${n} ${n === 1 ? 'product' : 'producten'}`}), h('b', {text: money(total())}))),
      group, pickupOn() ? pickupField(send) : null, !kiosk && !onGroupBill() && total() > 0 ? payField(send, () => openCheckout(), worthInPay) : null,
      !kiosk && state.route === 'winkel' && state.groupCode ? h('p', {class: 'honest', text: 'Winkelproducten kun je niet op de rekening zetten; die betaal je nu. Eten en drinken kan wel op de rekening.'}) : null,
      onBill() ? (onEigen() && guestKnown() && !editGuest ? guestKnownLine() : guestField(send)) : null, !kiosk && !newEigen() && !onEigen() ? rememberField(send) : null, notifyField(), worthInPay ? null : ownAmountOn() ? worthField(send, vat) : null, vat,
      status,
      h('p', {class: 'fine', text: kiosk ? 'Kies hoe je wilt betalen.' : newEigen() || onEigen() ? 'Je bestelling gaat meteen naar de keuken of de koffiebar. Afrekenen doe je na afloop.' : onBill()
        ? 'Je bestelling gaat op de rekening en meteen naar de keuken, de koffiebar of de winkel. Afrekenen doet de rekeninghouder straks.'
        : 'Hierna krijg je een betaalverzoek en betaal je in je eigen bank-app. We maken pas iets klaar als er betaald is.'})),
    [...(kiosk ? kioskButtons : [send]), h('button', {type: 'button', class: 'text-button', disabled: state.sending, onclick: kiosk ? closeSheet : openBasket, text: kiosk ? 'Terug naar de bon' : 'Terug naar je bestelling'})]);
  }

  async function placeOrder() {
    if (state.sending || !cart().length || chosenProblem() || pickupProblem()) return;
    const body = orderBody();
    // Zelfde inhoud als een eerder onbevestigde poging? Dan hetzelfde aanvraagnummer, anders een nieuw.
    if (!state.pending || state.pending.body !== body) state.pending = {requestId: uuid(), body};
    save();
    // Melding „staat klaar” (melding eigenaar 14 november 2026: „hij zet de bestelling al onderweg voor ik kan klikken dat ik een
    // melding wil”): de toestemming vragen bij deze tik, vóór het versturen. Een browser vraagt het alleen direct na een tik.
    const askPush = notifyWanted();
    const permission = askPush && Notification.permission === 'default' ? Notification.requestPermission().catch(() => 'default') : null;
    state.sending = true; openCheckout();
    let res, data;
    try {
      res = await fetch(backoffice + '/api/public/orders', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({requestId: state.pending.requestId, ...JSON.parse(body)})});
      data = await res.json().catch(() => ({}));
    } catch {
      state.sending = false;
      openCheckout('Geen verbinding. Je bestelling is misschien niet aangekomen. Probeer het nog eens; je bestelt dan niet dubbel.');
      return;
    }
    state.sending = false;
    if (res.ok && typeof data?.number === 'string') {
      const eigen = newEigen(), route = state.route, requestId = state.pending.requestId;
      if (askPush) { await permission; if (Notification.permission === 'granted') await subscribePush(requestId); }
      const opened = (newBill() || eigen) && data.group?.code ? {token: state.pay.token, name: eigen ? 'Rekening van ' + state.guest.name.trim() : state.pay.billName.trim(), code: data.group.code, ...(eigen ? {kind: 'eigen', at: Date.now()} : {})} : null;
      state.carts[route] = []; state.pending = null; state.chosen = ''; save(); render();
      // Zelf een rekening geopend: onthouden op dit toestel, en vanaf nu bestelt deze gast zelf ook op de rekening.
      if (opened) { rememberBill(opened); state.groupCode = opened.code; state.pay = {method: eigen ? 'eigen' : 'ideal', mode: 'nieuw', billName: '', limit: '', warn: '', code: '', token: ''}; save(); fetchOptions(); if (!eigen) return openBillOpened(data, opened); }
      // Groepsrekening of nul euro gekozen: niets af te rekenen.
      if (data.group || data.toPayCents === 0 || data.paid) return kiosk ? kioskDone(data) : openReceipt(data, {requestId});
      return kiosk ? kioskPay(requestId, data) : startPayment(requestId, data);
    }
    const message = typeof data?.error === 'string' ? data.error : 'Je bestelling kon nu niet worden verstuurd. Probeer het opnieuw.';
    if (data?.reason === 'groep' || data?.reason === 'eigen-bedrag' || data?.reason === 'afhalen') { // groepscode of eigen bedrag past niet (meer): opnieuw ophalen
      state.pending = null; save();
      await fetchOptions();
      return openCheckout(message);
    }
    if (res.status === 409) { // de kaart is veranderd: opnieuw ophalen en laten nakijken
      state.pending = null; save();
      await fetchProducts();
      if (state.status === 'ready' && cart().length) openCheckout(message + ' De bedragen hieronder zijn bijgewerkt.');
      else { closeSheet(); toast(message); }
      return;
    }
    if (res.status < 500 && res.status !== 429) { state.pending = null; save(); }
    openCheckout(message);
  }

  // Betalen via Mollie. De backoffice maakt de betaling aan en geeft de betaalpagina van Mollie terug.
  async function startPayment(requestId, receipt) {
    openSheet('receipt', 'Betalen', h('div', {class: 'done'}, h('p', {text: 'De betaalpagina wordt klaargezet…'})));
    let res, d;
    try {
      res = await fetch(backoffice + '/api/public/payments', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({requestId, page: location.pathname})});
      d = await res.json().catch(() => ({}));
    } catch {
      return openReceipt(receipt, {requestId, problem: 'Geen verbinding met de betaalpagina. Probeer het nog eens; je bestelling blijft bewaard.'});
    }
    if (res.ok && typeof d.checkoutUrl === 'string' && /^https:\/\//.test(d.checkoutUrl)) { location.assign(d.checkoutUrl); return; }
    if (res.ok && d.paid && typeof d.receipt?.number === 'string') return openReceipt(d.receipt, {requestId});
    if (d.unavailable) return openReceipt(receipt, {requestId, unavailable: true});
    openReceipt(receipt, {requestId, problem: (typeof d.error === 'string' ? d.error : 'Betalen lukt nu niet. Probeer het zo opnieuw.') + (typeof d.detail === 'string' && d.detail ? ' (' + d.detail.slice(0, 200) + ')' : '')});
  }

  // Terug van Mollie (?bestelling=…): de backoffice vraagt de stand op bij Mollie. Even wachten als de bank nog bezig is.
  function checkReturn() {
    const params = new URLSearchParams(location.search), id = params.get('bestelling');
    if (!id) return;
    params.delete('bestelling');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) checkPayment(id, 0);
  }
  async function checkPayment(id, attempt) {
    if (attempt > 0 && $('sheet').hidden) return; // de gast heeft het paneel gesloten
    if (attempt === 0) openSheet('receipt', 'Betalen', h('div', {class: 'done'}, h('p', {text: 'We controleren je betaling…'})));
    let res, d = null;
    try {
      res = await fetch(backoffice + '/api/public/payments?bestelling=' + encodeURIComponent(id), {headers: {Accept: 'application/json'}, cache: 'no-store'});
      d = await res.json().catch(() => null);
    } catch {}
    if (!res?.ok || typeof d?.number !== 'string') {
      return openSheet('receipt', 'Betalen', h('div', {class: 'done'}, h('p', {class: 'honest', role: 'alert', text: typeof d?.error === 'string' ? d.error : 'We konden je betaling nu niet controleren.'})),
        [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: () => checkPayment(id, 0), text: 'Opnieuw controleren'}),
          h('button', {type: 'button', class: 'text-button', onclick: closeSheet, text: 'Terug naar de kaart'})]);
    }
    if (d.paid) return openReceipt(d, {requestId: id});
    if (d.payment?.status === 'open' && attempt < 8) { setTimeout(() => checkPayment(id, attempt + 1), 1500); return; }
    openReceipt(d, {requestId: id, unavailable: d.payment && !d.payment.available, recheck: d.payment?.status === 'open',
      problem: d.payment?.status === 'mislukt' ? 'De betaling is niet gelukt of afgebroken. Je kunt het opnieuw proberen.'
        : d.payment?.status === 'open' ? 'We hebben je betaling nog niet binnen. Ben je klaar met betalen? Controleer het dan zo nog eens.' : null});
  }

  // Bon met de bedragen zoals de backoffice ze heeft vastgelegd, met de stand van het betalen.
  function openReceipt(r, {requestId, unavailable = false, problem = null, recheck = false} = {}) {
    const lines = Array.isArray(r.lines) ? r.lines : [];
    const group = !!r.group, own = !group && Number.isSafeInteger(r.chosenCents);
    const due = group ? 0 : Number.isSafeInteger(r.toPayCents) ? r.toPayCents : r.totalCents;
    const paid = r.paid === true, settled = paid || group || due === 0;
    const eigen = r.bill?.kind === 'eigen';
    const note = eigen ? (r.bill.over ? `Let op: er staat nu ${money(r.bill.spentCents)} op je rekening. Dat is meer dan je grens van ${money(r.bill.warnCents)}.` : `Er staat nu ${money(r.bill.spentCents)} op je rekening. Na afloop reken je in één keer af.`)
      : group ? 'De gastheer rekent straks alles in één keer af.'
      : paid && r.paidWith === 'dividend' ? 'Betaald met je BB-saldo. Dank je wel!'
      : paid ? (r.test ? 'Proefbetaling in de testomgeving van Mollie: er is geen echt geld betaald.' : null)
      : due === 0 ? `Je koos ${money(0)}: er is niets af te rekenen. Fijn dat je er bent!`
      : unavailable ? 'Online betalen staat nog niet aan. Dit is een proefbestelling: er is niets betaald en er wordt nog niets klaargemaakt.' : null;
    const foot = [];
    if (!settled && !unavailable && requestId) {
      if (recheck) foot.push(h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: () => checkPayment(requestId, 0), text: 'Opnieuw controleren'}));
      foot.push(h('button', {type: 'button', class: recheck ? 'text-button' : 'primary', 'data-autofocus': !recheck, onclick: () => startPayment(requestId, r)},
        h('span', {text: problem && !recheck ? 'Opnieuw betalen' : 'Betalen'}), recheck ? null : h('b', {text: money(due)})));
    }
    // Op de rekening besteld en nog iets in het winkelmandje: dat nu afrekenen (winkelproducten kunnen niet op de rekening).
    if (eigen) { const mine = myBills().find(b => b.code === r.group?.code || b.code === state.groupCode); if (mine) foot.push(h('button', {type: 'button', class: 'secondary', onclick: () => openHolder(mine.token), text: 'Mijn rekening · afrekenen'})); }
    if (group && state.carts.winkel.length) foot.push(h('button', {type: 'button', class: 'secondary', onclick: payShopNow}, h('span', {text: 'Winkelproducten nu afrekenen'}), h('b', {text: '›'})));
    // Betaald of op de rekening: de melding „staat klaar” is de hoofdknop (aanzetten en sluiten in één tik).
    // Zelfscan in de winkel (wens eigenaar 13 november 2026): niets klaar te zetten, dus geen „Stuur mij een bericht als het klaar
    // staat”, maar „Veel plezier met je boodschappen!”. Afhalen op een later moment houdt het bericht wel.
    const shopNow = r.winkel === true && !r.pickup;
    if (settled && requestId && !shopNow && !kiosk) watchReady(requestId);
    const pushBox = settled && requestId && !shopNow ? pushBlock(requestId) : null, canPush = settled && requestId && !shopNow && pushState(requestId).can;
    if (canPush) foot.unshift(pushCloseButton(requestId, pushBox));
    foot.push(h('button', {type: 'button', class: foot.length ? 'text-button' : 'primary center', 'data-autofocus': !foot.length, onclick: shopNow && settled && zelfscan ? finishZelfscan : closeSheet, text: canPush ? 'Geen bericht nodig' : shopNow && settled ? 'Klaar' : 'Terug naar de kaart'}));
    openSheet('receipt', settled ? 'Tankjewol!' : 'Nog even betalen', h('div', {class: 'done'},
      settled ? h('div', {class: 'seal', svg: 'check'}) : null,
      h('p', {class: 'micro', text: 'Je bestelnummer'}),
      h('h3', {class: 'order-number', text: r.number}),
      h('p', {text: eigen ? 'Je bestelling staat op je eigen rekening. We gaan ermee aan de slag.' : group ? `Je bestelling staat op rekening van ${hostName()}${r.group.name ? ' (' + r.group.name + ')' : ''}. We gaan ermee aan de slag.`
        : shopNow && settled ? (paid ? 'Betaald! Veel plezier met je boodschappen.' : 'Veel plezier met je boodschappen!')
        : paid ? 'Betaald! Je bestelling is doorgegeven en we gaan ermee aan de slag.'
        : due === 0 ? 'Je bestelling is doorgegeven en we gaan ermee aan de slag.'
        : 'Je bestelling is goed aangekomen en wacht op betaling. We maken pas iets klaar als er betaald is.'}),
      problem ? h('p', {class: 'honest', role: 'alert', text: problem}) : null,
      r.pickup && typeof r.pickup.date === 'string' ? h('p', {class: 'pickup-note', text: `Ophalen in de winkel: ${dayName(r.pickup.date)} om ${r.pickup.time}, op naam van ${r.pickup.name}.`}) : null,
      h('div', {class: 'summary'},
        lines.map(l => h('div', {}, h('span', {text: `${l.quantity}× ${l.name}${Array.isArray(l.choices) && l.choices.length ? ' (' + l.choices.map(c => String(c).split(': ').pop()).join(', ') + ')' : ''}`}), h('span', {text: money(l.totalCents)}))),
        own ? h('div', {}, h('span', {text: 'Gemiddelde waarde'}), h('span', {text: money(r.totalCents)})) : null,
        // Eigen rekening (melding eigenaar 11 november 2026: „Jij betaalt nul euro is verwarrend”): het bedrag dat op je rekening komt.
        h('div', {}, h('b', {text: eigen ? 'Op je rekening' : group ? 'Jij betaalt' : own ? 'Jouw bedrag' : 'Totaal'}), h('b', {text: money(eigen ? r.totalCents : group ? 0 : own ? r.chosenCents : r.totalCents)}))),
      lines.every(l => ['9', '21'].includes(l.vat)) ? vatSummary(lines, group ? r.totalCents : own ? r.chosenCents : r.totalCents, eigen ? 'eigen' : group) : null,
      note ? h('p', {class: (unavailable && !settled) || r.bill?.over ? 'honest' : 'fine', role: r.bill?.over ? 'alert' : null, text: note}) : null,
      pushBox),
    foot);
  }

  // Pushmelding "Je bestelling staat klaar" (akkoord eigenaar 3 november 2026): ook als deze pagina dicht is.
  // De gast kiest het zelf; de backoffice bewaart de aanmelding 1 dag en stuurt de melding bij Gereed.
  const PUSH_KEY = 'bb-melding';
  const pushDone = id => { try { return sessionStorage.getItem(PUSH_KEY + ':' + id) === '1'; } catch { return false; } };
  const b64 = s => { const t = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t), c => c.charCodeAt(0)); };
  // Melding „Je bestelling staat klaar” (wens eigenaar 5 november 2026: zo belangrijk voor de werkwijze dat het de hoofdknop is).
  // pushState: kan het hier, is het al aangezet, of waarom niet. subscribePush: toestemming vragen en aanmelden bij de backoffice.
  // Keuze in het bestelscherm (melding eigenaar 14 november 2026), standaard aan en onthouden op dit toestel. Alleen bij eten en
  // drinken (daar wordt iets klaargemaakt), en alleen als deze browser meldingen kan tonen en ze niet heeft uitgezet.
  const NOTIFY_KEY = 'bb-melding';
  const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Notification.permission !== 'denied';
  const notifyOn = () => { try { return localStorage.getItem(NOTIFY_KEY) !== '0'; } catch { return true; } };
  const notifyWanted = () => !kiosk && state.route === 'menu' && pushPossible() && notifyOn();
  function notifyField() {
    if (kiosk || state.route !== 'menu' || !pushPossible()) return null;
    return h('div', {class: 'pickup guest remember notify'},
      h('label', {class: 'checkline'},
        h('input', {type: 'checkbox', checked: notifyOn(), onchange: e => { try { localStorage.setItem(NOTIFY_KEY, e.target.checked ? '1' : '0'); } catch { /* niet erg */ } }}),
        h('span', {text: 'Stuur mij een bericht als het klaar staat'})),
      h('p', {class: 'fine', text: 'Je telefoon vraagt één keer of meldingen mogen. Laat je de app open, dan zie je het hier ook.'}));
  }
  function pushState(requestId) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (pushDone(requestId)) return {done: true, text: 'Je krijgt een melding zodra het klaarstaat. Je mag deze pagina sluiten.'};
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
      return {text: ios && !standalone ? 'Melding op je iPhone? Zet deze pagina op je beginscherm (Deel → Zet op beginscherm) en open hem van daaruit. Of laat deze pagina open.'
        : 'Deze browser kan geen meldingen tonen. Houd je bestelnummer bij de hand; we roepen het ook om.'};
    if (Notification.permission === 'denied') return {text: 'Meldingen staan uit voor deze site. Je kunt ze aanzetten in de instellingen van je browser.'};
    return {can: true};
  }
  // Melodietje en trillen als de bestelling klaarstaat (wens eigenaar 5 november 2026). Een browser laat geluid alleen
  // toe na een tik van de gast; daarom zetten we het geluid klaar bij de knop „Stuur mij een bericht als het klaar staat”. Werkt zolang de
  // bestelpagina open is (ook op de achtergrond van het tabblad); is de pagina dicht, dan klinkt het gewone meldingsgeluid.
  const jingle = (() => {
    let ctx = null;
    return {
      unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { ctx = null; } },
      play() {
        try {
          this.unlock(); if (!ctx) return;
          // Vrolijk opgaand deuntje: sol, do, mi, sol (laatste noot iets langer).
          const notes = [[784, 0, .14], [1047, .15, .14], [1319, .30, .14], [1568, .45, .42]], start = ctx.currentTime + .02;
          for (const [freq, at, len] of notes) {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'triangle'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, start + at); gain.gain.linearRampToValueAtTime(.22, start + at + .02);
            gain.gain.exponentialRampToValueAtTime(.001, start + at + len);
            osc.connect(gain).connect(ctx.destination); osc.start(start + at); osc.stop(start + at + len + .05);
          }
        } catch { /* geen geluid: de melding zelf blijft */ }
      },
    };
  })();
  const VIBRATE = [200, 100, 200, 100, 500];
  // Groot in beeld (melding eigenaar 14 november 2026: „de klant krijgt geen bericht in zijn scherm”), met deuntje en trillen.
  // Eén keer per werkplek per bestelling (tag „P00099-barista”), of de melding nu via push of via de stand hieronder komt.
  const READY_KEY = 'bb-klaar', READY_HOURS = 4;
  const readyStore = () => { try { const v = JSON.parse(localStorage.getItem(READY_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  const readySave = v => { try { localStorage.setItem(READY_KEY, JSON.stringify(v)); } catch { /* niet erg */ } };
  function showReady(title, body, tag) {
    const store = readyStore(), shown = new Set(store.shown || []);
    if (tag && shown.has(tag)) return;
    if (tag) { shown.add(tag); store.shown = [...shown].slice(-40); readySave(store); }
    jingle.play();
    try { navigator.vibrate?.(VIBRATE); } catch { /* niet elke telefoon kan trillen (iPhone) */ }
    openSheet('klaar', title, h('div', {class: 'done'}, h('div', {class: 'seal', svg: 'check'}), h('h3', {text: title}), h('p', {text: body})),
      [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: closeSheet, text: 'Ik kom eraan'})]);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'boerbart-klaar') return;
    showReady(typeof event.data.title === 'string' ? event.data.title : 'Je bestelling staat klaar',
      typeof event.data.body === 'string' ? event.data.body : 'Je kunt je bestelling ophalen.', typeof event.data.tag === 'string' ? event.data.tag : '');
  });
  // Zonder pushmelding (melding eigenaar 14 november 2026: „melding voor de gast werkt nog niet”): zolang de bestelapp open is,
  // vraagt hij elke paar seconden of de keuken of de bar de bestelling klaar heeft (GET /api/public/push?bestelling=…, alleen de
  // database). Hooguit 4 uur na het bestellen; niet bij zelfscannen in de winkel.
  let readyTimer = null;
  function watchReady(requestId) {
    if (!requestId) return;
    const store = readyStore(); store.orders = {...(store.orders || {}), [requestId]: Date.now()}; readySave(store); pollReady();
  }
  async function pollReady() {
    clearTimeout(readyTimer); readyTimer = null;
    const store = readyStore(), orders = {...(store.orders || {})}, now = Date.now();
    for (const [id, at] of Object.entries(orders)) if (!(now - at < READY_HOURS * 3600000)) delete orders[id];
    if (Object.keys(orders).length !== Object.keys(store.orders || {}).length) { store.orders = orders; readySave(store); }
    if (!Object.keys(orders).length) return;
    if (document.visibilityState === 'visible') {
      for (const id of Object.keys(orders)) {
        try {
          const r = await fetch(backoffice + '/api/public/push?bestelling=' + encodeURIComponent(id), {headers: {Accept: 'application/json'}, cache: 'no-store'});
          if (r.status === 404) { const s = readyStore(); delete (s.orders || {})[id]; readySave(s); continue; }
          const d = await r.json().catch(() => ({}));
          for (const x of Array.isArray(d.ready) ? d.ready : []) if (typeof x?.title === 'string' && typeof x?.body === 'string') showReady(x.title, x.body, String(x.tag || ''));
        } catch { /* even geen verbinding: straks opnieuw */ }
      }
    }
    readyTimer = setTimeout(pollReady, 6000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollReady(); });
  if (!kiosk) setTimeout(pollReady, 1500); // bij het openen: lopende bestellingen van de afgelopen uren weer volgen
  async function subscribePush(requestId) {
    try {
      // Ook als de telefoon het niet eens vroeg, zoals in een venster dat een andere app opende (melding eigenaar 14 november 2026).
      if (await Notification.requestPermission() !== 'granted') return 'Geen melding: meldingen mogen hier niet. Open de bestelapp in Chrome of vanaf je startscherm. Laat je deze pagina open, dan zie je het hier zodra het klaarstaat.';
      const key = await fetch(backoffice + '/api/public/push', {headers: {Accept: 'application/json'}, cache: 'no-store'}).then(r => r.json());
      if (!key?.available || typeof key.publicKey !== 'string') throw new Error('niet beschikbaar');
      const reg = await navigator.serviceWorker.register('bestellen-sw.js');
      await navigator.serviceWorker.ready;
      // Een eerdere aanmelding met een andere sleutel blokkeert een nieuwe (melding eigenaar 14 november 2026: toestemming gegeven,
      // maar geen aanmelding aangekomen). Dan eerst de oude afmelden.
      const want = b64(key.publicKey);
      let sub = await reg.pushManager.getSubscription();
      const have = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (sub && have && (have.length !== want.length || have.some((v, i) => v !== want[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: want});
      const res = await fetch(backoffice + '/api/public/push', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({requestId, subscription: sub.toJSON()})});
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return typeof d.error === 'string' ? d.error : 'Aanmelden lukte niet. Houd je bestelnummer bij de hand.';
      try { sessionStorage.setItem(PUSH_KEY + ':' + requestId, '1'); } catch { /* niet erg */ }
      return null;
    } catch (e) {
      // De reden erbij (bijvoorbeeld AbortError of NotAllowedError), zodat we kunnen zien wat de telefoon weigert.
      return `Meldingen lukken nu niet op deze telefoon (${String(e?.name || 'fout').slice(0, 40)}). Laat deze pagina open: dan zie je het hier zodra het klaarstaat.`;
    }
  }
  function pushBlock(requestId) {
    const box = h('div', {class: 'push', 'aria-live': 'polite'}), st = pushState(requestId);
    if (!st.can) box.replaceChildren(h('p', {class: st.done ? 'push-on' : 'fine', text: st.text}));
    return box;
  }
  /** Hoofdknop onder de bon: melding aanzetten én sluiten in één tik. Lukt de melding niet, dan blijft het paneel open met de reden. */
  function pushCloseButton(requestId, box) {
    const button = h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: async () => {
      button.disabled = true; button.textContent = 'Even geduld…';
      jingle.unlock();
      const problem = await subscribePush(requestId);
      if (!problem) { closeSheet(); toast('Je krijgt een melding zodra het klaarstaat.'); return; }
      box.replaceChildren(h('p', {class: 'honest', text: problem})); button.remove();
    }}, 'Stuur mij een bericht als het klaar staat'); // wens eigenaar 11 november 2026: duidelijker dan „We sturen een melding”
    return button;
  }


  let toastTimer;
  // ---- Zelfservicekassa ----
  // Afrekenen (wens eigenaar 9 november 2026): niet contant op de tablet. De tablet toont een QR-code naar de betaalpagina op
  // de eigen telefoon (bestellen.html?betaal=<aanvraagnummer>). Daar betaalt de gast met iDEAL, of een lid met een gekoppelde
  // telefoon met zijn BB-saldo. De tablet ziet vanzelf dat er betaald is.
  let kioskPoll = null, kioskReset = null;
  const due = r => Number.isSafeInteger(r?.toPayCents) ? r.toPayCents : r?.totalCents;
  function kioskPayButtons() {
    const disabled = state.sending || !!chosenProblem();
    return [
      h('button', {type: 'button', class: 'primary', 'data-autofocus': true, disabled, onclick: () => placeOrder()},
        h('span', {text: state.sending ? 'Even geduld…' : phoneSized() ? 'Afrekenen' : 'Afrekenen met je telefoon'}), h('b', {text: chosenProblem() === EMPTY_WORTH ? '' : money(toPay())})),
    ];
  }
  function stopPoll() { clearTimeout(kioskPoll); kioskPoll = null; }
  // De backoffice vraagt de stand op (bij Mollie, of na betalen met BB-saldo); elke 3 seconden, hooguit 15 minuten.
  function pollPaid(requestId) {
    stopPoll();
    const until = Date.now() + 15 * 60000;
    const tick = async () => {
      if (Date.now() > until) return resetKiosk();
      try {
        const res = await fetch(backoffice + '/api/public/payments?bestelling=' + encodeURIComponent(requestId), {headers: {Accept: 'application/json'}, cache: 'no-store'});
        const d = await res.json().catch(() => null);
        if (res.ok && d?.paid) return kioskDone(d);
      } catch {}
      kioskPoll = setTimeout(tick, 3000);
    };
    kioskPoll = setTimeout(tick, 3000);
  }
  // Altijd de betaalpagina bestellen.html, ook vanaf de eigen pagina zelfkassa.html (12 november 2026): de gast betaalt op de eigen
  // telefoon in de gewone bestelpagina, niet in de tablet-zelfkassa.
  const payPageUrl = requestId => location.origin + location.pathname.replace(/zelfkassa\.html$/, 'bestellen.html') + '?betaal=' + encodeURIComponent(requestId);
  // Zelfkassa op een telefoon (melding eigenaar 9 november 2026: iemand scant de tabletlink met de eigen telefoon; dan is een
  // QR-code om met je telefoon te betalen onzin). Een klein scherm betaalt meteen hier: de betaalpagina met iDEAL of BB-saldo.
  const phoneSized = () => Math.min(screen.width || innerWidth, screen.height || innerHeight) < 600;
  function kioskPay(requestId, receipt) {
    if (phoneSized()) { stopPoll(); state.carts.winkel = []; state.pending = null; save(); render(); return openPayPage(requestId); }
    openSheet('receipt', 'Scan en betaal', h('div', {class: 'done kiosk-qr'},
      h('p', {class: 'micro', text: 'Bestelnummer ' + receipt.number}),
      h('h3', {class: 'order-number', text: money(due(receipt))}),
      h('img', {class: 'qr', src: backoffice + '/api/public/qr?url=' + encodeURIComponent(payPageUrl(requestId)), alt: 'QR-code om te betalen', width: '260', height: '260'}),
      h('p', {text: 'Scan de code met de camera van je telefoon. Betaal via het betaalverzoek, of als lid met je BB-saldo. Dit scherm ziet vanzelf dat je betaald hebt.'})),
    [h('button', {type: 'button', class: 'text-button', onclick: resetKiosk, text: 'Stoppen'})]);
    pollPaid(requestId);
  }

  // Betaalpagina op de eigen telefoon (?betaal=<aanvraagnummer>), na het scannen van de QR-code op de winkeltablet.
  async function openPayPage(id) {
    openSheet('receipt', 'Betalen', h('div', {class: 'done'}, h('p', {text: 'Je bestelling wordt opgehaald…'})));
    let res, d = null;
    try {
      res = await fetch(backoffice + '/api/public/payments?bestelling=' + encodeURIComponent(id), {headers: {Accept: 'application/json'}, cache: 'no-store'});
      d = await res.json().catch(() => null);
    } catch {}
    if (!res?.ok || typeof d?.number !== 'string') return openSheet('receipt', 'Betalen', h('div', {class: 'done'},
      h('p', {class: 'honest', role: 'alert', text: typeof d?.error === 'string' ? d.error : 'We konden je bestelling nu niet ophalen. Scan de code nog eens.'})),
      [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: () => openPayPage(id), text: 'Opnieuw proberen'})]);
    if (d.paid) return openReceipt(d, {requestId: id});
    await fetchMember();
    const m = state.member, amount = due(d), enough = !!m && m.availableCents >= amount;
    const lines = Array.isArray(d.lines) ? d.lines : [];
    let problem = null;
    const draw = (busy = false) => openSheet('receipt', 'Betalen', h('div', {class: 'done pay-page'},
      h('p', {class: 'micro', text: 'Bestelnummer ' + d.number}),
      h('h3', {class: 'order-number', text: money(amount)}),
      lines.length ? h('ul', {class: 'pay-lines'}, ...lines.map(l => h('li', {text: `${l.quantity}× ${l.name}`}))) : null,
      m ? h('p', {text: enough ? `Hoi ${m.name}! Je kunt nog ${money(m.availableCents)} besteden met je rentesaldo en BB-saldo.` : `Hoi ${m.name}! Je saldo is niet genoeg (nog ${money(m.availableCents)}); betaal met iDEAL.`})
        : h('p', {class: 'fine', text: 'Lid van Boer Bart? Koppel deze telefoon via je ledenpagina (knop Zelfkassa), dan kun je hier met je BB-saldo betalen.'}),
      problem ? h('p', {class: 'honest', role: 'alert', text: problem}) : null),
    [...(enough ? [h('button', {type: 'button', class: 'primary', 'data-autofocus': true, disabled: busy, onclick: payWithBalance},
        h('span', {text: busy ? 'Even geduld…' : 'Betalen met je saldo'}), h('b', {text: money(amount)}))] : []),
      h('button', {type: 'button', class: enough ? 'secondary' : 'primary', 'data-autofocus': !enough, disabled: busy, onclick: () => startPayment(id, d)},
        h('span', {text: 'Betalen via betaalverzoek'}), h('b', {text: money(amount)}))]);
    async function payWithBalance() {
      draw(true);
      let r, x = {};
      try {
        r = await fetch(backoffice + '/api/public/payments', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          body: JSON.stringify({requestId: id, method: 'bb', dividend: memberToken(), ...(state.pay.first === 'bb' ? {saldoEerst: 'bb'} : {})})});
        x = await r.json().catch(() => ({}));
      } catch { r = null; }
      if (r?.ok && x.paid && typeof x.receipt?.number === 'string') { fetchMember(); return openReceipt({...x.receipt, paid: true, paidWith: 'dividend'}, {requestId: id}); }
      problem = typeof x.error === 'string' ? x.error : 'Betalen met je saldo lukt nu niet. Probeer het opnieuw of betaal via het betaalverzoek.';
      draw(false);
    }
    draw();
  }
  function checkPayLink() {
    const params = new URLSearchParams(location.search), id = params.get('betaal');
    if (!id || kiosk) return;
    params.delete('betaal');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) openPayPage(id);
  }
  function kioskDone(r) {
    stopPoll(); clearTimeout(kioskReset);
    openSheet('receipt', 'Tankjewol!', h('div', {class: 'done'},
      h('div', {class: 'seal', svg: 'check'}),
      h('p', {class: 'micro', text: 'Je bestelnummer'}),
      h('h3', {class: 'order-number', text: r.number}),
      h('p', {text: 'Betaald! Neem je boodschappen gerust mee. Fijne dag!'})),
    [h('button', {type: 'button', class: 'primary center', 'data-autofocus': true, onclick: resetKiosk, text: 'Volgende klant'})]);
    kioskReset = setTimeout(resetKiosk, 20000);
  }
  function resetKiosk() {
    stopPoll(); clearTimeout(kioskReset);
    state.carts.winkel = []; state.pending = null; state.chosen = ''; save();
    if (!$('sheet').hidden) closeSheet();
    render(); window.scrollTo({top: 0});
  }
  // Na 2 minuten niets doen: het mandje weer leeg voor de volgende klant (niet tijdens het wachten op een betaling).
  if (kiosk) {
    let idle = null;
    const touch = () => { clearTimeout(idle); idle = setTimeout(() => { if (!kioskPoll) resetKiosk(); }, 120000); };
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, touch, {passive: true});
    touch();
  }

  // Zelfscan klaar (wens eigenaar 13 november 2026: „bij de zelfscan mag de app afsluiten”). Niet zelf sluiten (melding eigenaar
  // 14 november 2026: „je gaat nog terug naar eten en drinken”): na het betalen opent de bank-app de zelfscan vaak in een nieuw
  // tabblad, en sluiten liet dan een ouder tabblad met de bestelpagina zien. Je blijft in de lege zelfscan, met de melding.
  function finishZelfscan() {
    closeSheet();
    setTimeout(() => toast('Klaar! Je kunt de app nu sluiten.'), 300);
  }
  function toast(text) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  $('open-basket').addEventListener('click', openBasket);
  $('basket-bar-button').addEventListener('click', openBasket);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.status !== 'loading') fetchProducts(); });
  setInterval(() => { if (document.visibilityState === 'visible' && $('sheet').hidden && !state.sending) fetchProducts(); }, REFRESH_MS);

  // „Mogen we Bestellen aan je startscherm toevoegen?” (wens eigenaar 8 november 2026): als de pagina in de browser is geopend en nog
  // niet als app op het startscherm staat. Niet op de zelfservicezuil. „Niet nu” verbergt de vraag een dag.
  (function startschermVraag() {
    if (kiosk) return;
    if (expiredApp) {
      const box = h('div', {class: 'startscherm-vraag verlopen', role: 'status'},
        h('div', {}, h('b', {text: 'Deze app is verlopen'}), h('span', {text: 'Je koos ervoor hem tijdelijk te houden. Alles wat hij op deze telefoon bewaarde, is gewist. Verwijderen: houd het icoontje ingedrukt en kies „Verwijderen” of „App verwijderen”.'})),
        h('div', {class: 'startscherm-knoppen'}, h('button', {type: 'button', class: 'startscherm-ja', text: 'Toch houden', onclick: () => { try { localStorage.removeItem(KEEP_KEY); } catch {} box.remove(); }})));
      const anchor = $('routes'); anchor.parentNode.insertBefore(box, anchor);
      return;
    }
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) return;
    // „Niet nu”: de vraag komt pas na een dag terug (wens eigenaar 8 november 2026).
    try { if (Date.now() - Number(localStorage.getItem('startscherm-niet-nu:Bestellen') || 0) < 864e5) return; } catch {}
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua), mobile = /Android|iPhone|iPad|iPod/.test(ua);
    let event = null, box = null;
    const close = () => { box && box.remove(); box = null; };
    const later = () => { try { localStorage.setItem('startscherm-niet-nu:Bestellen', String(Date.now())); } catch {} close(); };
    const place = el => { const anchor = $('routes'); anchor.parentNode.insertBefore(el, anchor); };
    // Twee keuzes (wens eigenaar 8 november 2026): „Ja, prima” of „Niet nu”. Daarna: hoe lang wil je hem houden?
    // Kan de browser het niet zelf toevoegen, dan volgt de korte uitleg.
    const how = ios ? 'Tik onderin op Delen (het vierkantje met de pijl omhoog) en kies „Zet op beginscherm”.' : 'Open het menu van je browser (⋮) en kies „Toevoegen aan startscherm” of „App installeren”.';
    const keep = async days => {
      try { if (days) localStorage.setItem(KEEP_KEY, String(Date.now() + days * 864e5)); else localStorage.removeItem(KEEP_KEY); } catch {}
      if (event) { const e = event; event = null; await e.prompt(); const c = await e.userChoice.catch(() => null); if (c && c.outcome === 'accepted') { close(); return; } }
      show('uitleg');
    };
    const show = (step = 'vraag') => {
      close();
      const text = step === 'uitleg' ? how : step === 'houden' ? 'Na die tijd wist de app alles wat hij op deze telefoon bewaarde. Het icoontje haal je zelf weg.' : 'Dan open je hem voortaan met één tik, net als een app.';
      const title = step === 'houden' ? 'Hoe lang wil je hem houden?' : 'Mogen we „Bestellen” aan je startscherm toevoegen?';
      const buttons = step === 'uitleg' ? [h('button', {type: 'button', class: 'startscherm-ja', text: 'Klaar', onclick: later})]
        : step === 'houden' ? [h('button', {type: 'button', class: 'startscherm-ja', text: 'Eén dag', onclick: () => keep(1)}), h('button', {type: 'button', class: 'startscherm-nee', text: 'Een week', onclick: () => keep(7)}), h('button', {type: 'button', class: 'startscherm-nee', text: 'Blijvend', onclick: () => keep(0)})]
        : [h('button', {type: 'button', class: 'startscherm-ja', text: 'Ja, prima', onclick: () => show('houden')}), h('button', {type: 'button', class: 'startscherm-nee', text: 'Niet nu', onclick: later})];
      box = h('div', {class: 'startscherm-vraag', role: 'dialog', 'aria-label': '„Bestellen” op je startscherm zetten'},
        h('div', {}, h('b', {text: title}), h('span', {text})), h('div', {class: 'startscherm-knoppen'}, buttons));
      place(box);
    };
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); event = e; if (!box) show(); });
    addEventListener('appinstalled', close);
    if (ios || mobile) show();
  })();

  load();
  // Zelfkassa-knop op de ledenpagina (wens eigenaar 7 november 2026): ?winkel=1 opent meteen het winkelmandje (boodschappen doen).
  (() => {
    const q = new URLSearchParams(location.search);
    if (!q.has('winkel')) return;
    q.delete('winkel'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    if (!kiosk) state.route = 'winkel';
  })();
  // Vanaf de website: #winkel opent het winkelmandje, #menu eten & drinken. Winkel niet online: eten en drinken, met uitleg.
  if (!shopHere) { state.route = 'menu'; state.carts.winkel = []; save(); if (location.hash === '#winkel') setTimeout(() => toast('De boerderijwinkel reken je af in de winkel zelf, met de zelfkassa.'), 300); }
  else if (location.hash === '#winkel' || kiosk) state.route = 'winkel';
  else if (location.hash === '#menu') state.route = 'menu';
  fetchProducts();
  fetchOptions();
  checkReturn();
  checkPayLink();
  // Telefoon gekoppeld via de ledenlink (?lidkoppeling=…): bewaren, uit het adres halen en het dividend ophalen.
  (() => {
    const q = new URLSearchParams(location.search), t = q.get('lidkoppeling');
    if (!t) return;
    q.delete('lidkoppeling'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    if (/^[A-Za-z0-9_-]{43}$/.test(t)) { try { localStorage.setItem(MEMBER_KEY, t); } catch {} state.pay.method = 'dividend'; toast('Deze telefoon is gekoppeld: je kunt nu betalen met je BB-saldo.'); }
  })();
  fetchMember();
  // Beheerlink van de rekeninghouder of een betaalverzoek (ook na terugkomst van Mollie).
  (() => {
    if (kiosk) return;
    const q = new URLSearchParams(location.search), token = q.get('rekening'), deel = q.get('deel');
    const join = q.get('meebetalen');
    if (token && /^[A-Za-z0-9_-]{32,64}$/.test(token)) openHolder(token);
    else if (deel && /^[0-9a-f-]{36}$/.test(deel)) openShare(deel, null, 1);
    else if (join && cleanCode(join)) openJoinPay(cleanCode(join));
  })();
})();
