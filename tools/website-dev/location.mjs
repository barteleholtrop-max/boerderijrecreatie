import {insist} from './errors.mjs';

// Strict allowlist: never persist arbitrary DOM attributes, text, values or URLs.
export function validateLocation(input, application) {
  if (input == null) return null;
  insist(input && Object.keys(input).every(k => ['version', 'application', 'route', 'view', 'selector', 'signature', 'tag'].includes(k)), 400, 'De selectie bevat niet-toegestane gegevens.');
  insist(input.version === 1 && input.application === application, 400, 'Ongeldige selectielocatie.');
  const routes = application === 'backoffice' ? ['/', '/goedkeuringen', '/taken', '/werkplekken', '/kassa', '/yte', '/producten', '/offertes', '/winkel', '/inkoop', '/beloning', '/financien', '/marketing', '/website', '/koppeling'] : ['/', '/index.html'];
  insist(routes.includes(input.route), 400, 'Deze pagina ondersteunt nog geen selectielocaties.');
  insist(typeof input.selector === 'string' && input.selector.length < 2000 && /^body(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]{0,4}\)){1,40}$/.test(input.selector), 400, 'Ongeldige elementlocatie.');
  insist(typeof input.tag === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(input.tag), 400, 'Ongeldig elementtype.');
  insist(typeof input.signature === 'string' && /^[a-f0-9]{8}$/.test(input.signature), 400, 'Ongeldige elementcontrole.');
  insist(typeof input.view === 'string' && input.view.length <= 140 && /^[a-zA-Z0-9|_-]*$/.test(input.view), 400, 'Ongeldige schermweergave.');
  return {version: 1, application, route: input.route, view: input.view, selector: input.selector, signature: input.signature, tag: input.tag};
}
