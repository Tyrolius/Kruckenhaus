/* ============================================================
 * TEST – Zugangsprüfung der Hofladen-Verwaltung
 * ============================================================
 * Prüft functions/_lib/zugang.js mit selbst erzeugten Schlüsseln und
 * Tokens (wie sie Cloudflare Access ausstellt): gültige Anmeldung,
 * fremde E-Mail, falsche Anwendung, abgelaufen, manipuliert, fehlende
 * Einrichtung und die Freigabe nur für lokale Tests.
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-zugang.mjs
 * ============================================================ */

import assert from 'node:assert/strict';
import { zugangPruefen } from '../functions/_lib/zugang.js';

const DOMAIN = 'kruckenhaus.cloudflareaccess.com';
const AUD = 'aud-test-123';
const env = { ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD, VERWALTUNG_EMAILS: 'a@example.at, B@Example.at' };

const paar = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']
);
const fremd = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', paar.publicKey)), kid: 'k1', alg: 'RS256' };
let abrufe = 0;
const holen = async (url) => {
  abrufe += 1;
  assert.equal(url, `https://${DOMAIN}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwk] }));
};

const b64url = (daten) => Buffer.from(daten).toString('base64url');
async function token(inhalt, { schluessel = paar.privateKey, kid = 'k1' } = {}) {
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const rumpf = b64url(JSON.stringify({ iss: `https://${DOMAIN}`, aud: [AUD], email: 'a@example.at', iat: jetzt, exp: jetzt + 3600, ...inhalt }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', schluessel, new TextEncoder().encode(`${kopf}.${rumpf}`));
  return `${kopf}.${rumpf}.${b64url(new Uint8Array(sig))}`;
}
const anfrage = (t, host = 'https://www.kruckenhaus.at') =>
  new Request(`${host}/api/verwaltung/stand`, { headers: t ? { 'Cf-Access-Jwt-Assertion': t } : {} });

let erg = await zugangPruefen(anfrage(await token({})), env, holen);
assert.deepEqual(erg, { ok: true, email: 'a@example.at' });
erg = await zugangPruefen(anfrage(await token({ email: 'b@example.at' })), env, holen);
assert.equal(erg.ok, true, 'Groß-/Kleinschreibung der Liste egal');
assert.equal(abrufe, 1, 'Schlüssel werden zwischengespeichert');
erg = await zugangPruefen(anfrage(await token({ aud: ['vorschau-aud'] })), { ...env, ACCESS_AUD: `${AUD}, vorschau-aud` }, holen);
assert.equal(erg.ok, true, 'mehrere Anwendungen erlaubt');
console.log('✓ Gültige Anmeldung, mehrere Anwendungen, Schlüssel zwischengespeichert');

erg = await zugangPruefen(anfrage(await token({ email: 'fremd@example.at' })), env, holen);
assert.deepEqual([erg.ok, erg.status], [false, 403]);
console.log('✓ Nicht freigegebene E-Mail → 403');

for (const [name, t] of [
  ['falsche Anwendung', await token({ aud: ['andere'] })],
  ['abgelaufen', await token({ exp: Math.floor(Date.now() / 1000) - 10 })],
  ['falscher Aussteller', await token({ iss: 'https://boese.example' })],
  ['fremder Schlüssel', await token({}, { schluessel: fremd.privateKey })],
  ['unbekannter Schlüssel', await token({}, { kid: 'k9' })],
  ['manipuliert', (await token({})).replace(/\.([^.]+)\./, (m, rumpf) => `.${b64url(JSON.stringify({ ...JSON.parse(Buffer.from(rumpf, 'base64url')), email: 'b@example.at' }))}.`)],
  ['Unsinn', 'abc.def'],
]) {
  erg = await zugangPruefen(anfrage(t), env, holen);
  assert.deepEqual([erg.ok, erg.status], [false, 401], name);
}
assert.equal(abrufe, 1, 'unbekannter Schlüssel löst keinen sofortigen Neuabruf aus');
console.log('✓ Falsche Anwendung, abgelaufen, falscher Aussteller, fremder/unbekannter Schlüssel, manipuliert → 401');

erg = await zugangPruefen(anfrage(null), env, holen);
assert.deepEqual([erg.ok, erg.status], [false, 401]);
for (const fehlt of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'VERWALTUNG_EMAILS']) {
  erg = await zugangPruefen(anfrage(await token({})), { ...env, [fehlt]: '' }, holen);
  assert.deepEqual([erg.ok, erg.status], [false, 503], fehlt);
}
console.log('✓ Ohne Token → 401, fehlende Einrichtung → 503 (gesperrt)');

erg = await zugangPruefen(anfrage(null, 'http://localhost:8788'), { VERWALTUNG_LOKAL: '1' }, holen);
assert.deepEqual(erg, { ok: true, email: 'lokal' });
erg = await zugangPruefen(anfrage(null, 'https://www.kruckenhaus.at'), { ...env, VERWALTUNG_LOKAL: '1' }, holen);
assert.equal(erg.ok, false, 'Lokal-Freigabe wirkt nicht auf der echten Adresse');
erg = await zugangPruefen(anfrage(null, 'http://localhost:8788'), {}, holen);
assert.equal(erg.ok, false, 'ohne Schalter auch lokal gesperrt');
console.log('✓ Lokale Freigabe nur mit Schalter und nur auf localhost');

console.log('\nAlle Tests bestanden.');
