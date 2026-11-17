/* ============================================================
 * TEST – Freilandeier: Anmeldung „Kunde werden", Aktuelles vom Stall,
 * Verwaltung (Status, Notiz, CSV für Bertha, Löschen)
 * ============================================================
 * Prüft functions/api/eier/[[pfad]].js und die Eier-Routen unter
 * /api/verwaltung/eier/… (functions/_lib/eier.js) gegen einen D1-Nachbau:
 *   - gültige Anmeldung → gespeichert (Status neu, ohne IP), Mail an den Hof
 *     und Bestätigung ohne frei eingegebene Texte
 *   - ungültige Anmeldungen → 400 mit verständlicher Meldung, nichts gespeichert
 *   - Honeypot → still „ok", nichts gespeichert, keine Mail
 *   - ohne Resend-Schlüssel trotzdem gespeichert; ohne DB und ohne Mail → 500
 *   - Neuigkeiten: nur sichtbare, neueste zuerst; ohne Tabelle leer
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-eier.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest as eier } from '../functions/api/eier/[[pfad]].js';
import { onRequest as verwaltung } from '../functions/api/verwaltung/[[pfad]].js';

const { roh, db } = d1Nachbau();
roh.exec(readFileSync(new URL('../schema-eier.sql', import.meta.url), 'utf8'));
// zweimal einspielen: Schema muss mehrfach ausführbar sein
roh.exec(readFileSync(new URL('../schema-eier.sql', import.meta.url), 'utf8'));

// Resend-Ersatz: gesendete Mails mitschreiben
let mails = [];
let resendAntwort = 200;
globalThis.fetch = async (url, optionen) => {
  assert.equal(url, 'https://api.resend.com/emails');
  mails.push(JSON.parse(optionen.body));
  return new Response('{}', { status: resendAntwort });
};
const env = { DB: db, RESEND_API_KEY: 'test', CONTACT_TO: 'hof@example.at' };

// Fehlerprotokolle der Functions im Testlauf stummschalten
const consoleError = console.error;
console.error = () => {};

async function aufruf(handler, basis, methode, pfad, eingabe, umgebung = env) {
  const request = new Request(`https://www.kruckenhaus.at/api/${basis}/${pfad}`, {
    method: methode,
    headers: eingabe !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: eingabe !== undefined ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await handler({ request, env: umgebung, params: { pfad: pfad.split('?')[0].split('/') }, data: { nutzer: 'test@example.at' } });
  const typ = antwort.headers.get('content-type') || '';
  return typ.includes('json')
    ? { status: antwort.status, ...(await antwort.json()) }
    : { status: antwort.status, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await antwort.arrayBuffer()), kopf: antwort.headers };
}
const oeffentlich = (methode, pfad, eingabe, umgebung) => aufruf(eier, 'eier', methode, pfad, eingabe, umgebung);
const vw = (methode, pfad, eingabe) => aufruf(verwaltung, 'verwaltung', methode, `eier/${pfad}`, eingabe);
const anzahl = () => roh.prepare('SELECT COUNT(*) AS n FROM eier_anmeldungen').get().n;

const gueltig = {
  name: 'Maria Musterfrau',
  strasse: 'Dorfstraße 12',
  plz: '6250',
  ort: 'Kundl',
  telefon: '+43 660 1234567',
  email: 'Maria@Example.at',
  schachteln: 2,
  rhythmus: 'woechentlich',
  abstellort: 'anderer',
  abstellortHinweis: 'Kiste neben der Garage <b>bitte</b>',
  herkunft: 'empfehlung',
  empfohlenVon: 'Familie Huber',
  datenschutz: true,
  neuigkeiten: true,
  'bot-field': '',
};

/* ---------- 1. Gültige Anmeldung ---------- */
let r = await oeffentlich('POST', 'anmeldung', gueltig);
assert.equal(r.status, 200, r.error);
assert.equal(r.ok, true);
const zeile = roh.prepare('SELECT * FROM eier_anmeldungen').get();
assert.equal(zeile.status, 'neu');
assert.equal(zeile.email, 'maria@example.at', 'E-Mail klein gespeichert');
assert.equal(zeile.schachteln, 2);
assert.equal(zeile.empfohlen_von, 'Familie Huber');
assert.equal(zeile.neuigkeiten, 1);
assert.ok(zeile.neuigkeiten_seit, 'Zeitpunkt der Einwilligung gespeichert');
assert.ok(zeile.datenschutz_am);
assert.ok(!Object.keys(zeile).some((k) => /ip|agent/i.test(k)), 'keine Spalte für IP oder Browserkennung');
assert.equal(mails.length, 2);
const [anHof, bestaetigung] = mails;
assert.equal(anHof.to, 'hof@example.at');
assert.equal(anHof.reply_to, 'maria@example.at');
assert.match(anHof.subject, /Maria Musterfrau \(Kundl\)/);
assert.match(anHof.html, /im Liefergebiet/);
assert.match(anHof.html, /&lt;b&gt;bitte&lt;\/b&gt;/, 'Eingaben in der Hof-Mail escaped');
assert.ok(anHof.text && !anHof.text.includes('<table'), 'Nur-Text-Fassung dabei');
assert.equal(bestaetigung.to, 'maria@example.at');
assert.equal(bestaetigung.reply_to, 'hof@example.at');
assert.match(bestaetigung.html, /2 Schachteln, wöchentlich/);
assert.match(bestaetigung.html, /Frühjahr 2027/);
assert.ok(!bestaetigung.html.includes('Garage') && !bestaetigung.html.includes('Huber'),
  'Bestätigung ohne frei eingegebene Texte');
assert.match(bestaetigung.html, /kruckenhaus-logo-mail\.png/, 'gemeinsame Mail-Vorlage');
console.log('✓ Gültige Anmeldung: gespeichert (Status neu, ohne IP), Mail an den Hof, Bestätigung ohne freie Texte');

// Brixlegg und außerhalb werden angenommen, aber gekennzeichnet
mails = [];
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, plz: '6230', ort: 'Brixlegg', herkunft: 'internet', neuigkeiten: false }));
assert.match(mails[0].html, /Brixlegg \(könnten wir dazunehmen\)/);
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, plz: '6300', ort: 'Wörgl', abstellort: 'haustuer', abstellortHinweis: '', herkunft: '' }));
assert.match(mails[2].html, /außerhalb des Liefergebiets/);
const brixlegg = roh.prepare(`SELECT * FROM eier_anmeldungen WHERE ort = 'Brixlegg'`).get();
assert.equal(brixlegg.empfohlen_von, null, '„Empfohlen von" nur bei Empfehlung');
assert.equal(brixlegg.neuigkeiten, 0);
assert.equal(brixlegg.neuigkeiten_seit, null);
console.log('✓ Liefergebiet nach PLZ: im Gebiet, Brixlegg möglich, außerhalb – alle gespeichert');

/* ---------- 2. Ungültige Anmeldungen ---------- */
mails = [];
const vorher = anzahl();
async function abgelehnt(aenderung, muster) {
  const x = await oeffentlich('POST', 'anmeldung', { ...gueltig, ...aenderung });
  assert.equal(x.status, 400, `${JSON.stringify(aenderung)} → ${x.status}`);
  assert.equal(x.ok, false);
  assert.match(x.error, muster);
}
await abgelehnt({ name: ' ' }, /Namen/);
await abgelehnt({ strasse: '' }, /Straße/);
await abgelehnt({ plz: '625' }, /Postleitzahl/);
await abgelehnt({ plz: 'A-6250' }, /Postleitzahl/);
await abgelehnt({ ort: '' }, /Ort/);
await abgelehnt({ telefon: '12' }, /Telefonnummer/);
await abgelehnt({ telefon: 'ruft mich an 0660123456' }, /Telefonnummer/);
await abgelehnt({ email: 'keine-mail' }, /E-Mail/);
await abgelehnt({ schachteln: 0 }, /Schachteln/);
await abgelehnt({ schachteln: -2 }, /Schachteln/);
await abgelehnt({ schachteln: 1.5 }, /Schachteln/);
await abgelehnt({ rhythmus: 'monatlich' }, /wöchentlich oder 14-tägig/);
await abgelehnt({ abstellort: 'dach' }, /abstellen/);
await abgelehnt({ abstellort: 'anderer', abstellortHinweis: '' }, /beschreibt kurz/);
await abgelehnt({ herkunft: 'zeitung' }, /erfahren/);
await abgelehnt({ datenschutz: false }, /Datenschutzhinweis/);
await abgelehnt({ datenschutz: undefined }, /Datenschutzhinweis/);
assert.equal(anzahl(), vorher, 'nichts gespeichert');
assert.equal(mails.length, 0, 'keine Mail');
r = await eier({
  request: new Request('https://www.kruckenhaus.at/api/eier/anmeldung', { method: 'POST', body: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
  env, params: { pfad: ['anmeldung'] },
});
assert.equal(r.status, 415);
r = await eier({
  request: new Request('https://www.kruckenhaus.at/api/eier/anmeldung', { method: 'POST', body: '{kaputt', headers: { 'Content-Type': 'application/json' } }),
  env, params: { pfad: ['anmeldung'] },
});
assert.equal(r.status, 400);
assert.equal((await oeffentlich('GET', 'anmeldung')).status, 404);
console.log('✓ Ungültige Anmeldungen: 400 mit Meldung (Pflichtfelder, PLZ, Telefon, Menge, Auswahl, Datenschutz), nichts gespeichert');

/* ---------- 3. Honeypot ---------- */
r = await oeffentlich('POST', 'anmeldung', { ...gueltig, 'bot-field': 'http://spam.example' });
assert.equal(r.status, 200);
assert.equal(r.ok, true, 'Bots merken nichts');
r = await oeffentlich('POST', 'anmeldung', { 'bot-field': 'x' });
assert.equal(r.ok, true, 'auch ohne sonstige Felder still ok');
assert.equal(anzahl(), vorher, 'nichts gespeichert');
assert.equal(mails.length, 0, 'keine Mail');
console.log('✓ Honeypot: still „ok", nichts gespeichert, keine Mail');

/* ---------- 4. Ohne Mail bzw. ohne Datenbank ---------- */
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Ohne Mail' }, { DB: db }));
assert.equal(anzahl(), vorher + 1, 'ohne RESEND_API_KEY trotzdem gespeichert');
assert.equal(mails.length, 0);
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Ohne DB' }, { RESEND_API_KEY: 'test' }));
assert.equal(mails.length, 2, 'ohne Datenbank gehen die Mails trotzdem raus');
mails = [];
r = await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Gar nichts' }, {});
assert.equal(r.status, 500, 'weder gespeichert noch gemailt → Fehler fürs Formular');
resendAntwort = 422;
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Resend lehnt ab' }));
resendAntwort = 200;
mails = [];
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Ohne Bestätigung' }, { ...env, CONTACT_BESTAETIGUNG: 'aus' }));
assert.deepEqual(mails.map((m) => m.to), ['hof@example.at']);
console.log('✓ Ohne Resend gespeichert, ohne DB gemailt, beides weg → 500; Bestätigung abschaltbar');

/* ---------- 5. Verwaltung: Liste, Status, Notiz, CSV, Löschen ---------- */
r = ok(await vw('GET', 'stand'));
assert.equal(r.anmeldungen.length, anzahl());
const maria = r.anmeldungen.find((a) => a.name === 'Maria Musterfrau' && a.ort === 'Kundl');
assert.equal(maria.gebiet, 'ja');
assert.equal(maria.status, 'neu');
assert.equal(typeof maria.id, 'string');
ok(await vw('POST', `anmeldung/${maria.id}`, { status: 'warteliste', notiz: 'ab März' }));
let z = roh.prepare('SELECT status, notiz, geaendert_am FROM eier_anmeldungen WHERE id = ?').get(Number(maria.id));
assert.deepEqual([z.status, z.notiz], ['warteliste', 'ab März']);
assert.ok(z.geaendert_am);
ok(await vw('POST', `anmeldung/${maria.id}`, { status: 'angenommen' }));
assert.equal(roh.prepare('SELECT notiz FROM eier_anmeldungen WHERE id = ?').get(Number(maria.id)).notiz, 'ab März', 'Notiz bleibt');
assert.equal((await vw('POST', `anmeldung/${maria.id}`, { status: 'kunde' })).status, 400);
assert.equal((await vw('POST', `anmeldung/${maria.id}`, {})).status, 400);
assert.equal((await vw('POST', 'anmeldung/99999', { status: 'neu' })).status, 400);
assert.equal((await vw('POST', 'anmeldung/abc', { status: 'neu' })).status, 400);

r = await vw('GET', 'export?status=angenommen');
assert.equal(r.status, 200);
assert.match(r.kopf.get('content-type'), /text\/csv/);
assert.match(r.kopf.get('content-disposition'), /eierkunden-\d{4}-\d{2}-\d{2}\.csv/);
assert.ok(r.text.startsWith('﻿"Nr.";"Angemeldet am";"Status";"Name"'), 'BOM, Semikolon, Kopfzeile');
let csvZeilen = r.text.trim().split('\r\n');
assert.equal(csvZeilen.length, 2, 'nur angenommene');
assert.match(csvZeilen[1], /"Maria Musterfrau";"Dorfstraße 12";"6250";"Kundl";"im Liefergebiet";"0043 660 1234567";"maria@example.at";2;"wöchentlich"/);
assert.match(csvZeilen[1], /"ab März"$/);
r = await vw('GET', 'export');
assert.equal(r.text.trim().split('\r\n').length, anzahl() + 1, 'ohne Filter alle');
r = await vw('GET', 'export?status=neu,warteliste');
assert.equal(r.text.trim().split('\r\n').length, anzahl(), 'mehrere Status, ohne die angenommene');
assert.equal((await vw('GET', 'export?status=quatsch')).status, 400);
// Formel-Schutz für Excel
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: '=HYPERLINK("x")' }));
r = await vw('GET', 'export?status=neu');
assert.match(r.text, /"'=HYPERLINK\(""x""\)"/);
console.log('✓ Verwaltung: Liste, Status und Notiz ändern, CSV für Excel/Bertha mit Filter und Formel-Schutz');

const formelId = roh.prepare(`SELECT id FROM eier_anmeldungen WHERE name LIKE '=%'`).get().id;
ok(await vw('POST', `anmeldung/${formelId}/loeschen`, {}));
assert.equal(roh.prepare('SELECT COUNT(*) AS n FROM eier_anmeldungen WHERE id = ?').get(formelId).n, 0);
assert.equal((await vw('POST', `anmeldung/${formelId}/loeschen`, {})).status, 400);
console.log('✓ Anmeldung endgültig löschen');

// Keine Obergrenze bei den Schachteln (z. B. Gasthaus)
ok(await oeffentlich('POST', 'anmeldung', { ...gueltig, name: 'Gasthaus Groß', schachteln: 30 }));
assert.equal(roh.prepare(`SELECT schachteln FROM eier_anmeldungen WHERE name = 'Gasthaus Groß'`).get().schachteln, 30);
console.log('✓ Schachteln ohne Obergrenze (30 angenommen)');

/* ---------- 6. Aktuelles vom Stall ---------- */
assert.deepEqual(ok(await oeffentlich('GET', 'neuigkeiten')).neuigkeiten, []);
const a = ok(await vw('POST', 'neuigkeit', { datum: '2026-11-10', titel: 'Älterer Eintrag', text: 'Text A' })).id;
const b = ok(await vw('POST', 'neuigkeit', { datum: '2026-11-15', titel: 'Neuer Eintrag', text: 'Text B' })).id;
const c = ok(await vw('POST', 'neuigkeit', { datum: '2026-11-16', titel: 'Entwurf', text: 'noch nicht', sichtbar: false })).id;
r = ok(await oeffentlich('GET', 'neuigkeiten'));
assert.deepEqual(r.neuigkeiten.map((n) => n.titel), ['Neuer Eintrag', 'Älterer Eintrag'], 'nur sichtbare, neueste zuerst');
assert.deepEqual(Object.keys(r.neuigkeiten[0]).sort(), ['datum', 'text', 'titel'], 'öffentlich ohne IDs');
ok(await vw('POST', `neuigkeit/${c}`, { datum: '2026-11-16', titel: 'Jetzt sichtbar', text: 'fertig', sichtbar: true }));
ok(await vw('POST', `neuigkeit/${a}/loeschen`, {}));
r = ok(await oeffentlich('GET', 'neuigkeiten'));
assert.deepEqual(r.neuigkeiten.map((n) => n.titel), ['Jetzt sichtbar', 'Neuer Eintrag']);
assert.equal(ok(await vw('GET', 'stand')).neuigkeiten.length, 2);
for (const [eingabe, muster] of [
  [{ datum: '16.11.2026', titel: 'x', text: 'y' }, /Datum/],
  [{ datum: '2026-13-45', titel: 'x', text: 'y' }, /Datum/],
  [{ datum: '2026-11-16', titel: '', text: 'y' }, /Überschrift/],
  [{ datum: '2026-11-16', titel: 'x', text: ' ' }, /Text/],
]) {
  const x = await vw('POST', 'neuigkeit', eingabe);
  assert.equal(x.status, 400);
  assert.match(x.error, muster);
}
assert.equal((await vw('POST', `neuigkeit/${b}`, { datum: '2026-11-16', titel: 'x', text: 'y' })).ok, true);
assert.equal((await vw('POST', 'neuigkeit/99999', { datum: '2026-11-16', titel: 'x', text: 'y' })).status, 400);
assert.equal((await vw('POST', 'neuigkeit', 'kein Objekt')).status, 400);
roh.exec('ALTER TABLE stall_neuigkeiten RENAME TO stall_neuigkeiten_weg');
assert.deepEqual(ok(await oeffentlich('GET', 'neuigkeiten')).neuigkeiten, [], 'ohne Tabelle leer statt Fehler');
roh.exec('ALTER TABLE stall_neuigkeiten_weg RENAME TO stall_neuigkeiten');
console.log('✓ Aktuelles vom Stall: anlegen, ändern, ausblenden, löschen; öffentlich nur sichtbare; ohne Tabelle leer');

console.error = consoleError;
console.log('\nAlle Tests der Freilandeier bestanden.');

function ok(x) {
  assert.equal(x.ok, true, `${x.status}: ${x.error}`);
  return x;
}
