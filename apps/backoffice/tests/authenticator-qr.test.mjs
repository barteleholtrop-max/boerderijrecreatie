// Authenticator koppelen (6 november 2026: „de QR voor de authenticator werkte niet”): de QR-code maken we zelf uit het otpauth-adres.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {qrImage}=await import('../lib/supabase-auth.ts');

test('QR uit het otpauth-adres als PNG; zonder geldig adres het plaatje van Supabase',async()=>{
 const png=await qrImage('otpauth://totp/Boer%20Bart:bart%40example.nl?secret=JBSWY3DPEHPK3PXP&issuer=Boer%20Bart','fallback');
 assert.match(png,/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);assert.ok(png.length>500);
 assert.equal(await qrImage(undefined,'fallback'),'fallback');
 assert.equal(await qrImage('https://example.com','fallback'),'fallback','alleen otpauth-adressen');
});
