// Sessie van Boer Bart (besluit eigenaar 6 november 2026: inloggen via Supabase met Google of e-mail en wachtwoord,
// altijd met een code uit de Authenticator-app). Gedeeld door backoffice en planbord, zonder database of netwerk.
//
// - bb_sessie: ondertekende cookie (HMAC), alleen uitgegeven NA de Authenticator-code. 8 uur geldig.
// - bb_stap:   versleutelde cookie (AES-256-GCM) tussen het eerste inloggen en de code: wie, het tijdelijke
//              toegangsbewijs van Supabase en de pagina om naar terug te gaan. 10 minuten geldig.
import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE = 'bb_sessie', STEP_COOKIE = 'bb_stap';
export const SESSION_HOURS = 8; // daarna opnieuw inloggen; wie van de lijst is gehaald, komt er dan niet meer in
export const STEP_MINUTES = 10;
// „Onthoud deze telefoon” (wens eigenaar 13 november 2026): 30 dagen ingelogd (lang). Wie van de lijst gaat, merkt dat
// meteen: de proxy van de backoffice kijkt bij zo'n sessie elke minuut of het account nog actief is.
export const REMEMBER_DAYS = 30;
export const ROLES = ['eigenaar', 'medewerker'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** @param {unknown} v */
export const validEmail = v => typeof v === 'string' && v.length <= 200 && EMAIL.test(v);
/** @param {unknown} v */
export const validRole = v => typeof v === 'string' && ROLES.includes(v);

/**
 * Sleutel voor sessie en tussenstap: AUTH_SECRET (min. 32 tekens), anders afgeleid van SHEETS_CONFIG_KEY.
 * Backoffice en planbord moeten dezelfde sleutel hebben.
 * @param {Record<string, string | undefined>} env
 */
export function sessionSecret(env = process.env) {
  const own = env.AUTH_SECRET || ''; if (own.length >= 32) return own;
  const base = env.SHEETS_CONFIG_KEY || ''; if (base.length >= 32) return createHmac('sha256', base).update('boer-bart-sessie').digest('hex');
  return '';
}

/**
 * Secure-vlag voor de inlogcookies (issue #146, overgenomen uit PR #158): aan bij een https-adres, op Cloud Run
 * (K_SERVICE) of achter een proxy die https meldt.
 * @param {Record<string, string | undefined>} env @param {string} origin
 */
export function cookieSecure(env = process.env, origin = '') {
  if (origin.startsWith('https://')) return true;
  if (env.K_SERVICE) return true;
  return (env.X_FORWARDED_PROTO || '').split(',')[0].trim().toLowerCase() === 'https';
}

/**
 * Gedeeld cookiedomein, zodat backoffice en planbord (bijv. backoffice.boerbart.nl en planbord.boerbart.nl) dezelfde
 * sessie gebruiken. Alleen een gewone domeinnaam; leeg = alleen het eigen adres.
 * @param {Record<string, string | undefined>} env
 */
export function cookieDomain(env = process.env) {
  const d = (env.SESSION_COOKIE_DOMAIN || '').trim().toLowerCase().replace(/^\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : undefined;
}

const b64 = b => Buffer.from(b).toString('base64url');
/**
 * @typedef {{email: string, name: string, role: 'eigenaar' | 'medewerker', exp: number, mfa: number, mfaUsed?: number, quick?: true, lang?: true, modules?: string[]}} Session
 * mfa = tijdstip (ms) waarop de laatste Authenticator-code is ingevoerd; mfaUsed = die code is al voor een Bloei-handeling
 * gebruikt (apps/backoffice/lib/handeling-code.ts); modules = onderdelen van een medewerker.
 */
/** @param {Session} s @param {string} secret */
export function signSession(s, secret) {
  if (!secret) throw Error('Geen sleutel voor de sessie (AUTH_SECRET of SHEETS_CONFIG_KEY).');
  const body = b64(JSON.stringify(s));
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
/** @param {string | undefined | null} token @param {string} secret @returns {Session | null} */
export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret || token.length > 2000) return null;
  const [body, sig] = token.split('.'); if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  let got; try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    // Zonder Authenticator-code (mfa) is er geen geldige sessie: ook een oude sessie van vóór 6 november telt niet.
    if (!validEmail(s.email) || !validRole(s.role) || typeof s.name !== 'string' || !Number.isFinite(s.exp) || s.exp <= now
      || (s.lang !== undefined && s.lang !== true)
      || !Number.isFinite(s.mfa) || s.mfa > now + 60000 || s.mfa < s.exp - (s.lang ? REMEMBER_DAYS * 86400000 : SESSION_HOURS * 3600000) - 60000
      || (s.mfaUsed !== undefined && !Number.isFinite(s.mfaUsed))
      || (s.quick !== undefined && s.quick !== true)
      || (s.modules !== undefined && !(Array.isArray(s.modules) && s.modules.length <= 30 && s.modules.every(m => typeof m === 'string')))) return null;
    return s;
  } catch { return null; }
}

const stepKey = secret => createHmac('sha256', secret).update('boer-bart-tussenstap').digest();
/** Versleutelt de tussenstap (niemand kan hem lezen of aanpassen). @param {object} value @param {string} secret */
export function seal(value, secret) {
  if (!secret) throw Error('Geen sleutel voor de sessie (AUTH_SECRET of SHEETS_CONFIG_KEY).');
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', stepKey(secret), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return b64(Buffer.concat([iv, c.getAuthTag(), data]));
}
/** @param {string | undefined | null} token @param {string} secret @returns {any} */
export function unseal(token, secret, now = Date.now()) {
  if (!token || !secret || token.length > 3800) return null;
  try {
    const raw = Buffer.from(token, 'base64url'); if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', stepKey(secret), raw.subarray(0, 12)); d.setAuthTag(raw.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
    return v && Number.isFinite(v.exp) && v.exp > now ? v : null;
  } catch { return null; }
}
