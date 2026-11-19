// Testhulp: een echte, ondertekende sessie (zoals na Google of wachtwoord én de Authenticator-code), zonder Supabase.
// Sinds 6 november 2026 is de oude wachtwoordlogin (Basic Auth) weg; tests loggen zo in. Zie tools/auth/sessie.mjs.
import {createHash, createHmac} from 'node:crypto';
import {signSession} from '../tools/auth/sessie.mjs';
export const AUTH_SECRET = 'testsessie-'.repeat(5);
/** Supabase „ingesteld” (inloggen staat altijd aan) (niet bereikt: de sessie is al ondertekend) en de gedeelde sessiesleutel. */
export const loginEnv = {AUTH_SECRET, SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-test'};
/** Cookie voor naam@boerbart.nl; in de backoffice heet die persoon dan „naam”. */
/** Alle onderdelen (lib/onderdelen.ts): een medewerker in een test mag standaard alles behalve beheer. */
export const ALLE_ONDERDELEN = ['overzicht', 'planning', 'personeel', 'gasten', 'verkoop', 'inkoop', 'overleg', 'financien', 'bloei', 'marketing'];
export function sessionCookie(name, role = 'eigenaar', modules = ALLE_ONDERDELEN) {
  const now = Date.now(), email = name.includes('@') ? name : name + '@boerbart.nl';
  return 'bb_sessie=' + signSession({email, name, role, exp: now + 8 * 3600000, mfa: now, ...(role === 'eigenaar' ? {} : {modules})}, AUTH_SECRET);
}
/**
 * Ledensessie (wens eigenaar 9 november 2026): zoals na inloggen als lid met Google of e-mail en wachtwoord, voor precies
 * één persoonlijke link. Zelfde ondertekening als lib/member-session-core.ts.
 */
export function memberCookie(token, {participantId = 'lid', email = 'lid@example.invalid', provider = 'google', subject = 'lid-test'} = {}) {
  const body = Buffer.from(JSON.stringify({participantId, email, subject, provider, tokenHash: createHash('sha256').update(token).digest('hex'), exp: Date.now() + 86400000})).toString('base64url');
  const key = createHmac('sha256', AUTH_SECRET).update('boer-bart-member-signature-session-v1').digest();
  return 'bb_lid_sessie=' + body + '.' + createHmac('sha256', key).update(body).digest('base64url');
}
