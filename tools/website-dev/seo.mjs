// Vindbaarheid voor zoekmachines en AI (besluit eigenaar 4 november 2026, stap 1). Pure functies: alles komt uit de
// openbare gegevens van de backoffice (GET /api/public/availability: openingstijden, gesloten dagen, evenementen en
// contact/adres). Geen bedrijfsgegevens in de code, behalve de naam en de korte omschrijving die ook op de site staan.
// - jsonLd: gestructureerde gegevens (schema.org) voor het bedrijf en de evenementen;
// - staticSummary: dezelfde informatie als gewone tekst, voor robots die geen JavaScript uitvoeren;
// - icsCalendar: agendafeed (/agenda.ics) om op te abonneren;
// - llmsTxt, robotsTxt en sitemapXml.
export const NAME = 'Boerderijrecreatie';
export const DESCRIPTION = 'Speelboerderij, boerderijwinkel en Ite by Boerderijrecreatie in Rotstergaast, Friesland. Goed eten, vrij spelen en samen genieten op het erf.';
const DAYS = {maandag: 'Monday', dinsdag: 'Tuesday', woensdag: 'Wednesday', donderdag: 'Thursday', vrijdag: 'Friday', zaterdag: 'Saturday', zondag: 'Sunday'};
const TZ = 'Europe/Amsterdam';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = v => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/** Alleen echte, toekomstige evenementen met een geldige datum (voorbeelden van de proefomgeving tellen niet). */
export function realEvents(av) {
  return (Array.isArray(av?.events) ? av.events : []).filter(e => e && !e.example && isDay(e.date) && isTime(e.start) && typeof e.title === 'string' && e.title.trim());
}
function address(c = {}) {
  if (!c.street && !c.city) return null;
  return {'@type': 'PostalAddress', ...(c.street ? {streetAddress: c.street} : {}), ...(c.postalCode ? {postalCode: c.postalCode} : {}), ...(c.city ? {addressLocality: c.city} : {}), addressRegion: 'Friesland', addressCountry: 'NL'};
}
/** UTC-verschil van Nederland op die dag, als "+01:00" of "+02:00" (zomer- en wintertijd). */
export function offsetOn(day, time = '12:00') {
  const d = new Date(`${day}T${time}:00Z`);
  const local = new Intl.DateTimeFormat('sv-SE', {timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(d);
  const diff = ((Number(local.slice(0, 2)) * 60 + Number(local.slice(3, 5))) - (d.getUTCHours() * 60 + d.getUTCMinutes()) + 1440) % 1440;
  return `+${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
}
const iso = (day, time) => `${day}T${time}:00${offsetOn(day, time)}`;
const absolute = (origin, url) => !url ? null : /^https:\/\//.test(url) ? url : url.startsWith('/') ? origin + url : null;

export function jsonLd(av, origin) {
  const c = av?.contact || {}, place = address(c);
  const hours = (Array.isArray(av?.openingHours) ? av.openingHours : []).filter(h => h?.hours?.open && h?.hours?.close && DAYS[h.weekday])
    .map(h => ({'@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/' + DAYS[h.weekday], opens: h.hours.open, closes: h.hours.close}));
  // Gesloten dagen: opens en closes op 00:00 is de afspraak van schema.org voor „gesloten op die dag”.
  const closed = (Array.isArray(av?.closedDays) ? av.closedDays : []).filter(d => isDay(d?.date))
    .map(d => ({'@type': 'OpeningHoursSpecification', validFrom: d.date, validThrough: d.date, opens: '00:00', closes: '00:00'}));
  const business = {'@type': ['LocalBusiness', 'TouristAttraction'], '@id': origin + '/#boerbart', name: NAME, description: DESCRIPTION, url: origin + '/',
    ...(c.phone ? {telephone: c.phone} : {}), ...(c.email ? {email: c.email} : {}), ...(place ? {address: place} : {}),
    ...(hours.length || closed.length ? {openingHoursSpecification: [...hours, ...closed]} : {}), isAccessibleForFree: true};
  const events = realEvents(av).map(e => ({'@type': 'Event', name: e.title, ...(e.description ? {description: e.description} : {}),
    startDate: iso(e.date, e.start), ...(isTime(e.end) && e.end > e.start ? {endDate: iso(e.date, e.end)} : {}),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {'@type': 'Place', name: NAME, ...(place ? {address: place} : {})}, organizer: {'@id': origin + '/#boerbart'},
    ...(absolute(origin, e.photo) ? {image: [absolute(origin, e.photo)]} : {}),
    offers: {'@type': 'Offer', price: ((Number(e.priceCents) || 0) / 100).toFixed(2), priceCurrency: 'EUR', url: origin + '/', availability: e.signup?.spotsLeft === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock'}}));
  return {'@context': 'https://schema.org', '@graph': [business, ...events]};
}
const dutchDate = day => new Intl.DateTimeFormat('nl-NL', {timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(day + 'T12:00:00Z'));
function hoursLines(av) {
  return (Array.isArray(av?.openingHours) ? av.openingHours : []).filter(h => DAYS[h?.weekday]).map(h => `${h.weekday}: ${h.hours?.open && h.hours?.close ? `${h.hours.open}–${h.hours.close}` : 'gesloten'}`);
}
/** Gewone tekst voor robots zonder JavaScript (in <noscript>): dezelfde gegevens als op de site, niets extra's. */
export function staticSummary(av) {
  const c = av?.contact || {}, ev = realEvents(av).slice(0, 20), hrs = hoursLines(av);
  return `<noscript><section aria-label="Praktische informatie"><h1>${esc(NAME)}</h1><p>${esc(DESCRIPTION)}</p>`
    + (c.street || c.city ? `<p>${esc([c.street, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</p>` : '')
    + (c.phone || c.email ? `<p>${[c.phone && 'Telefoon: ' + esc(c.phone), c.email && 'E-mail: ' + esc(c.email)].filter(Boolean).join(' · ')}</p>` : '')
    + (hrs.length ? `<h2>Openingstijden</h2><ul>${hrs.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '')
    + (ev.length ? `<h2>Agenda</h2><ul>${ev.map(e => `<li>${esc(dutchDate(e.date))} ${esc(e.start)}${isTime(e.end) ? '–' + esc(e.end) : ''}: ${esc(e.title)}${e.description ? ' — ' + esc(e.description) : ''}</li>`).join('')}</ul><p><a href="/agenda.ics">Agenda als kalenderfeed (abonneren)</a></p>` : '')
    + '<p>Bestellen: <a href="/bestellen.html">bestelpagina</a>.</p></section></noscript>';
}
/** Plaatst de gestructureerde gegevens en de samenvatting in een HTML-pagina (alleen als die er nog niet in staan). */
export function injectSeo(html, av, origin) {
  if (html.includes('data-seo="boerbart"')) return html;
  const ld = `<script type="application/ld+json" data-seo="boerbart">${JSON.stringify(jsonLd(av, origin)).replace(/</g, '\\u003c')}</script>`
    + `<link rel="alternate" type="text/calendar" title="Agenda ${esc(NAME)}" href="/agenda.ics">`;
  return html.replace(/<\/head>/i, ld + '</head>').replace(/<body([^>]*)>/i, (m) => m + staticSummary(av));
}

// ---- Agendafeed (iCalendar, RFC 5545) -------------------------------------------------------------------------
const icsText = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Regels langer dan 75 bytes worden gevouwen (vervolgregel begint met een spatie), zonder een UTF-8-teken te breken. */
function fold(line) {
  const out = []; let cur = '', size = 0;
  for (const ch of line) { const n = Buffer.byteLength(ch); if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; } cur += ch; size += n; }
  out.push(cur); return out.join('\r\n ');
}
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const local = (day, time) => day.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
export function icsCalendar(av, origin, now = new Date()) {
  const host = new URL(origin).hostname, c = av?.contact || {}, loc = [NAME, c.street, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Boerderijrecreatie//Agenda//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Boerderijrecreatie – agenda', 'X-WR-TIMEZONE:' + TZ, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'BEGIN:VTIMEZONE', 'TZID:' + TZ, 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const e of realEvents(av)) {
    const end = isTime(e.end) && e.end > e.start ? e.end : null;
    lines.push('BEGIN:VEVENT', `UID:${e.id}@${host}`, 'DTSTAMP:' + stamp(now), `DTSTART;TZID=${TZ}:${local(e.date, e.start)}`, ...(end ? [`DTEND;TZID=${TZ}:${local(e.date, end)}`] : ['DURATION:PT2H']),
      'SUMMARY:' + icsText(e.title), ...(e.description ? ['DESCRIPTION:' + icsText(e.description + (Number(e.priceCents) > 0 ? `\n€ ${(e.priceCents / 100).toFixed(2).replace('.', ',')} per persoon` : '') + '\nMeer informatie en aanmelden: ' + origin + '/')] : ['DESCRIPTION:' + icsText('Meer informatie en aanmelden: ' + origin + '/')]),
      'LOCATION:' + icsText(loc), 'URL:' + origin + '/', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---- llms.txt, robots.txt en sitemap ----------------------------------------------------------------------------
export function llmsTxt(av, origin) {
  const c = av?.contact || {}, ev = realEvents(av).slice(0, 30), hrs = hoursLines(av);
  return [`# ${NAME}`, '', `> ${DESCRIPTION}`, '',
    '## Praktisch',
    ...(c.street || c.city ? [`- Adres: ${[c.street, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`] : []),
    ...(c.phone ? [`- Telefoon: ${c.phone}`] : []), ...(c.email ? [`- E-mail: ${c.email}`] : []), ...(c.whatsapp ? [`- WhatsApp: ${c.whatsapp}`] : []),
    `- Website: ${origin}/`, `- Online bestellen: ${origin}/bestellen.html`, `- Agenda als kalenderfeed: ${origin}/agenda.ics`, '',
    ...(hrs.length ? ['## Openingstijden', ...hrs.map(l => '- ' + l), ''] : []),
    ...((av?.closedDays || []).length ? ['## Gesloten', ...av.closedDays.filter(d => isDay(d?.date)).map(d => `- ${dutchDate(d.date)}${d.note ? ` (${d.note})` : ''}`), ''] : []),
    ...(ev.length ? ['## Agenda', ...ev.map(e => `- ${dutchDate(e.date)} ${e.start}${isTime(e.end) ? '–' + e.end : ''}: ${e.title}${e.description ? ' — ' + e.description : ''}${Number(e.priceCents) > 0 ? ` (€ ${(e.priceCents / 100).toFixed(2).replace('.', ',')} p.p.)` : ''}`), ''] : []),
    '## Bron', 'Deze gegevens komen rechtstreeks uit de administratie van Boerderijrecreatie en worden automatisch bijgewerkt.', ''].join('\n');
}
// Zoek- en AI-robots zijn welkom (besluit eigenaar: „AI-zoekopdrachten moeten onze site super goed meenemen”).
export function robotsTxt(origin) {
  return ['# Boerderijrecreatie: zoekmachines en AI-assistenten zijn welkom.', 'User-agent: *', 'Allow: /', 'Allow: /api/public/media/', 'Disallow: /__dev', 'Disallow: /api/', '',
    ...['Googlebot', 'Google-Extended', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-SearchBot', 'Applebot', 'Applebot-Extended'].flatMap(b => [`User-agent: ${b}`, 'Allow: /', 'Disallow: /__dev', '']),
    `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}
export function sitemapXml(origin, today) {
  const urls = [['/', 'daily', '1.0'], ['/bestellen.html', 'daily', '0.8']];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(([p, f, pr]) => `  <url><loc>${esc(origin + p)}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n') + '\n</urlset>\n';
}
