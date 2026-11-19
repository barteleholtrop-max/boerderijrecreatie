// Vindbaarheid voor zoekmachines en AI (besluit eigenaar 4 november 2026): alles uit de backoffice, niets geraden.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jsonLd, staticSummary, injectSeo, icsCalendar, llmsTxt, robotsTxt, sitemapXml, offsetOn, realEvents} from '../tools/website-dev/seo.mjs';

const origin = 'https://www.example.nl';
const av = {
  contact: {phone: '06 54 60 20 41', email: 'info@example.nl', whatsapp: '', street: 'Dorpsstraat 1', postalCode: '1234 AB', city: 'Rotstergaast'},
  openingHours: [{weekday: 'maandag', hours: null}, {weekday: 'donderdag', hours: {open: '10:00', close: '18:00'}}, {weekday: 'zondag', hours: {open: '10:00', close: '18:00'}}],
  closedDays: [{date: '2026-12-25', note: 'Eerste kerstdag'}],
  events: [
    {id: 'ev-1', date: '2026-11-14', start: '11:00', end: '16:00', title: 'Boerenmarkt; op het erf', description: 'Met koffie, en iets lekkers', priceCents: 0, photo: '/api/public/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f', signup: {open: true, spotsLeft: null}},
    {id: 'ev-2', date: '2026-07-04', start: '19:00', end: '', title: 'Zomeravond', description: '', priceCents: 1250, signup: {open: false, spotsLeft: 0}},
    {id: 'voorbeeld-x', date: '2026-11-20', start: '10:00', end: '12:00', title: 'Voorbeeld', example: true},
    {id: 'kapot', date: 'morgen', start: '10:00', title: 'Zonder datum'},
  ],
};

test('zomer- en wintertijd in tijden voor zoekmachines', () => {
  assert.equal(offsetOn('2026-07-04', '19:00'), '+02:00');
  assert.equal(offsetOn('2026-11-14', '11:00'), '+01:00');
});
test('gestructureerde gegevens: bedrijf met adres, openingstijden, gesloten dag en echte evenementen', () => {
  const g = jsonLd(av, origin)['@graph'], b = g[0];
  assert.deepEqual(b['@type'], ['LocalBusiness', 'TouristAttraction']);
  assert.equal(b.address.streetAddress, 'Dorpsstraat 1'); assert.equal(b.address.postalCode, '1234 AB'); assert.equal(b.telephone, '06 54 60 20 41');
  const days = b.openingHoursSpecification.filter(o => o.dayOfWeek).map(o => o.dayOfWeek);
  assert.deepEqual(days, ['https://schema.org/Thursday', 'https://schema.org/Sunday'], 'maandag gesloten: niet als open');
  assert.ok(b.openingHoursSpecification.some(o => o.validFrom === '2026-12-25' && o.opens === '00:00'));
  const ev = g.filter(x => x['@type'] === 'Event');
  assert.deepEqual(ev.map(e => e.name), ['Boerenmarkt; op het erf', 'Zomeravond'], 'voorbeelden en kapotte data niet');
  assert.equal(ev[0].startDate, '2026-11-14T11:00:00+01:00'); assert.equal(ev[0].endDate, '2026-11-14T16:00:00+01:00');
  assert.deepEqual(ev[0].image, [origin + '/api/public/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f']);
  assert.equal(ev[1].offers.price, '12.50'); assert.equal(ev[1].offers.availability, 'https://schema.org/SoldOut');
  assert.equal(ev[1].endDate, undefined);
});
test('zonder adres en contact: geen verzonnen gegevens', () => {
  const b = jsonLd({openingHours: [], events: []}, origin)['@graph'][0];
  assert.equal(b.address, undefined); assert.equal(b.telephone, undefined); assert.equal(b.openingHoursSpecification, undefined);
});
test('pagina krijgt gegevens en een leesbare samenvatting, één keer, en veilig tegen HTML in teksten', () => {
  const html = '<html><head><title>x</title></head><body class="a"><div id="app"></div></body></html>';
  const out = injectSeo(html, {...av, events: [{...av.events[0], title: '<script>alert(1)</script>'}]}, origin);
  assert.match(out, /<script type="application\/ld\+json" data-seo="boerbart">/);
  assert.ok(!out.includes('<script>alert(1)</script>'), 'geen HTML uit gegevens in de pagina');
  assert.match(out, /<body class="a"><noscript>/); assert.match(out, /donderdag: 10:00–18:00/); assert.match(out, /maandag: gesloten/);
  assert.equal(injectSeo(out, av, origin), out, 'niet dubbel');
  assert.match(staticSummary(av), /Dorpsstraat 1, 1234 AB Rotstergaast/);
});
test('agendafeed: geldige iCalendar met tijdzone, escapes en gevouwen regels', () => {
  const ics = icsCalendar(av, origin, new Date('2026-11-04T08:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /UID:ev-1@www\.example\.nl/); assert.match(ics, /DTSTART;TZID=Europe\/Amsterdam:20261114T110000/);
  assert.ok(ics.includes('SUMMARY:Boerenmarkt\\; op het erf'), 'puntkomma ge-escaped'); assert.match(ics, /DTSTAMP:20261104T080000Z/);
  assert.match(ics, /DURATION:PT2H/, 'zonder eindtijd: twee uur');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'regel te lang: ' + line);
  assert.ok(!ics.includes('Voorbeeld'));
});
test('llms.txt, robots.txt en sitemap', () => {
  const l = llmsTxt(av, origin);
  assert.match(l, /^# Boerderijrecreatie/); assert.match(l, /Adres: Dorpsstraat 1, 1234 AB Rotstergaast/); assert.match(l, /donderdag: 10:00–18:00/);
  assert.match(l, /Zomeravond \(€ 12,50 p\.p\.\)/); assert.match(l, /Eerste kerstdag/);
  const r = robotsTxt(origin);
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) assert.match(r, new RegExp('User-agent: ' + bot));
  assert.match(r, /Allow: \/api\/public\/media\//); assert.match(r, /Sitemap: https:\/\/www\.example\.nl\/sitemap\.xml/);
  assert.match(sitemapXml(origin, '2026-11-04'), /<loc>https:\/\/www\.example\.nl\/<\/loc><lastmod>2026-11-04<\/lastmod>/);
  assert.equal(realEvents({}).length, 0);
});
