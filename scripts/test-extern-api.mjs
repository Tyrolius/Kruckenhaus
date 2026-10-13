/* ============================================================
 * TEST – Schnittstelle für Bertha (/api/extern/v1/…), Phase W3
 * ============================================================
 * Plan: docs/SCHNITTSTELLE-BERTHA.md, Abschnitt 9. Spielt Middleware und
 * Aufrufe gegen den D1-Nachbau durch: Schlüssel anlegen (nur Prüfsumme
 * gespeichert), 401 ohne/mit falschem/gesperrtem Schlüssel, 403 ohne
 * Recht, /ping, /katalog (nur „im Portal", Ausverkauftes, ETag/304),
 * Pausieren (503), Protokoll ohne personenbezogene Daten, Verwaltung.
 * Phase W4: /angebot, POST /bestellungen (Idempotenz, Warteliste,
 * Bestellschluss, Liefergebiet, „nicht im Portal", Größe, Limits,
 * Kundenzuordnung, Mails, Kennzeichnung „über Bertha").
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
async function extern(pfad, { schluessel, methode = 'GET', kopf = {}, host = 'www.kruckenhaus.at', body } = {}) {
  const request = new Request(`https://${host}/api/extern/v1/${pfad}`, {
    method: methode,
    headers: { ...(schluessel ? { Authorization: `Bearer ${schluessel}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...kopf },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const context = { request, env, params: { pfad: pfad ? pfad.split('/') : [] }, data: {} };
  context.next = () => route(context);
  const antwort = await middleware(context);
  const text = await antwort.text();
  const daten = text ? JSON.parse(text) : {};
  // http = HTTP-Status; status = Bestellstatus, falls die Antwort einen hat
  return { ...daten, http: antwort.status, status: daten.status ?? antwort.status, kopf: antwort.headers };
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
  assert.equal(r.http ?? r.status, status);
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

// ------------------------------------------------------------
// Phase W4: Fleischrunden lesen und bestellen
// ------------------------------------------------------------
const mails = [];
globalThis.fetch = async (url, optionen) => {
  assert.equal(url, 'https://api.resend.com/emails');
  mails.push(JSON.parse(optionen.body));
  return new Response('{}', { status: 200 });
};
env.RESEND_API_KEY = 'test';
env.CONTACT_TO = 'hof@example.at';

const voll = ok(await vw('schnittstelle/zugang', { name: 'Bertha', rechte: ['katalog', 'angebot', 'bestellen'] }));
const kv = voll.schluessel;
fehlerCode(await extern('angebot', { schluessel }), 403, 'keine_berechtigung');
fehlerCode(await extern('bestellungen', { schluessel, methode: 'POST', body: {} }), 403, 'keine_berechtigung');

// Runden: offen im Portal, offen ohne Portal, Bestellschluss vorbei, Entwurf
const huhn = produkt('Masthuhn ganz').id;
const rind = produkt('Rindfleischpaket 5 kg').id;
const runde = async (titel, extra) => Number(ok(await vw('charge', {
  titel, bestellschluss: '2099-10-01', status: 'offen',
  termine: [{ art: 'abholung', datum: '2099-10-10', von: '09:00', bis: '12:00' }, { art: 'lieferung', datum: '2099-10-09' }],
  artikel: [{ produktId: huhn, preisCent: 1200, kontingent: 3, maxProBestellung: 2 }, { produktId: rind, preisCent: 7500, kontingent: 5 }],
  ...extra,
})).chargeId);
const rPortal = await runde('Masthühner Herbst');
const rOhne = await runde('Nur Stammkunden-Link', { imPortal: false });
const rVorbei = await runde('Vorbei');
roh.prepare(`UPDATE chargen SET bestellschluss = '2020-01-01' WHERE id = ?`).run(rVorbei);
await runde('Entwurf', { status: 'entwurf' });

let a = ok(await extern('angebot', { schluessel: kv }));
assert.deepEqual(a.runden.map((r) => r.titel), ['Masthühner Herbst']);
assert.equal(a.bestellbedingungen_url, 'https://www.kruckenhaus.at/hofladen.html#bedingungen');
assert.deepEqual(a.liefergebiet.map((l) => l.plz), ['6252', '6233', '6230', '6250']);
const r1 = a.runden[0];
assert.equal(r1.termine.length, 2);
assert.ok(r1.termine.every((t) => t.text));
const aHuhn = r1.artikel.find((x) => x.produkt_id === huhn);
const aRind = r1.artikel.find((x) => x.produkt_id === rind);
assert.deepEqual([aHuhn.preis_je, aHuhn.frei, aHuhn.max_pro_bestellung, aHuhn.ca_preis_je_stueck_cent], ['kg', 3, 2, 2520]);
assert.deepEqual([aRind.preis_je, aRind.ca_preis_je_stueck_cent], ['Paket', null]);
assert.ok(!JSON.stringify(a).includes('Dauersortiment'));
console.log('✓ /angebot: nur offene Runden „im Portal", Termine, freie Menge, ca.-Preis, Liefergebiet');

const tAbh = r1.termine.find((t) => t.art === 'abholung').id;
const tLief = r1.termine.find((t) => t.art === 'lieferung').id;
const kunde = { externe_id: 'c_8Hk2abc', name: 'Maria Muster', email: 'maria@example.at', telefon: '+43 664 1234567' };
const zustimmung = { bestellbedingungen: '2026-10', zeitpunkt: '2026-10-13T08:20:11Z' };
const bestellung = (extra = {}) => ({
  runde_id: rPortal, termin_id: tAbh, zahlart: 'ueberweisung', anmerkung: 'Gerne eher größere Hühner',
  positionen: [{ artikel_id: aHuhn.id, menge: 2 }], kunde, zustimmung, ...extra,
});
const post = (body, key = 'anfrage-0001', schl = kv) => extern('bestellungen', {
  schluessel: schl, methode: 'POST', body, kopf: key ? { 'Idempotency-Key': key } : {},
});

// Eingaben
fehlerCode(await post(bestellung(), null), 400, 'ungueltig');
fehlerCode(await post(bestellung(), 'kurz'), 400, 'ungueltig');
fehlerCode(await post(bestellung({ kunde: { ...kunde, externe_id: '' } }), 'anfrage-x1'), 400, 'ungueltig');
fehlerCode(await post(bestellung({ kunde: { ...kunde, email: 'keine' } }), 'anfrage-x2'), 400, 'ungueltig');
fehlerCode(await post(bestellung({ zustimmung: undefined }), 'anfrage-x3'), 400, 'ungueltig');
fehlerCode(await post(bestellung({ positionen: [{ artikel_id: aHuhn.id, menge: 3 }] }), 'anfrage-x4'), 400, 'ungueltig');
fehlerCode(await post(bestellung({ positionen: [{ artikel_id: 99999, menge: 1 }] }), 'anfrage-x5'), 404, 'nicht_gefunden');
fehlerCode(await post(bestellung({ runde_id: 99999 }), 'anfrage-x6'), 404, 'nicht_gefunden');
fehlerCode(await post(bestellung({ termin_id: 99999 }), 'anfrage-x7'), 404, 'nicht_gefunden');
fehlerCode(await post(bestellung({ runde_id: rVorbei }), 'anfrage-x8'), 409, 'bestellschluss');
fehlerCode(await post(bestellung({ runde_id: rOhne }), 'anfrage-x9'), 409, 'nicht_im_portal');
fehlerCode(await post(bestellung({ termin_id: tLief, kunde: { ...kunde, strasse: 'Weg 1', plz: '1010', ort: 'Wien' } }), 'anfrage-x10'),
  409, 'ausserhalb_liefergebiet');
fehlerCode(await post(JSON.stringify({ ...bestellung(), anmerkung: 'x'.repeat(25000) }), 'anfrage-x11'), 413, 'zu_gross');
fehlerCode(await post('{kaputt', 'anfrage-x12'), 400, 'ungueltig');
assert.equal(roh.prepare('SELECT COUNT(*) AS n FROM bestellungen').get().n, 0, 'nichts angelegt');
assert.equal(mails.length, 0);
console.log('✓ Fehler: 400 Eingabe/Höchstmenge, 404 Runde/Termin/Artikel, 409 Bestellschluss/Portal/Liefergebiet, 413');

// Bestellung, Wiederholung mit demselben Schlüssel → dieselbe Antwort, keine zweite Bestellung
let b = await post(bestellung());
assert.deepEqual([b.http, b.ok, b.status], [201, true, 'vorgemerkt']);
const erste = { nummer: b.nummer, summe: b.summe_ca_cent };
assert.match(b.nummer, /^\d{4}-001$/);
assert.equal(b.summe_ca_cent, 5040);
assert.equal(b.geschaetzt, true);
assert.match(b.termin, /Abholung/);
let nochmal = await post(bestellung());
assert.equal(nochmal.http, 200);
assert.equal(nochmal.kopf.get('Idempotent-Replayed'), 'true');
assert.deepEqual([nochmal.nummer, nochmal.summe_ca_cent], [erste.nummer, erste.summe]);
assert.equal(roh.prepare('SELECT COUNT(*) AS n FROM bestellungen').get().n, 1);
assert.equal(mails.length, 2, 'Mails nur einmal');
console.log('✓ Idempotenz: zweimal derselbe Schlüssel → eine Bestellung, gleiche Antwort (201, dann 200)');

// Gespeichert: quelle web, Zustimmung, Zuordnung, Mails
const db1 = roh.prepare('SELECT * FROM bestellungen WHERE nummer = ?').get(erste.nummer);
assert.deepEqual([db1.quelle, db1.status, db1.zahlart, db1.termin_id, db1.anmerkung],
  ['web', 'vorgemerkt', 'ueberweisung', tAbh, 'Gerne eher größere Hühner']);
const ea = roh.prepare('SELECT * FROM extern_anfragen WHERE bestellung_id = ?').get(db1.id);
assert.deepEqual(JSON.parse(ea.zustimmung), zustimmung);
assert.equal(JSON.parse(ea.antwort).nummer, erste.nummer);
const ek = roh.prepare('SELECT * FROM extern_kunden WHERE externe_id = ?').get(kunde.externe_id);
assert.equal(ek.kunde_id, db1.kunde_id);
const [anKunde, anHof] = [mails.find((m) => m.to === kunde.email), mails.find((m) => m.to === 'hof@example.at')];
assert.match(anKunde.html, /meine-bestellungen\.html#/);
assert.match(anKunde.html, /Masthuhn ganz/);
assert.ok(!/Bertha/.test(anKunde.html), 'Kunden-Mail wie auf der Website');
assert.match(anHof.subject, /über Bertha-Portal/);
assert.match(anHof.html, /über Bertha-Portal/);
console.log('✓ Gespeichert mit Zustimmung (Version, Zeitpunkt); Mails wie auf der Website, Hof-Mail „über Bertha"');

// Verwaltung: ganz normale Bestellung mit Zeichen „über Bertha"
let st = ok(await vw('stand'));
const inListe = st.bestellungen.find((x) => x.nummer === erste.nummer);
assert.deepEqual([inListe.ueberBertha, inListe.neu, inListe.quelle], [true, true, 'web']);
console.log('✓ Verwaltung: Bestellung mit „über Bertha" und „neu"');

// Kundenzuordnung: gleiche externe_id mit anderer E-Mail → derselbe Kunde, nichts überschrieben
b = ok(await post(bestellung({ positionen: [{ artikel_id: aRind.id, menge: 1 }], kunde: { ...kunde, email: 'neu@example.at' } }), 'anfrage-0002'));
const db2 = roh.prepare('SELECT * FROM bestellungen WHERE nummer = ?').get(b.nummer);
assert.equal(db2.kunde_id, db1.kunde_id);
assert.equal(roh.prepare('SELECT email FROM kunden WHERE id = ?').get(db1.kunde_id).email, 'maria@example.at');
assert.equal(b.geschaetzt, false);
// Andere externe_id, aber bekannte E-Mail → bestehender Website-Kunde
roh.exec(`INSERT INTO kunden (name, email, telefon) VALUES ('Hans Hof', 'hans@example.at', '0660 111111')`);
const hans = roh.prepare(`SELECT id FROM kunden WHERE email = 'hans@example.at'`).get().id;
b = ok(await post(bestellung({ positionen: [{ artikel_id: aHuhn.id, menge: 1 }],
  kunde: { externe_id: 'c_hans', name: 'Hans H.', email: 'HANS@example.at', telefon: '0660 222222' } }), 'anfrage-0003'));
assert.equal(roh.prepare('SELECT kunde_id FROM bestellungen WHERE nummer = ?').get(b.nummer).kunde_id, hans);
assert.equal(roh.prepare('SELECT name, telefon FROM kunden WHERE id = ?').get(hans).telefon, '0660 111111');
console.log('✓ Kunden: Zuordnung über externe_id, sonst über die E-Mail; Vorhandenes bleibt');

// Menge erschöpft → Warteliste (kein Fehler)
b = ok(await post(bestellung({ positionen: [{ artikel_id: aHuhn.id, menge: 1 }],
  kunde: { ...kunde, externe_id: 'c_spaet', email: 'spaet@example.at' } }), 'anfrage-0004'));
assert.equal(b.status, 'warteliste');
assert.match(b.hinweis, /Warteliste/);
a = ok(await extern('angebot', { schluessel: kv }));
assert.equal(a.runden[0].artikel.find((x) => x.produkt_id === huhn).frei, 0);
console.log('✓ Ausverkauft → Warteliste, /angebot zeigt frei: 0');

// Limit: höchstens 3 offene Bestellungen je Bertha-Kunde und Runde
ok(await post(bestellung({ positionen: [{ artikel_id: aRind.id, menge: 1 }] }), 'anfrage-0005'));
fehlerCode(await post(bestellung({ positionen: [{ artikel_id: aRind.id, menge: 1 }] }), 'anfrage-0006'), 429, 'zu_viele');
// Storniert zählt nicht mehr mit
ok(await vw(`bestellung/${db2.id}`, { aktion: 'stornieren', mail: false }));
ok(await post(bestellung({ positionen: [{ artikel_id: aRind.id, menge: 1 }] }), 'anfrage-0007'));
console.log('✓ Limit je Kunde und Runde (3 offene), stornierte zählen nicht');

// Limit: 30 Bestellungen pro Stunde je Zugang
const zid = roh.prepare(`SELECT id FROM schnittstellen_zugaenge WHERE name = 'Bertha' AND rechte LIKE '%bestellen%'`).get().id;
const einf = roh.prepare(`INSERT INTO extern_anfragen (zugang_id, anfrage_id) VALUES (?, ?)`);
for (let i = 0; i < 30; i += 1) einf.run(zid, `fuell-${i}-xxxxxx`);
fehlerCode(await post(bestellung({ kunde: { ...kunde, externe_id: 'c_neu' } }), 'anfrage-0008'), 429, 'zu_viele');
roh.prepare(`DELETE FROM extern_anfragen WHERE anfrage_id LIKE 'fuell-%'`).run();
console.log('✓ Limit 30 Bestellungen pro Stunde je Zugang');

// Gleichzeitige Wiederholung: Anfrage noch ohne Antwort → 409 in_bearbeitung
einf.run(zid, 'anfrage-laeuft');
fehlerCode(await post(bestellung(), 'anfrage-laeuft'), 409, 'in_bearbeitung');
// Abbruch zwischen Anlegen und Speichern der Antwort: Antwort wird aus der Bestellung gebaut
roh.prepare(`UPDATE extern_anfragen SET antwort = NULL WHERE anfrage_id = 'anfrage-0001'`).run();
b = await post(bestellung());
assert.deepEqual([b.http, b.nummer, b.summe_ca_cent], [200, erste.nummer, erste.summe]);
assert.match(b.termin, /Abholung/);
console.log('✓ Gleichzeitige Wiederholung → 409 in_bearbeitung; fehlende Antwort wird aus der Bestellung gebaut');

// Pausiert → 503, auch für Bestellungen
ok(await vw('schnittstelle/pausieren', { pausiert: true }));
fehlerCode(await post(bestellung(), 'anfrage-0009'), 503, 'pausiert');
ok(await vw('schnittstelle/pausieren', { pausiert: false }));

// Protokoll weiterhin ohne personenbezogene Daten
const protokoll2 = JSON.stringify(roh.prepare('SELECT * FROM schnittstellen_protokoll').all());
for (const verboten of ['maria', 'Maria', 'Muster', 'example', '@', 'c_8Hk2abc', 'anfrage-0001', '664', 'Hühner', kv]) {
  assert.ok(!protokoll2.includes(verboten), `Protokoll enthält ${verboten}`);
}
assert.ok(protokoll2.includes('POST /v1/bestellungen'));
console.log('✓ Protokoll ohne Namen, E-Mails, Telefon, Kunden- oder Anfrage-Kennung');

console.log('\nAlle Tests der Schnittstelle bestanden.');
