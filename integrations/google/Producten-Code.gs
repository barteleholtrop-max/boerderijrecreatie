/** Boer Bart — spreadsheetbrug v2. Alleen vanuit een vertrouwde server aanroepen. */
const BB = Object.freeze({
  spreadsheetId: '165dCMQTMfgYyRPCsgz7jTEUdeU6335rEugOhAyUp9NI',
  sheetName: 'Producten',
  headers: ['Productnaam', 'Afdeling', 'Prijs (€)', 'Controle', 'Opmerking', "Wix bron-ID('s)"]
});
const EXTRA_HEADERS=['Btw (%)','Werkafdeling','Beschikbaar','Foto','Allergenen (JSON)','Allergenen gecontroleerd','Bestelopties','Bestelvragen (JSON)'];
const FIELD_COLUMNS={name:0,department:1,priceCents:2,note:4,vat:6,station:7,available:8,photo:9,allergens:10,allergensChecked:11,orderOptions:12,optionGroups:13};

// Voer dit eenmaal handmatig uit. Voegt acht kolomkoppen toe, zonder bestaande productwaarden te wijzigen.
// De sleutel staat daarna onder Projectinstellingen > Scriptproperties.
function instellen() {
  const sheet=sheet_(true);
  const existing=sheet.getMaxColumns()>6?sheet.getRange(1,7,1,Math.min(8,sheet.getMaxColumns()-6)).getValues()[0]:[];
  if(existing.some((v,i)=>v!==''&&v!==EXTRA_HEADERS[i]))abort_('EXTRA_HEADERS_OCCUPIED');
  if(sheet.getMaxColumns()<14)sheet.insertColumnsAfter(sheet.getMaxColumns(),14-sheet.getMaxColumns());
  sheet.getRange(1,7,1,8).setValues([EXTRA_HEADERS]);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BB_API_KEY')) {
    props.setProperty('BB_API_KEY', Utilities.getUuid() + Utilities.getUuid());
  }
  console.log('Gereed. BB_API_KEY staat in Scriptproperties; deel deze niet in de chat.');
}

// Geen productgegevens of sleutel via een openbare GET.
function doGet() { return json_({ok: true, service: 'Boer Bart spreadsheetbrug', version: 2}); }

function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 100000) abort_('INVALID_REQUEST');
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (_) { abort_('INVALID_JSON'); }
    const key = PropertiesService.getScriptProperties().getProperty('BB_API_KEY');
    if (!key || !body || typeof body.key !== 'string' || !equal_(body.key, key)) abort_('UNAUTHORIZED');
    if (!['list', 'update'].includes(body.action)) abort_('INVALID_ACTION');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) abort_('BUSY');
    const sheet = sheet_();
    const count = sheet.getLastRow() - 1;
    if (count > 10000) abort_('TOO_MANY_ROWS');
    const range = count > 0 ? sheet.getRange(2, 1, count, 14) : null;
    const values = range ? range.getValues() : [];
    const formulas = range ? range.getFormulas() : [];
    const seen = new Set();
    const items = [];
    values.forEach((row, i) => {
      if (row.every(v => v === '')) return;
      const id = String(row[5]).trim();
      if (!id || seen.has(id)) abort_('MISSING_OR_DUPLICATE_ID');
      seen.add(id);
      items.push({index: i, product: product_(row, formulas[i])});
    });
    if (body.action === 'list') return json_({ok: true, schemaVersion:2, products: items.map(x => x.product)});
    if (typeof body.sourceId !== 'string' || typeof body.revision !== 'string') abort_('INVALID_REQUEST');
    const item = items.find(x => x.product.sourceId === body.sourceId);
    if (!item) abort_('NOT_FOUND');
    const patch = body.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) abort_('INVALID_PATCH');
    const fields = Object.keys(patch);
    if (!fields.length || fields.some(k => !Object.prototype.hasOwnProperty.call(FIELD_COLUMNS,k))) abort_('INVALID_PATCH');
    const candidate = Object.assign({}, item.product, patch);
    validate_(candidate);
    // Bij een onzekere vorige uitkomst: opnieuw lezen; niet automatisch schrijven.
    if (body.revision !== item.product.revision) abort_('CONFLICT');
    const rowNumber = item.index + 2;
    const target = sheet.getRange(rowNumber, 1, 1, 14);
    // Tweede controle vlak voor schrijven; formulecellen nooit vervangen.
    const latest = target.getValues()[0];
    const latestFormulas = target.getFormulas()[0];
    if (product_(latest, latestFormulas).revision !== body.revision) abort_('CONFLICT');
    if (latestFormulas.some(Boolean)) abort_('FORMULA_ROW_READ_ONLY');
    const next = latest.slice();
    fields.forEach(field=>{
      let value=candidate[field];
      if(field==='priceCents')value=value/100;
      if(field==='allergens'||field==='optionGroups')value=JSON.stringify(value);
      next[FIELD_COLUMNS[field]]=value;
    });
    // Controle, bron-ID en kolommen buiten A:N blijven behouden.
    next.forEach(v => { if (typeof v === 'string' && /^\s*=/.test(v)) abort_('FORMULA_TEXT_NOT_ALLOWED'); });
    target.setValues([next]);
    SpreadsheetApp.flush();
    const saved = product_(target.getValues()[0], target.getFormulas()[0]);
    return json_({ok: true, product: saved});
  } catch (err) {
    const code = err && err.bbCode ? err.bbCode : 'INTERNAL_ERROR';
    return json_({ok: false, code: code});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function sheet_(setup) {
  const sheet = SpreadsheetApp.openById(BB.spreadsheetId).getSheetByName(BB.sheetName);
  if (!sheet) abort_('SHEET_NOT_FOUND');
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (headers.some((v, i) => v !== BB.headers[i])) abort_('HEADERS_CHANGED');
  if(!setup){
    if(sheet.getMaxColumns()<14)abort_('RUN_SETUP_FIRST');
    const extra=sheet.getRange(1,7,1,8).getValues()[0];
    if(extra.some((v,i)=>v!==EXTRA_HEADERS[i]))abort_('RUN_SETUP_FIRST');
  }
  return sheet;
}
function product_(r, formulas) {
  const price = r[2];
  // Lege, tekstuele en ongeldige prijzen niet stilzwijgend naar nul omzetten.
  const cents = typeof price === 'number' && Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null;
  return {sourceId: String(r[5]).trim(), name: String(r[0]), department: String(r[1]),
    priceCents: cents, note: String(r[4]), sourceCheck: String(r[3]),
    vat:String(r[6]??''),station:String(r[7]??''),available:bool_(r[8],true),photo:String(r[9]??''),
    allergens:array_(r[10]),allergensChecked:bool_(r[11],false),orderOptions:String(r[12]??''),optionGroups:array_(r[13]),
    revision: hash_(JSON.stringify([r, formulas]))};
}
function validate_(p) {
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 180 ||
      typeof p.department !== 'string' || p.department.length > 100 ||
      !Number.isInteger(p.priceCents) || p.priceCents < 0 || p.priceCents > 10000000 ||
      typeof p.note !== 'string' || p.note.length > 4999 || !validExtras_(p)) abort_('INVALID_PRODUCT');
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function equal_(a, b) {
  const x = hash_(a), y = hash_(b); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function abort_(code) { const e = new Error(code); e.bbCode = code; throw e; }
function json_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }

function bool_(value, fallback){
  if(value===''||value===undefined||value===null)return fallback;
  if(value===true||String(value).toLowerCase()==='true')return true;
  if(value===false||String(value).toLowerCase()==='false')return false;
  abort_('INVALID_BOOLEAN');
}
function array_(value){
  if(value===''||value===undefined||value===null)return [];
  try{const parsed=JSON.parse(String(value));if(Array.isArray(parsed))return parsed;}catch(_){}
  abort_('INVALID_JSON_CELL');
}
function validExtras_(p){
  const names=['Gluten','Schaaldieren','Eieren','Vis','Pinda’s','Soja','Melk','Noten','Selderij','Mosterd','Sesam','Sulfiet','Lupine','Weekdieren'];
  return ['', '9','21'].includes(p.vat)&&['','kok','barista','winkel','geen'].includes(p.station)&&
   typeof p.available==='boolean'&&typeof p.allergensChecked==='boolean'&&typeof p.photo==='string'&&p.photo.length<2000&&
   (p.photo===''||/^https:\/\//i.test(p.photo)||/^\/api\/media\/[a-f0-9-]{36}$/.test(p.photo))&&
   Array.isArray(p.allergens)&&p.allergens.length<=14&&p.allergens.every(x=>names.includes(x))&&
   typeof p.orderOptions==='string'&&p.orderOptions.length<=3000&&Array.isArray(p.optionGroups)&&p.optionGroups.length<=20&&JSON.stringify(p.optionGroups).length<=45000&&p.optionGroups.every(g=>
    g&&typeof g.id==='string'&&g.id.length<=100&&typeof g.title==='string'&&g.title.trim()&&g.title.length<=100&&typeof g.required==='boolean'&&
    Array.isArray(g.choices)&&g.choices.length>0&&g.choices.length<=30&&g.choices.every(c=>
     c&&typeof c.id==='string'&&c.id.length<=100&&typeof c.label==='string'&&c.label.trim()&&c.label.length<=100&&Number.isInteger(c.extraCents)&&c.extraCents>=0&&c.extraCents<=1000000));
}
