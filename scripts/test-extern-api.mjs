/* ============================================================
 * TEST – Schnittstelle für Bertha (/api/extern/v1/…), Phase W3
 * ============================================================
 * Plan: docs/SCHNITTSTELLE-BERTHA.md, Abschnitt 9. Spielt Middleware und
 * Aufrufe gegen den D1-Nachbau durch: Schlüssel anlegen (nur Prüfsumme
 * gespeichert), 401 ohne/mit falschem/gesperrtem Schlüssel, 403 ohne
 * Recht, /ping, /katalog (nur „im Portal", Ausverkauftes, ETag/304),
 * Pausieren (503), Protokoll ohne personenbezogene Daten, Verwaltung.
 *
 * Berührt die echte D1-Datenbank NICHT.
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-extern-api.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest as middleware } from '../functions/api/extern/_middleware.js';
import { onRequest as route } from '../functions/api/extern/v1/[[pfad]].js';
import { onRequest as verwaltung } from '../functions/api/verwaltung/[[pfad]].js';

const { roh, db } = d1Nachbau();
const schema = readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8');
roh.exec(schema);
roh.exec(readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8'));
roh.exec(schema); // mehrfach ausführbar
const env = { DB: db };

// Wie Cloudflare Pages: erst die Middleware, dann (über next) der Aufruf
async function extern(pfad, { schluessel, methode = 'GET', kopf = {}, host = 'www.kruckenhaus.at' } = {}) {
  const request = new Request(`https://${host}/api/extern/v1/${pfad}`, {
    method: methode,
    headers: { ...(schluessel ? { Authorization: `Bearer ${schluessel}` } : {}), ...kopf },
  });
  const context = { request, env, params: { pfad: pfad ? pfad.split('/') : [] }, data: {} };
  context.next = () => route(context);
  const antwort = await middleware(context);
  const text = await antwort.text();
  return { status: antwort.status, kopf: antwort.headers, ...(text ? JSON.parse(text) : {}) };
}

async function vw(pfad, eingabe, host = 'www.kruckenhaus.at') {
  const request = new Request(`https://${host}/api/verwaltung/${pfad}`, {
    method: eingabe ? 'POST' : 'GET',
    headers: eingabe ? { 'Content-Type': 'application/json' } : {},
    body: eingabe ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await verwaltung({ request, env, params: { pfad: pfad.split('/') }, data: { nutzer: 'test@example.at' } });
  return { status: antwort.status, ...(await antwort.json()) };
}
const ok = (r) => { assert.equal(r.ok, true, r.error || JSON.stringify(r.fehler)); return r; };
const fehlerCode = (r, status, code) => {
  assert.equal(r.status, status);
  assert.equal(r.ok, false);
  assert.equal(r.fehler.code, code);
  assert.ok(r.fehler.text.length > 5);
};

// Leerer Stand der Verwaltung
let s = ok(await vw('stand'));
assert.deepEqual([s.schnittstelle.pausiert, s.schnittstelle.zugaenge.length, s.schnittstelle.letzterErfolg], [false, 0, null]);

// Zugang anlegen: Schlüssel nur in der Antwort, in D1 nur die Prüfsumme
let r = ok(await vw('schnittstelle/zugang', { name: 'Bertha', rechte: ['katalog'] }));
const schluessel = r.schluessel;
assert.match(schluessel, /^kh_live_[A-Za-z0-9_-]{43}$/);
const zeile = roh.prepare('SELECT * FROM schnittstellen_zugaenge WHERE id = ?').get(Number(r.zugangId));
assert.equal(zeile.schluessel_hash.length, 64);
assert.ok(!JSON.stringify(roh.prepare('SELECT * FROM schnittstellen_zugaenge').all()).includes(schluessel.slice(8)));
s = ok(await vw('stand'));
assert.ok(!JSON.stringify(s).includes(schluessel.slice(8)), 'Stand enthält den Schlüssel nie');
const test = ok(await vw('schnittstelle/zugang', { name: 'Bertha Test', rechte: ['katalog', 'angebot'] }, 'abc.kruckenhaus.pages.dev'));
assert.match(test.schluessel, /^kh_test_/);
const ohneKatalog = ok(await vw('schnittstelle/zugang', { name: 'Nur Angebot', rechte: ['angebot'] }));
assert.equal((await vw('schnittstelle/zugang', { name: 'X', rechte: ['admin'] })).status, 400);
assert.equal((await vw('schnittstelle/zugang', { name: '', rechte: ['katalog'] })).status, 400);
assert.equal((await vw('schnittstelle/zugang', { name: 'X', rechte: [] })).status, 400);
console.log('✓ Schlüssel anlegen: einmal angezeigt, nur Prüfsumme gespeichert, kh_test_ auf Vorschau');

// 401: ohne, falsch, kaputt, gesperrt – immer gleich
fehlerCode(await extern('ping'), 401, 'nicht_angemeldet');
fehlerCode(await extern('ping', { schluessel: `kh_live_${'A'.repeat(43)}` }), 401, 'nicht_angemeldet');
fehlerCode(await extern('ping', { schluessel: 'irgendwas' }), 401, 'nicht_angemeldet');
fehlerCode(await extern('ping', { kopf: { Authorization: `Basic ${schluessel}` } }), 401, 'nicht_angemeldet');

// /ping
r = ok(await extern('ping', { schluessel }));
assert.deepEqual([r.version, r.zugang, r.rechte], ['v1', 'Bertha', ['katalog']]);
assert.ok(Date.parse(r.serverzeit));
assert.equal(r.kopf.get('Cache-Control'), 'no-store');
assert.equal(r.kopf.get('Access-Control-Allow-Origin'), null, 'keine CORS-Header');
assert.ok(roh.prepare('SELECT zuletzt_genutzt FROM schnittstellen_zugaenge WHERE id = ?').get(zeile.id).zuletzt_genutzt);
console.log('✓ 401 einheitlich; /ping mit Name, Rechten, Serverzeit; keine CORS-Header');

// 403 ohne Recht, 404/405
fehlerCode(await extern('katalog', { schluessel: ohneKatalog.schluessel }), 403, 'keine_berechtigung');
fehlerCode(await extern('gibtsnicht', { schluessel }), 404, 'nicht_gefunden');
fehlerCode(await extern('', { schluessel }), 404, 'nicht_gefunden');
r = await extern('katalog', { schluessel, methode: 'POST' });
assert.equal(r.status, 405);
console.log('✓ 403 ohne Recht, 404 unbekannt, 405 falsche Methode');

// Katalog: Dauerartikel mit „im Portal", Ausverkauftes dabei, Ausgeblendetes nicht
const produkt = (name) => roh.prepare('SELECT * FROM produkte WHERE name = ?').get(name);
const alsDauer = async (name, extra = {}) => {
  const p = produkt(name);
  ok(await vw(`produkt/${p.id}`, { name, art: p.art, bereichId: p.bereich_id, verkaufsart: 'dauer', dauerpreisCent: 400,
    pflichtangaben: 'Hartweizengrieß, Eier', allergene: 'Weizen (Gluten), Ei', ...extra }));
};
r = ok(await extern('katalog', { schluessel }));
assert.deepEqual(r.artikel, []);
await alsDauer('Eiernudeln Spirelli 500 g', { bild: 'api/hofladen/foto/7' });
await alsDauer('Eiernudeln Spaghetti 500 g', { verfuegbar: false });
await alsDauer('Eiernudeln Hörnchen 500 g', { imPortal: false });
await alsDauer('Eiernudeln Rotunde 500 g', { aktiv: false });
r = ok(await extern('katalog', { schluessel }));
assert.deepEqual(r.artikel.map((a) => [a.name, a.verfuegbar]).sort(),
  [['Eiernudeln Spaghetti 500 g', false], ['Eiernudeln Spirelli 500 g', true]]);
const spirelli = r.artikel.find((a) => a.name.includes('Spirelli'));
assert.deepEqual([spirelli.preis_cent, spirelli.einheit, spirelli.bereich, spirelli.allergene, spirelli.bild_version],
  [400, 'Stück', 'Eiernudeln', 'Weizen (Gluten), Ei', '7']);
assert.equal(spirelli.bild_url, 'https://www.kruckenhaus.at/api/hofladen/foto/7');
assert.match(spirelli.geaendert_am, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
assert.ok(r.stand >= spirelli.geaendert_am);
assert.ok(!r.artikel.some((a) => a.name.includes('Masthuhn')), 'keine Bestellrunden-Ware');
console.log('✓ Katalog: nur Dauerartikel „im Portal", Ausverkauftes mit verfuegbar: false, Foto und Angaben');

// ETag: gleicher Inhalt → 304 ohne Inhalt; Änderung → neuer ETag
const etag = r.kopf.get('ETag');
assert.match(etag, /^W\/"[0-9a-f]{32}"$/);
r = await extern('katalog', { schluessel, kopf: { 'If-None-Match': etag } });
assert.equal(r.status, 304);
assert.equal(r.artikel, undefined);
const sp = produkt('Eiernudeln Spirelli 500 g');
ok(await vw(`produkt/${sp.id}/verfuegbar`, { verfuegbar: false }));
r = await extern('katalog', { schluessel, kopf: { 'If-None-Match': etag } });
assert.equal(r.status, 200);
assert.notEqual(r.kopf.get('ETag'), etag);
assert.equal(r.artikel.find((a) => a.name.includes('Spirelli')).verfuegbar, false);
console.log('✓ ETag: 304 ohne Änderung, „ausverkauft" ändert den ETag');

// Pausieren: 503 für alle, Website läuft weiter
ok(await vw('schnittstelle/pausieren', { pausiert: true }));
fehlerCode(await extern('katalog', { schluessel }), 503, 'pausiert');
fehlerCode(await extern('ping', { schluessel }), 503, 'pausiert');
assert.equal((await vw('schnittstelle/pausieren', { pausiert: 'ja' })).status, 400);
s = ok(await vw('stand'));
assert.equal(s.schnittstelle.pausiert, true);
ok(await vw('schnittstelle/pausieren', { pausiert: false }));
ok(await extern('ping', { schluessel }));
console.log('✓ Pausieren: 503 für alle Aufrufe, wieder einschalten wirkt sofort');

// Sperren wirkt sofort
ok(await vw(`schnittstelle/zugang/${test.zugangId}/sperren`, {}));
fehlerCode(await extern('ping', { schluessel: test.schluessel }), 401, 'nicht_angemeldet');
assert.equal((await vw(`schnittstelle/zugang/${test.zugangId}/sperren`, {})).status, 400);
ok(await extern('ping', { schluessel }));
console.log('✓ Gesperrter Schlüssel → 401, andere Schlüssel laufen weiter');

// Protokoll: ohne personenbezogene Daten, Fehler sichtbar in der Verwaltung
const protokoll = roh.prepare('SELECT * FROM schnittstellen_protokoll').all();
assert.ok(protokoll.length >= 15);
const alles = JSON.stringify(protokoll);
for (const verboten of [schluessel, test.schluessel, 'Bertha', 'Eiernudeln', 'example', '@']) {
  assert.ok(!alles.includes(verboten), `Protokoll enthält ${verboten}`);
}
assert.deepEqual(Object.keys(protokoll[0]).sort(), ['aufruf', 'dauer_ms', 'fehlercode', 'http_status', 'id', 'zeitpunkt', 'zugang_id']);
assert.ok(protokoll.some((p) => p.fehlercode === 'nicht_angemeldet' && p.zugang_id === null));
assert.ok(protokoll.some((p) => p.aufruf === 'GET /v1/katalog' && p.http_status === 304));
s = ok(await vw('stand'));
assert.equal(s.schnittstelle.letzterErfolg.zugang, 'Bertha');
assert.ok(s.schnittstelle.fehler.length > 0 && s.schnittstelle.fehler.length <= 10);
assert.ok(s.schnittstelle.letzte24h.aufrufe >= 15 && s.schnittstelle.letzte24h.fehler > 0);
const gesperrt = s.schnittstelle.zugaenge.find((z) => z.name === 'Bertha Test');
assert.ok(gesperrt.gesperrt);
console.log('✓ Protokoll ohne Namen, E-Mails oder Schlüssel; Ampel-Daten in der Verwaltung');

// Alte Einträge (über 90 Tage) verschwinden beim nächsten Schreiben
roh.exec(`INSERT INTO schnittstellen_protokoll (zeitpunkt, aufruf, http_status) VALUES (datetime('now', '-91 days'), 'GET /v1/ping', 200)`);
await extern('ping', { schluessel });
assert.equal(roh.prepare(`SELECT COUNT(*) AS n FROM schnittstellen_protokoll WHERE zeitpunkt < datetime('now', '-90 days')`).get().n, 0);
console.log('✓ Protokoll-Einträge älter als 90 Tage werden gelöscht');

// Ohne Schnittstellen-Tabellen (Live-Datenbank vor dem Einspielen):
// Verwaltung läuft weiter, Schnittstelle verweigert statt ungeprüft zu antworten
const leer = d1Nachbau();
leer.roh.exec(schema);
leer.roh.exec('DROP TABLE schnittstellen_protokoll; DROP TABLE extern_anfragen; DROP TABLE extern_kunden; DROP TABLE schnittstellen_zugaenge; DROP TABLE einstellungen;');
const leerStand = await verwaltung({ request: new Request('https://x/api/verwaltung/stand'), env: { DB: leer.db },
  params: { pfad: ['stand'] }, data: {} });
const leerDaten = await leerStand.json();
assert.deepEqual([leerStand.status, leerDaten.ok, leerDaten.schnittstelle], [200, true, null]);
const fehlt = await verwaltung({ request: new Request('https://x/api/verwaltung/schnittstelle/zugang', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bertha', rechte: ['katalog'] }) }),
  env: { DB: leer.db }, params: { pfad: ['schnittstelle', 'zugang'] }, data: {} });
assert.match((await fehlt.json()).error, /noch nicht eingerichtet/);
const ctx = { request: new Request('https://x/api/extern/v1/ping', { headers: { Authorization: `Bearer ${schluessel}` } }),
  env: { DB: leer.db }, params: { pfad: ['ping'] }, data: {} };
ctx.next = () => assert.fail('Aufruf darf ohne Prüfung nicht laufen');
assert.equal((await middleware(ctx)).status, 500);
console.log('✓ Ohne Tabellen: Verwaltung läuft, Schnittstelle verweigert (500), nie ungeprüft');

console.log('\nAlle Tests der Schnittstelle bestanden.');
