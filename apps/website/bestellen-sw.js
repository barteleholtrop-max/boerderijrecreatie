// Service worker van de bestelpagina: toont de pushmelding "Je bestelling staat klaar", ook als de pagina dicht is.
// De backoffice stuurt de melding zodra een werkplek op Gereed drukt (akkoord eigenaar 3 november 2026).
// Dit bestand bewaart niets en vangt geen andere verzoeken af.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* geen geldige inhoud: standaardtekst */ }
  const title = typeof data.title === 'string' ? data.title.slice(0, 80) : 'Je bestelling staat klaar';
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : 'Je kunt je bestelling ophalen.';
  // Staat de bestelpagina open, dan speelt die zelf een melodietje en trilt de telefoon (wens eigenaar 5 november 2026).
  const tellPage = self.clients.matchAll({type: 'window', includeUncontrolled: true})
    .then(list => list.forEach(c => c.postMessage({type: 'boerbart-klaar', title, body, tag: typeof data.tag === 'string' ? data.tag.slice(0, 60) : ''})));
  event.waitUntil(tellPage.catch(() => {}).then(() => self.registration.showNotification(title, {
    body, tag: typeof data.tag === 'string' ? data.tag.slice(0, 60) : 'boerbart-klaar', renotify: true,
    // Trillen (wens eigenaar 5 november 2026): kort-kort-lang. Werkt op Android; iPhone gebruikt zijn eigen meldingstril.
    vibrate: [200, 100, 200, 100, 500], silent: false,
    // Groter en duidelijker (wens eigenaar 14 november 2026: „alleen een klein belletje, kan dat groter?”): het Boerderijrecreatie-logo in de
    // meldingenbalk in plaats van het standaardbelletje van Chrome, het kleurenlogo in de melding, en hij blijft staan tot je hem
    // wegveegt of erop tikt. Of hij als pop-up over het scherm schuift, bepaalt Android (Instellingen → Chrome → Meldingen).
    icon: new URL('beeld/bestellen-192.png', self.registration.scope).href,
    badge: new URL('beeld/melding-badge.png', self.registration.scope).href,
    requireInteraction: true, lang: 'nl',
    data: typeof data.url === 'string' ? {url: data.url.slice(0, 300)} : {},
  })));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Een melding kan een eigen pagina binnen de bestelpagina openen (meebetalen aan een rekening: ?deel=…). Alleen hetzelfde adres.
  const own = typeof event.notification.data?.url === 'string' ? new URL(event.notification.data.url, self.registration.scope) : null;
  const page = own && own.origin === self.location.origin && own.pathname.startsWith('/bestellen') ? own.href : new URL('bestellen.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => new URL(c.url).pathname.startsWith('/bestellen'));
    return open && !own ? open.focus() : self.clients.openWindow(page);
  }));
});
