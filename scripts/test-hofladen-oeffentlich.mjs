/* ============================================================
 * TEST – Öffentliche Hofladen-Schnittstelle (Bestellseite)
 * ============================================================
 * Prüft functions/api/hofladen/[[pfad]].js: Angebot, Bestellung mit
 * Pflichtfeldern, Liefergebiet, Höchstmenge, Bestellschluss, Warteliste,
 * Spam-Falle, Voranmeldung, E-Mails (über einen Resend-Ersatz) und den
 * persönlichen Link „Meine Bestellungen".
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-oeffentlich.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest } from '../functions/api/hofladen/[[pfad]].js';

const { roh, db } = d1Nachbau();
roh.exec(readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8'));
roh.exec(readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8'));

// Resend-Ersatz: gesendete Mails mitschreiben
const mails = [];
globalThis.fetch = async (url, optionen) => {
  assert.equal(url, 'https://api.resend.com/emails');
  mails.push(JSON.parse(optionen.body));
  return new Response('{}', { status: 200 });
};
const env = { DB: db, RESEND_API_KEY: 'test', CONTACT_TO: 'hof@example.at' };

async function api(methode, pfad, eingabe, kopf = {}) {
  const request = new Request(`https://www.kruckenhaus.at/api/hofladen/${pfad}`, {
    method: methode,
    headers: { ...(eingabe ? { 'Content-Type': 'application/json' } : {}), ...kopf },
    body: eingabe ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await onRequest({ request, env, params: { pfad: pfad.split('/') } });
  return { status: antwort.status, ...(await antwort.json()) };
}
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };
const id = (sql, ...a) => roh.prepare(sql).get(...a).id;

// Bestellrunde anlegen (wie über die Verwaltung)
const morgen = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
roh.prepare(`INSERT INTO chargen (titel, status, bestellschluss) VALUES ('Masthühner Test', 'offen', ?)`).run(morgen);
roh.prepare(`INSERT INTO chargen (titel, status, bestellschluss) VALUES ('Entwurf', 'entwurf', ?)`).run(morgen);
roh.prepare(`INSERT INTO chargen (titel, status, bestellschluss) VALUES ('Vorbei', 'offen', '2020-01-01')`).run();
const cId = id(`SELECT id FROM chargen WHERE titel = 'Masthühner Test'`);
const vorbeiId = id(`SELECT id FROM chargen WHERE titel = 'Vorbei'`);
const huhn = id(`SELECT id FROM produkte WHERE name = 'Masthuhn ganz'`);
const nudeln = id(`SELECT id FROM produkte WHERE name = 'Eiernudeln Spaghetti 500 g'`);
roh.prepare('INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent, max_pro_bestellung) VALUES (?, ?, 1200, 4, 3)').run(cId, huhn);
roh.prepare('INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent) VALUES (?, ?, 400, 10)').run(cId, nudeln);
roh.prepare(`INSERT INTO termine (charge_id, art, datum, von, bis) VALUES (?, 'abholung', ?, '09:00', '12:00')`).run(cId, morgen);
roh.prepare(`INSERT INTO termine (charge_id, art, datum, von, bis) VALUES (?, 'lieferung', ?, '14:00', '18:00')`).run(cId, morgen);
roh.prepare(`INSERT INTO termine (charge_id, art, datum) VALUES (?, 'abholung', '2020-01-02')`).run(vorbeiId);
const aHuhn = id('SELECT id FROM charge_artikel WHERE produkt_id = ? AND charge_id = ?', huhn, cId);
const aNudeln = id('SELECT id FROM charge_artikel WHERE produkt_id = ? AND charge_id = ?', nudeln, cId);
const tAbh = id(`SELECT id FROM termine WHERE charge_id = ? AND art = 'abholung'`, cId);
const tLief = id(`SELECT id FROM termine WHERE charge_id = ? AND art = 'lieferung'`, cId);

// Angebot: nur offene Bestellrunde mit Bestellschluss in der Zukunft
let r = ok(await api('GET', 'angebot'));
assert.deepEqual(r.chargen.map((c) => c.titel), ['Masthühner Test']);
const nudelArtikel = r.chargen[0].artikel.find((a) => a.id === aNudeln);
assert.match(nudelArtikel.pflichtangaben, /Hartweizengrieß, Eier, Salz, Wasser/);
assert.equal(nudelArtikel.allergene, 'Weizen (Gluten), Ei');
assert.equal(r.chargen[0].artikel.find((a) => a.id === aHuhn).frei, 4);
assert.equal(r.liefergebiet.length, 4);
assert.ok(r.produkte.length >= 14);
assert.equal(r.chargen[0].artikel.find((a) => a.id === aNudeln).produktId, nudeln);
const sortimentNudeln = r.produkte.find((p) => p.id === nudeln);
assert.equal(sortimentNudeln.art, 'stueck');
assert.equal(r.bereiche.find((b) => b.id === sortimentNudeln.bereichId).name, 'Eiernudeln');
assert.deepEqual(r.bereiche.map((b) => b.name), ['Fleisch', 'Eiernudeln', 'Honig', 'Alpakaseife', 'Saisonprodukte']);
assert.equal(r.chargen[0].artikel.find((a) => a.id === aNudeln).bereichId, sortimentNudeln.bereichId);
assert.match(sortimentNudeln.pflichtangaben, /Hartweizengrieß/);
assert.deepEqual([r.produkte.find((p) => p.id === huhn).richtVonG, r.produkte.find((p) => p.id === huhn).richtBisG], [1800, 2400]);
// Ausgeblendete Produkte erscheinen nicht im Sortiment
roh.prepare(`UPDATE produkte SET aktiv = 0 WHERE name = 'Alpakaseife'`).run();
assert.ok(!ok(await api('GET', 'angebot')).produkte.some((p) => p.name === 'Alpakaseife'));
roh.prepare(`UPDATE produkte SET aktiv = 1 WHERE name = 'Alpakaseife'`).run();
console.log('✓ Angebot: nur offene Bestellrunden, freie Menge, Pflichtangaben der Nudeln, Liefergebiet, Sortiment');

// Bestellung – Pflichtfelder und Regeln
const basis = {
  chargeId: cId, terminId: tAbh, name: 'Maria Web', email: 'Maria@Example.at', telefon: '+43 660 1234567',
  zahlart: 'ueberweisung', zustimmung: true, positionen: [{ artikelId: aHuhn, menge: 2 }, { artikelId: aNudeln, menge: 1 }],
};
const fehler = async (eingabe, muster) => {
  const x = await api('POST', 'bestellung', eingabe);
  assert.equal(x.status, 400, JSON.stringify(x));
  assert.match(x.error, muster);
};
await fehler({ ...basis, zustimmung: false }, /Bestellbedingungen/);
await fehler({ ...basis, email: 'keine-mail' }, /E-Mail/);
await fehler({ ...basis, telefon: '12' }, /Telefonnummer/);
await fehler({ ...basis, name: '' }, /Namen/);
await fehler({ ...basis, positionen: [] }, /mindestens ein Produkt/);
await fehler({ ...basis, positionen: [{ artikelId: aHuhn, menge: 4 }] }, /Höchstens 3/);
await fehler({ ...basis, terminId: 999 }, /termin/i);
await fehler({ ...basis, chargeId: vorbeiId }, /Bestellschluss/);
await fehler({ ...basis, terminId: tLief, strasse: 'Weg 1', plz: '6300', ort: 'Wörgl' }, /Liefergebiet/);
await fehler({ ...basis, terminId: tLief, plz: '6250' }, /Lieferadresse/);
const falsch = await onRequest({
  request: new Request('https://www.kruckenhaus.at/api/hofladen/bestellung', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } }),
  env, params: { pfad: ['bestellung'] },
});
assert.equal(falsch.status, 400);
assert.equal(mails.length, 0, 'bei Fehlern keine Mails');
console.log('✓ Pflichtfelder, Zustimmung, Höchstmenge, Termin, Bestellschluss, Liefergebiet und Adresse geprüft');

// Spam-Falle: scheinbar ok, aber nichts gespeichert
r = ok(await api('POST', 'bestellung', { ...basis, 'bot-field': 'ich bin ein bot' }));
assert.equal(roh.prepare('SELECT COUNT(*) n FROM bestellungen').get().n, 0);
console.log('✓ Spam-Falle speichert nichts');

// Gültige Bestellung
r = ok(await api('POST', 'bestellung', basis));
assert.match(r.nummer, /^\d{4}-001$/);
assert.equal(r.status, 'vorgemerkt');
assert.match(r.link, /^https:\/\/www\.kruckenhaus\.at\/meine-bestellungen\.html#[A-Za-z0-9_-]{43}$/);
const schluessel1 = r.link.split('#')[1];
assert.equal(mails.length, 2);
const [anKunde, anHof] = mails;
assert.deepEqual([anKunde.to, anHof.to], ['maria@example.at', 'hof@example.at']);
assert.match(anKunde.html, /fix vorgemerkt/);
assert.match(anKunde.html, new RegExp(schluessel1));
assert.match(anKunde.html, /ca\. €\s5[0-9],/);   // 2 Hühner à ca. 2,1 kg × 12 € + 4 € Nudeln
assert.equal(anHof.reply_to, 'maria@example.at');
const gespeichert = roh.prepare('SELECT quelle, zahlart FROM bestellungen').get();
assert.deepEqual({ ...gespeichert }, { quelle: 'web', zahlart: 'ueberweisung' });
assert.equal(roh.prepare('SELECT COUNT(*) n FROM kunden_links').get().n, 1);
assert.notEqual(roh.prepare('SELECT schluessel_hash h FROM kunden_links').get().h, schluessel1, 'nur die Prüfsumme gespeichert');
console.log('✓ Bestellung gespeichert, Nummer, Link, Mail an Kunden und Hof');

// Zweite Bestellung derselben E-Mail (andere Schreibweise): gleicher Kunde, Lieferung; Rest → Warteliste
mails.length = 0;
r = ok(await api('POST', 'bestellung', {
  ...basis, email: 'maria@example.at', name: 'Maria Anders', terminId: tLief, strasse: 'Dorf 5', plz: '6252', ort: 'Breitenbach',
  positionen: [{ artikelId: aHuhn, menge: 3 }],
}));
assert.equal(r.status, 'warteliste');
assert.match(mails[0].html, /Warteliste/);
assert.equal(roh.prepare('SELECT COUNT(*) n FROM kunden').get().n, 1, 'kein doppelter Kunde');
assert.equal(roh.prepare('SELECT name FROM kunden').get().name, 'Maria Web', 'bestehende Daten nicht überschrieben');
assert.equal(roh.prepare('SELECT strasse FROM kunden').get().strasse, 'Dorf 5', 'leere Felder ergänzt');
assert.equal(roh.prepare(`SELECT lieferadresse FROM bestellungen WHERE status = 'warteliste'`).get().lieferadresse, 'Dorf 5, 6252 Breitenbach');
const schluessel2 = r.link.split('#')[1];
console.log('✓ Gleiche E-Mail = gleicher Kunde, nichts überschrieben, Überbuchung → Warteliste mit passender Mail');

// Voranmeldung
mails.length = 0;
r = await api('POST', 'voranmeldung', { name: 'Otto Voran', email: 'otto@example.at', telefon: '0660 9876543', zustimmung: true, produktId: huhn, menge: 3, zeitraum: 'ostern' });
assert.equal(r.status, 400);
r = ok(await api('POST', 'voranmeldung', {
  name: 'Otto Voran', email: 'otto@example.at', telefon: '0660 9876543', zustimmung: true,
  produktId: huhn, menge: 3, zeitraum: 'fruehjahr', jahr: new Date().getFullYear() + 1, notiz: 'gern größere',
}));
assert.equal(roh.prepare(`SELECT quelle FROM voranmeldungen`).get().quelle, 'web');
assert.match(mails[0].html, /unverbindlich/);
assert.match(mails[0].html, /3× Masthuhn ganz \(Frühjahr/);
const schluesselOtto = r.link.split('#')[1];
console.log('✓ Voranmeldung mit Prüfung des Zeitraums, Mail „unverbindlich"');

// Meine Bestellungen
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 }));
assert.equal(r.name, 'Maria Web');
assert.equal(r.bestellungen.length, 2);
assert.deepEqual(r.bestellungen.map((b) => b.status).sort(), ['vorgemerkt', 'warteliste']);
assert.equal(r.bestellungen.find((b) => b.status === 'vorgemerkt').positionen.length, 2);
assert.equal(r.bank, null, 'ohne Bank-Secrets keine Bankverbindung');
// Bankverbindung erst, wenn alles gewogen ist und die Überweisung offen ist
Object.assign(env, { BANK_INHABER: 'Test Inhaber', BANK_IBAN: 'AT000000000000000000', BANK_BIC: 'TESTATXX' });
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 }));
assert.equal(r.bank, null, 'Betrag noch geschätzt → keine Bankverbindung');
roh.prepare(`UPDATE bestell_positionen SET gewicht_g = 4200 WHERE bestellung_id =
  (SELECT id FROM bestellungen WHERE status = 'vorgemerkt' AND zahlart = 'ueberweisung' ORDER BY id LIMIT 1)
  AND charge_artikel_id = ?`).run(aHuhn);
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 }));
const gewogen = r.bestellungen.find((b) => b.status === 'vorgemerkt');
assert.equal(gewogen.geschaetzt, false);
assert.equal(gewogen.summeCent, 5040 + 400);
assert.deepEqual(r.bank, { inhaber: 'Test Inhaber', iban: 'AT00 0000 0000 0000 0000', bic: 'TESTATXX', bank: '' });
roh.exec(`UPDATE bestellungen SET bezahlt_art = 'ueberweisung', bezahlt_am = datetime('now')`);
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 }));
assert.equal(r.bank, null, 'bezahlt → keine Bankverbindung');
roh.exec(`UPDATE bestellungen SET bezahlt_art = NULL, bezahlt_am = NULL`);
for (const k of ['BANK_INHABER', 'BANK_IBAN', 'BANK_BIC']) delete env[k];
console.log('✓ Meine Bestellungen: Bankverbindung nur bei gewogener, offener Überweisung');
const r2 = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel2 }));
assert.equal(r2.bestellungen.length, 2, 'jeder Link zeigt alle Bestellungen des Kunden');
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluesselOtto }));
assert.equal(r.bestellungen.length, 0);
assert.equal(r.voranmeldungen[0].produkt, 'Masthuhn ganz');
for (const falsch of ['', 'abc', schluessel1.slice(0, -1) + (schluessel1.endsWith('A') ? 'B' : 'A')]) {
  assert.equal((await api('GET', 'meine', null, { 'X-Link-Schluessel': falsch })).status, 404);
}
roh.exec(`UPDATE kunden_links SET gesperrt_am = datetime('now')`);
assert.equal((await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 })).status, 404, 'gesperrter Link');
console.log('✓ Meine Bestellungen: eigener Kunde, Voranmeldungen, falsche und gesperrte Links abgelehnt');

// Vertrag widerrufen (§ 13a FAGG)
roh.exec(`UPDATE kunden_links SET gesperrt_am = NULL`);
const mariaNr = roh.prepare(`SELECT nummer FROM bestellungen WHERE status = 'vorgemerkt' ORDER BY id LIMIT 1`).get().nummer;
mails.length = 0;
// a) über „Meine Bestellungen": Kunde aus dem Link, ganze Bestellung
r = ok(await api('POST', 'widerruf', { bestellnummer: mariaNr, umfang: 'ganz' }, { 'X-Link-Schluessel': schluessel1 }));
assert.equal(r.umfang, 'Ganze Bestellung');
assert.match(r.eingegangen, /^\d{2}\.\d{2}\.\d{4},? \d{2}:\d{2}$/);
assert.equal(mails.length, 2);
assert.equal(mails[0].to, 'maria@example.at');
assert.match(mails[0].subject, /Eingangsbestätigung/);
assert.match(mails[0].html, new RegExp(mariaNr));
assert.match(mails[0].html, /Eingegangen am/);
let w = roh.prepare('SELECT * FROM widerrufe ORDER BY id DESC').get();
assert.deepEqual([w.quelle, w.status, w.name, w.bestellung_id != null], ['link', 'offen', 'Maria Web', true]);
assert.equal(roh.prepare('SELECT status FROM bestellungen WHERE nummer = ?').get(mariaNr).status, 'vorgemerkt', 'storniert nicht selbst');
r = ok(await api('GET', 'meine', null, { 'X-Link-Schluessel': schluessel1 }));
assert.equal(r.bestellungen.find((b) => b.nummer === mariaNr).widerrufe[0].umfang, 'Ganze Bestellung');
// fremde Bestellnummer über den Link → abgelehnt
assert.equal((await api('POST', 'widerruf', { bestellnummer: '1999-999', umfang: 'ganz' }, { 'X-Link-Schluessel': schluessel1 })).status, 400);
// b) über das Formular: passende E-Mail (andere Schreibweise), nur Teile
mails.length = 0;
r = ok(await api('POST', 'widerruf', { name: 'Maria Web', email: 'MARIA@example.at', bestellnummer: mariaNr, umfang: 'teil', produkte: '1× Nudeln' }));
assert.equal(r.umfang, '1× Nudeln');
w = roh.prepare('SELECT * FROM widerrufe ORDER BY id DESC').get();
assert.deepEqual([w.quelle, w.bestellung_id != null, w.email], ['formular', true, 'maria@example.at']);
// c) Formular mit falscher Nummer: trotzdem gespeichert und bestätigt, Hof wird gewarnt
mails.length = 0;
ok(await api('POST', 'widerruf', { name: 'Jemand', email: 'jemand@example.at', bestellnummer: '2026-999', umfang: 'ganz' }));
assert.equal(roh.prepare('SELECT bestellung_id FROM widerrufe ORDER BY id DESC').get().bestellung_id, null);
assert.match(mails[1].html, /passen zu keiner Bestellung/);
// Pflichtfelder und Spam-Falle
for (const [eingabe, muster] of [
  [{ email: 'a@b.at', bestellnummer: '1', umfang: 'ganz' }, /Namen/],
  [{ name: 'Max', email: 'x', bestellnummer: '1', umfang: 'ganz' }, /E-Mail/],
  [{ name: 'Max', email: 'a@b.at', umfang: 'ganz' }, /Bestellnummer/],
  [{ name: 'Max', email: 'a@b.at', bestellnummer: '1', umfang: 'teil', produkte: '' }, /welche Produkte/],
]) {
  const x = await api('POST', 'widerruf', eingabe);
  assert.equal(x.status, 400);
  assert.match(x.error, muster);
}
const vorher = roh.prepare('SELECT COUNT(*) n FROM widerrufe').get().n;
ok(await api('POST', 'widerruf', { name: 'Bot', email: 'b@b.at', bestellnummer: '1', umfang: 'ganz', 'bot-field': 'x' }));
assert.equal(roh.prepare('SELECT COUNT(*) n FROM widerrufe').get().n, vorher);
console.log('✓ Widerruf: über Link und Formular, Eingangsbestätigung mit Zeitpunkt, falsche Nummer trotzdem gespeichert, Pflichtfelder');

// Ohne Mail-Schlüssel wird trotzdem gespeichert
delete env.RESEND_API_KEY;
mails.length = 0;
r = ok(await api('POST', 'bestellung', { ...basis, email: 'ohne@example.at', positionen: [{ artikelId: aNudeln, menge: 1 }] }));
assert.equal(mails.length, 0);
assert.equal(roh.prepare('SELECT COUNT(*) n FROM bestellungen').get().n, 3);
// Produktfoto ausliefern: JPEG aus der Datenbank, lange cachebar, unbekannt = 404
const fotoBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 3)]);
const fotoId = roh.prepare('INSERT INTO produkt_fotos (daten, groesse) VALUES (?, ?) RETURNING id')
  .get(fotoBytes.toString('base64'), fotoBytes.length).id;
const holen = (pfad) => onRequest({ request: new Request(`https://x/api/hofladen/${pfad}`), env: { DB: db }, params: { pfad: pfad.split('/') } });
let foto = await holen(`foto/${fotoId}`);
assert.equal(foto.status, 200);
assert.equal(foto.headers.get('Content-Type'), 'image/jpeg');
assert.match(foto.headers.get('Cache-Control'), /immutable/);
assert.deepEqual(Buffer.from(await foto.arrayBuffer()), fotoBytes);
assert.equal((await holen('foto/999999')).status, 404);
assert.equal((await holen('foto/abc')).status, 404);
console.log('✓ Produktfoto ausliefern: JPEG, Cache, unbekannt 404');
assert.equal((await onRequest({ request: new Request('https://x/api/hofladen/angebot'), env: {}, params: { pfad: ['angebot'] } })).status, 503);
console.log('✓ Ohne Mail-Schlüssel gespeichert, ohne Datenbank 503');

console.log('\nAlle Tests bestanden.');
