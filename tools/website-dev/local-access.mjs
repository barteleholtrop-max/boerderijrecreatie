// Inloggen staat altijd aan (besluit eigenaar 8 november 2026: "Inlog moet altijd aanstaan. De functie dat dit niet zo
// is moet vervallen."). De schakelaar BOER_BART_LOGIN en de uitzonderingen zonder login (LOCAL_NO_LOGIN op deze computer,
// TUNNEL_NO_LOGIN in de telefoonstand) zijn vervallen: backoffice en planbord vragen overal om inloggen met de
// Authenticator-code. Wat hier overblijft, is alleen voor de website-ontwikkelserver (zelfde computer, ander adres).
export const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
// Cloudflare-specific only: Next.js itself adds x-forwarded-* to every local request.
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cdn-loop'];
export function loopbackOrigin(origin) {
  try { const o = new URL(origin); return o.protocol === 'http:' && LOOPBACK.includes(o.hostname) ? o : null; } catch { return null; }
}
/** @param {(name: string) => string | string[] | null | undefined} header a request header lookup */
export function cameThroughProxy(header) {
  return PROXY_HEADERS.some(name => { const v = header(name); return v !== undefined && v !== null && v !== ''; });
}
/**
 * Same computer, other loopback spelling (website-ontwikkelserver; geeft nooit toegang, alleen een doorverwijzing).
 * Opening http://127.0.0.1:3001 when the app runs as http://localhost:3001 (or the other way round) returns the
 * configured origin, so the caller can redirect there: no login prompt, and saving keeps working (writes check the
 * exact origin). Only for plain reads (GET/HEAD) on the same port, never through Cloudflare, never off this computer.
 * @param {{enabled?: string | boolean, origin: string, host?: string, method?: string, header?: (name: string) => string | string[] | null | undefined}} request
 * @returns {string | null} the origin to redirect to, or null
 */
export function loopbackAlias({enabled, origin, host, method = 'GET', header = () => undefined}) {
  if (enabled !== '1' && enabled !== true) return null;
  if (method !== 'GET' && method !== 'HEAD') return null;
  const o = loopbackOrigin(origin);
  if (!o || typeof host !== 'string' || host === o.host || cameThroughProxy(header)) return null;
  let h; try { h = new URL('http://' + host); } catch { return null; }
  return LOOPBACK.includes(h.hostname) && h.port === o.port ? o.origin : null;
}
