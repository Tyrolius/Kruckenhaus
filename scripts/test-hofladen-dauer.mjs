/* ============================================================
 * TEST – Dauerartikel und ständige Runde „Dauersortiment"
 * ============================================================
 * Phase W1 aus docs/SCHNITTSTELLE-BERTHA.md: Produkte als Dauerartikel
 * pflegen (fester Preis, verfügbar/ausverkauft, im Portal), die ständige
 * Runde ohne Mengenprüfung, Schnell-Schalter „ausverkauft", Schutz der
 * ständigen Runde vor Bearbeiten/Abschließen. Bestehende Bestellrunden
 * dürfen sich dabei nicht verändern.
 * Phase W2: Dauersortiment im Angebot von hofladen.html, Bestellung ohne
 * Termin (Abholung nach Absprache), keine Voranmeldung für Dauerartikel.
 *
 * Berührt die echte D1-Datenbank NICHT.
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-dauer.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest as verwaltung } from '../functions/api/verwaltung/[[pfad]].js';
import { onRequest as oeffentlich } from '../functions/api/hofladen/[[pfad]].js';
import { bestellungAnlegen, dauersortimentAbgleichen, preisVorschlaege, EingabeFehler } from '../functions/_lib/hofladen.js';

const { roh, db } = d1Nachbau();
const schema = readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8');
roh.exec(schema);
roh.exec(readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8'));
roh.exec(schema); // mehrfach ausführbar, auch mit Daten
const env = { DB: db };

async function api(methode, pfad, eingabe) {
  const request = new Request(`https://www.kruckenhaus.at/api/verwaltung/${pfad}`, {
    method: methode,
    headers: eingabe ? { 'Content-Type': 'application/json' } : {},
    body: eingabe ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await verwaltung({ request, env, params: { pfad: pfad.split('/') }, data: { nutzer: 'test@example.at' } });
  return { status: antwort.status, ...(await antwort.json()) };
}
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };
const fehler = (r, text) => { assert.equal(r.status, 400); assert.match(r.error, text); };
const produkt = (name) => roh.prepare('SELECT * FROM produkte WHERE name = ?').get(name);
const dauerRunde = () => roh.prepare(`SELECT * FROM chargen WHERE art = 'dauer'`).all();

// Ohne Dauerartikel gibt es keine ständige Runde
assert.equal(await dauersortimentAbgleichen(db), null);
assert.equal(dauerRunde().length, 0);
let s = ok(await api('GET', 'stand'));
assert.equal(s.chargen.length, 0);
assert.ok(s.produkte.every((p) => p.verkaufsart === 'runde' && p.verfuegbar && p.imPortal));
console.log('✓ Bestehende Produkte bleiben „Bestellrunde", keine ständige Runde ohne Dauerartikel');

// Eine normale Bestellrunde mit Nudeln als Zusatzartikel – darf sich nicht verändern
const huhn = produkt('Masthuhn ganz').id;
const spirelli = produkt('Eiernudeln Spirelli 500 g');
let r = ok(await api('POST', 'charge', {
  titel: 'Masthühner Herbst', bestellschluss: '2099-10-01', status: 'offen', imPortal: false,
  termine: [{ art: 'abholung', datum: '2099-10-10', von: '09:00', bis: '12:00' }],
  artikel: [
    { produktId: huhn, preisCent: 1200, kontingent: 2 },
    { produktId: spirelli.id, preisCent: 380, kontingent: 1 },
  ],
}));
const rundeId = Number(r.chargeId);
assert.equal(roh.prepare('SELECT im_portal, art FROM chargen WHERE id = ?').get(rundeId).im_portal, 0);
const rundeVorher = JSON.stringify(roh.prepare('SELECT * FROM charge_artikel WHERE charge_id = ? ORDER BY id').all(rundeId));
console.log('✓ Bestellrunde mit „nicht im Portal" angelegt');

// Dauerartikel: Prüfungen
const basis = { name: spirelli.name, art: 'stueck', bereichId: spirelli.bereich_id, startpreisCent: 400 };
fehler(await api('POST', `produkt/${spirelli.id}`, { ...basis, verkaufsart: 'dauer' }), /Preis des Dauerartikels/);
fehler(await api('POST', `produkt/${huhn}`, {
  name: 'Masthuhn ganz', art: 'gewicht', bereichId: produkt('Masthuhn ganz').bereich_id, richtVonG: 1800, richtBisG: 2400,
  verkaufsart: 'dauer', dauerpreisCent: 1200,
}), /nach Gewicht kann kein Dauerartikel/);
fehler(await api('POST', `produkt/${spirelli.id}`, { ...basis, verkaufsart: 'sonstwas', dauerpreisCent: 1 }), /Verkaufsart/);
console.log('✓ Dauerartikel nur mit Preis und nicht nach Gewicht');

// Spirelli wird Dauerartikel → ständige Runde entsteht
roh.prepare(`UPDATE produkte SET geaendert_am = '2000-01-01 00:00:00' WHERE id = ?`).run(spirelli.id);
ok(await api('POST', `produkt/${spirelli.id}`, { ...basis, verkaufsart: 'dauer', dauerpreisCent: 400 }));
assert.notEqual(produkt(spirelli.name).geaendert_am, '2000-01-01 00:00:00', 'geaendert_am gesetzt');
assert.equal(dauerRunde().length, 1);
const dauer = dauerRunde()[0];
assert.deepEqual([dauer.titel, dauer.status, dauer.bestellschluss], ['Dauersortiment', 'offen', '9999-12-31']);
let dauerArtikel = roh.prepare('SELECT * FROM charge_artikel WHERE charge_id = ?').all(dauer.id);
assert.deepEqual(dauerArtikel.map((a) => [a.produkt_id, a.preis_cent]), [[spirelli.id, 400]]);
console.log('✓ Ständige Runde „Dauersortiment" mit Spirelli zu 4,00 € angelegt, geaendert_am gesetzt');

// Neues Produkt direkt als Dauerartikel, gleiche Runde
const seife = produkt('Alpakaseife');
r = ok(await api('POST', 'produkt', {
  name: 'Alpakaseife Lavendel', art: 'stueck', bereichId: seife.bereich_id, verkaufsart: 'dauer', dauerpreisCent: 550, imPortal: false,
}));
const lavendel = Number(r.produktId);
assert.equal(dauerRunde().length, 1);
await dauersortimentAbgleichen(db); // mehrfach aufrufbar
assert.equal(dauerRunde().length, 1);
dauerArtikel = roh.prepare('SELECT * FROM charge_artikel WHERE charge_id = ? ORDER BY id').all(dauer.id);
assert.equal(dauerArtikel.length, 2);
assert.equal(produkt('Alpakaseife Lavendel').im_portal, 0);
console.log('✓ Zweiter Dauerartikel in derselben Runde, nie eine zweite Runde');

// Stand für die Oberfläche
s = ok(await api('GET', 'stand'));
const dauerStand = s.chargen.find((c) => c.art === 'dauer');
assert.ok(dauerStand);
assert.equal(s.chargen.find((c) => c.art === 'runde').imPortal, false);
const spStand = s.produkte.find((p) => p.id === String(spirelli.id));
assert.deepEqual([spStand.verkaufsart, spStand.dauerpreisCent, spStand.verfuegbar, spStand.imPortal], ['dauer', 400, true, true]);
assert.equal(s.preisVorschlaege.find((v) => v.produktId === String(lavendel)).preisCent, 550);
assert.equal(s.preisVorschlaege.find((v) => v.produktId === String(spirelli.id)).preisCent, 380,
  'Vorschlag für Bestellrunden kommt aus der letzten echten Bestellrunde, nicht aus dem Dauersortiment');
console.log('✓ Stand: Runde mit art/imPortal, Produkte mit Dauer-Feldern, Preisvorschläge');

// Bestellen im Dauersortiment: keine Mengenprüfung
const spArtikel = dauerArtikel.find((a) => a.produkt_id === spirelli.id).id;
r = ok(await api('POST', 'bestellung', {
  chargeId: dauer.id, kunde: { name: 'Eva Test' }, quelle: 'telefon', positionen: [{ artikelId: spArtikel, menge: 50 }],
}));
assert.equal(r.bestellung.status, 'vorgemerkt');
const b1 = r.bestellung.id;
const kunde = roh.prepare('SELECT kunde_id FROM bestellungen WHERE id = ?').get(b1).kunde_id;
const ohneMenge = await bestellungAnlegen(db, { chargeId: dauer.id, kundeId: kunde, positionen: [{ chargeArtikelId: spArtikel, menge: 20 }] });
assert.equal(ohneMenge.status, 'vorgemerkt', 'nie Warteliste im Dauersortiment');
ok(await api('POST', `bestellung/${b1}`, { aktion: 'position', artikelId: spArtikel, menge: 60 }));
const lavArtikel = dauerArtikel.find((a) => a.produkt_id === lavendel).id;
ok(await api('POST', `bestellung/${b1}`, { aktion: 'position', artikelId: lavArtikel, menge: 3 }));
r = ok(await api('POST', 'hofverkauf', { chargeId: dauer.id, zahlung: 'bar', positionen: [{ artikelId: spArtikel, menge: 7 }] }));
assert.ok(r.bestellung.nummer);
console.log('✓ Bestellung, Menge ändern und Verkauf am Hof ohne Mengengrenze');

// Preisänderung gilt nur für neue Bestellungen
ok(await api('POST', `produkt/${spirelli.id}`, { ...basis, verkaufsart: 'dauer', dauerpreisCent: 450 }));
assert.equal(roh.prepare('SELECT preis_cent FROM charge_artikel WHERE id = ?').get(spArtikel).preis_cent, 450);
assert.equal(roh.prepare('SELECT einzelpreis_cent FROM bestell_positionen WHERE bestellung_id = ? AND charge_artikel_id = ?')
  .get(b1, spArtikel).einzelpreis_cent, 400);
console.log('✓ Neuer Preis im Dauersortiment, alte Bestellungen behalten ihren Preis');

// Schnell-Schalter „ausverkauft"
ok(await api('POST', `produkt/${spirelli.id}/verfuegbar`, { verfuegbar: false }));
assert.equal(produkt(spirelli.name).verfuegbar, 0);
fehler(await api('POST', `produkt/${huhn}/verfuegbar`, { verfuegbar: false }), /Nur bei Dauerartikeln/);
fehler(await api('POST', `produkt/${spirelli.id}/verfuegbar`, { verfuegbar: 'nein' }), /verfügbar/);
await assert.rejects(
  bestellungAnlegen(db, { chargeId: dauer.id, kundeId: kunde, positionen: [{ chargeArtikelId: spArtikel, menge: 1 }] }),
  (e) => e instanceof EingabeFehler && /ausverkauft/.test(e.message),
);
// Die Verwaltung darf bewusst trotzdem eintragen (z. B. letzter Karton im Keller)
r = ok(await api('POST', 'bestellung', { chargeId: dauer.id, kundeId: String(kunde), positionen: [{ artikelId: spArtikel, menge: 1 }] }));
assert.equal(r.bestellung.status, 'vorgemerkt');
// Ausgeblendet oder wieder „Bestellrunde" → im Dauersortiment nicht mehr bestellbar
ok(await api('POST', `produkt/${lavendel}`, {
  name: 'Alpakaseife Lavendel', art: 'stueck', bereichId: seife.bereich_id, verkaufsart: 'runde', startpreisCent: 550,
}));
await assert.rejects(
  bestellungAnlegen(db, { chargeId: dauer.id, kundeId: kunde, positionen: [{ chargeArtikelId: lavArtikel, menge: 1 }] }),
  /ausverkauft/,
);
fehler(await api('POST', `produkt/${lavendel}/verfuegbar`, { verfuegbar: true }), /Nur bei Dauerartikeln/);
ok(await api('POST', `produkt/${spirelli.id}/verfuegbar`, { verfuegbar: true }));
ok(await bestellungAnlegen(db, { chargeId: dauer.id, kundeId: kunde, positionen: [{ chargeArtikelId: spArtikel, menge: 1 }] })
  .then((b) => ({ ok: b.status === 'vorgemerkt' })));
console.log('✓ Ausverkauft: Website-Bestellung abgelehnt, Verwaltung darf; Schalter nur für Dauerartikel');

// Ständige Runde lässt sich weder bearbeiten noch abschließen
fehler(await api('POST', `charge/${dauer.id}`, { titel: 'X', bestellschluss: '2026-01-01', status: 'offen', artikel: [] }), /Dauersortiment/);
fehler(await api('POST', `charge/${dauer.id}/status`, { status: 'archiviert' }), /Dauersortiment/);
assert.equal(dauerRunde()[0].status, 'offen');
fehler(await api('POST', 'charge/999/status', { status: 'archiviert' }), /nicht gefunden/);
try { roh.exec(`INSERT INTO chargen (titel, bestellschluss, art) VALUES ('Zweite', '9999-12-31', 'dauer')`); assert.fail(); }
catch (e) { assert.match(e.message, /UNIQUE/); }
console.log('✓ Dauersortiment geschützt: nicht bearbeitbar, nicht abschließbar, nur einmal vorhanden');

// Normale Runde: Kontingent und Warteliste wie bisher, Artikel unverändert
assert.equal(roh.prepare('SELECT COUNT(*) AS n FROM charge_artikel WHERE charge_id = ?').get(rundeId).n, 2);
assert.equal(JSON.stringify(roh.prepare('SELECT * FROM charge_artikel WHERE charge_id = ? ORDER BY id').all(rundeId)), rundeVorher);
const rundeArtikel = roh.prepare('SELECT id FROM charge_artikel WHERE charge_id = ? AND produkt_id = ?').get(rundeId, spirelli.id).id;
assert.equal((await bestellungAnlegen(db, { chargeId: rundeId, kundeId: kunde, positionen: [{ chargeArtikelId: rundeArtikel, menge: 1 }] })).status, 'vorgemerkt');
assert.equal((await bestellungAnlegen(db, { chargeId: rundeId, kundeId: kunde, positionen: [{ chargeArtikelId: rundeArtikel, menge: 1 }] })).status, 'warteliste');
ok(await api('POST', `charge/${rundeId}`, {
  titel: 'Masthühner Herbst', bestellschluss: '2099-10-01', status: 'offen', imPortal: true,
  termine: [], artikel: roh.prepare('SELECT id, produkt_id, preis_cent, kontingent FROM charge_artikel WHERE charge_id = ?').all(rundeId)
    .map((a) => ({ id: a.id, produktId: a.produkt_id, preisCent: a.preis_cent, kontingent: a.kontingent })),
}));
assert.equal(roh.prepare('SELECT im_portal FROM chargen WHERE id = ?').get(rundeId).im_portal, 1);
assert.equal((await preisVorschlaege(db)).find((v) => v.produktId === spirelli.id).preisCent, 380);
console.log('✓ Normale Bestellrunde: Kontingent und Warteliste unverändert, „im Portal" umschaltbar');

// ------------------------------------------------------------
// Phase W2: Dauersortiment auf hofladen.html bestellen
// ------------------------------------------------------------
const mails = [];
globalThis.fetch = async (url, optionen) => {
  assert.equal(url, 'https://api.resend.com/emails');
  mails.push(JSON.parse(optionen.body));
  return new Response('{}', { status: 200 });
};
const envWeb = { DB: db, RESEND_API_KEY: 'test', CONTACT_TO: 'hof@example.at' };
async function web(methode, pfad, eingabe, kopf = {}) {
  const request = new Request(`https://www.kruckenhaus.at/api/hofladen/${pfad}`, {
    method: methode,
    headers: { ...(eingabe ? { 'Content-Type': 'application/json' } : {}), ...kopf },
    body: eingabe ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await oeffentlich({ request, env: envWeb, params: { pfad: pfad.split('/') } });
  return { status: antwort.status, ...(await antwort.json()) };
}

// Seife wieder als Dauerartikel, aber ausverkauft; Lavendel ist inzwischen „Bestellrunde"
ok(await api('POST', `produkt/${seife.id}`, {
  name: seife.name, art: 'stueck', bereichId: seife.bereich_id, verkaufsart: 'dauer', dauerpreisCent: 450, verfuegbar: false,
}));
let angebot = ok(await web('GET', 'angebot'));
assert.deepEqual(angebot.chargen.map((c) => c.titel), ['Masthühner Herbst'], 'Dauersortiment nicht unter den Bestellrunden');
assert.equal(angebot.dauer.id, dauer.id);
assert.deepEqual(angebot.dauer.artikel.map((a) => [a.name, a.preisCent, a.verfuegbar]).sort(),
  [['Alpakaseife', 450, false], ['Eiernudeln Spirelli 500 g', 450, true]]);
assert.ok(angebot.dauer.artikel.every((a) => !('frei' in a)), 'keine Mengen nach außen');
assert.equal(angebot.produkte.find((p) => p.id === spirelli.id).dauer, true);
assert.equal(angebot.produkte.find((p) => p.id === huhn).dauer, false);
console.log('✓ Angebot: Dauersortiment eigens, nur Dauerartikel, ausverkauft sichtbar, ohne Mengen');

// Ausgeblendeter Dauerartikel verschwindet aus dem Angebot
ok(await api('POST', `produkt/${seife.id}`, {
  name: seife.name, art: 'stueck', bereichId: seife.bereich_id, verkaufsart: 'dauer', dauerpreisCent: 450, verfuegbar: false, aktiv: false,
}));
angebot = ok(await web('GET', 'angebot'));
assert.deepEqual(angebot.dauer.artikel.map((a) => a.name), ['Eiernudeln Spirelli 500 g']);
console.log('✓ Ausgeblendete Dauerartikel erscheinen nicht');

const kontakt = { name: 'Lisa Test', email: 'lisa@example.at', telefon: '+43 660 123456', zustimmung: true };
const seifeArtikel = roh.prepare('SELECT id FROM charge_artikel WHERE charge_id = ? AND produkt_id = ?').get(dauer.id, seife.id).id;

// Bestellen ohne Termin
r = ok(await web('POST', 'bestellung', {
  ...kontakt, chargeId: dauer.id, zahlart: 'ueberweisung', anmerkung: 'Samstag wäre fein',
  positionen: [{ artikelId: spArtikel, menge: 4 }],
}));
assert.equal(r.status, 'vorgemerkt');
const webBestellung = roh.prepare('SELECT * FROM bestellungen WHERE nummer = ?').get(r.nummer);
assert.deepEqual([webBestellung.termin_id, webBestellung.quelle, webBestellung.zahlart, webBestellung.lieferadresse],
  [null, 'web', 'ueberweisung', null]);
assert.equal(mails.length, 2);
assert.match(mails[0].html, /nach Absprache/);
assert.match(mails[1].html, /nach Absprache/);
assert.match(mails[0].html, /Eiernudeln Spirelli/);
console.log('✓ Bestellung ohne Termin: Abholung nach Absprache, Mails an Kunde und Hof');

// Ein Termin wird beim Dauersortiment ignoriert (kein fremder Termin)
const fremderTermin = roh.prepare('SELECT id FROM termine LIMIT 1').get();
if (fremderTermin) {
  r = ok(await web('POST', 'bestellung', { ...kontakt, chargeId: dauer.id, terminId: fremderTermin.id, positionen: [{ artikelId: spArtikel, menge: 1 }] }));
  assert.equal(roh.prepare('SELECT termin_id FROM bestellungen WHERE nummer = ?').get(r.nummer).termin_id, null);
}

// Ausverkauft, ausgeblendet, fremder Artikel → abgelehnt
ok(await api('POST', `produkt/${spirelli.id}/verfuegbar`, { verfuegbar: false }));
r = await web('POST', 'bestellung', { ...kontakt, chargeId: dauer.id, positionen: [{ artikelId: spArtikel, menge: 1 }] });
assert.deepEqual([r.status, r.ok], [400, false]);
assert.match(r.error, /ausverkauft/);
r = await web('POST', 'bestellung', { ...kontakt, chargeId: dauer.id, positionen: [{ artikelId: seifeArtikel, menge: 1 }] });
assert.match(r.error, /ausverkauft/);
r = await web('POST', 'bestellung', { ...kontakt, chargeId: dauer.id, positionen: [{ artikelId: rundeArtikel, menge: 1 }] });
assert.match(r.error, /gehört nicht/);
ok(await api('POST', `produkt/${spirelli.id}/verfuegbar`, { verfuegbar: true }));
console.log('✓ Ausverkauftes, Ausgeblendetes und fremde Artikel werden abgelehnt');

// Normale Bestellrunde braucht weiter einen Termin
r = await web('POST', 'bestellung', { ...kontakt, chargeId: rundeId, positionen: [{ artikelId: rundeArtikel, menge: 1 }] });
assert.match(r.error, /termin/i);
console.log('✓ Bestellrunden verlangen weiterhin einen Termin');

// Vormerken nur für Bestellrunden-Ware
r = await web('POST', 'voranmeldung', { ...kontakt, produktId: spirelli.id, menge: 2, zeitraum: 'naechste' });
assert.equal(r.status, 400);
ok(await web('POST', 'voranmeldung', { ...kontakt, produktId: huhn, menge: 2, zeitraum: 'naechste' }));
console.log('✓ Dauerartikel lassen sich nicht vormerken');

// „Meine Bestellungen": Abholung nach Absprache
const link = mails.find((m) => m.to === kontakt.email).html.match(/meine-bestellungen\.html#([A-Za-z0-9_-]+)/)[1];
const meine = ok(await web('GET', 'meine', null, { 'X-Link-Schluessel': link }));
const eintrag = meine.bestellungen.find((b) => b.nummer === webBestellung.nummer);
assert.deepEqual([eintrag.termin, eintrag.nachAbsprache, eintrag.summeCent], [null, true, 1800]);
console.log('✓ Meine Bestellungen zeigt „nach Absprache" und den genauen Betrag');

console.log('\nAlle Tests der Dauerartikel bestanden.');
