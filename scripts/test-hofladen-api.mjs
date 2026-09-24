/* ============================================================
 * TEST – Schnittstelle der Hofladen-Verwaltung
 * ============================================================
 * Spielt einen typischen Ablauf gegen functions/api/verwaltung/[[pfad]].js
 * durch – so, wie ihn die Oberfläche auslöst: Charge anlegen, Bestellungen
 * erfassen (neuer und bekannter Kunde), Warteliste, wiegen, übergeben,
 * bezahlen, Termin setzen, Voranmeldungen übernehmen, Charge bearbeiten.
 * Die Zugangsprüfung ist in test-hofladen-zugang.mjs getestet.
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-api.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest } from '../functions/api/verwaltung/[[pfad]].js';

const { roh, db } = d1Nachbau();
roh.exec(readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8'));
roh.exec(readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8'));
const env = { DB: db };

async function api(methode, pfad, eingabe, { typ = 'application/json' } = {}) {
  const request = new Request(`https://www.kruckenhaus.at/api/verwaltung/${pfad}`, {
    method: methode,
    headers: eingabe ? { 'Content-Type': typ } : {},
    body: eingabe ? JSON.stringify(eingabe) : undefined,
  });
  const antwort = await onRequest({ request, env, params: { pfad: pfad.split('/') }, data: { nutzer: 'test@example.at' } });
  return { status: antwort.status, ...(await antwort.json()) };
}
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };
const produkt = (name) => roh.prepare('SELECT id FROM produkte WHERE name = ?').get(name).id;

// Leerer Stand
let s = ok(await api('GET', 'stand'));
assert.equal(s.chargen.length, 0);
assert.equal(s.produkte.length, 14);
assert.deepEqual(s.tourReihenfolge, ['Breitenbach am Inn', 'Kramsach', 'Brixlegg', 'Kundl']);
assert.equal(s.preisVorschlaege.find((v) => v.produktId === String(produkt('Masthuhn ganz'))).preisCent, 1200);
console.log('✓ Stand: 14 Produkte, Liefergebiet, Startpreise als Vorschlag');

// Charge anlegen
const huhn = produkt('Masthuhn ganz');
const nudeln = produkt('Eiernudeln Spaghetti 500 g');
let r = ok(await api('POST', 'charge', {
  titel: 'Masthühner Herbst', bestellschluss: '2026-10-01', status: 'offen',
  termine: [
    { art: 'lieferung', datum: '2026-10-09', von: '14:00', bis: '18:00' },
    { art: 'abholung', datum: '2026-10-10', von: '09:00', bis: '12:00' },
  ],
  artikel: [
    { produktId: huhn, preisCent: 1200, kontingent: 5, maxProBestellung: 3 },
    { produktId: nudeln, preisCent: 400, kontingent: 10 },
  ],
}));
const chargeId = r.chargeId;
s = ok(await api('GET', 'stand'));
const ch = s.chargen[0];
assert.equal(ch.titel, 'Masthühner Herbst');
assert.equal(ch.termine.length, 2);
const [tLief, tAbh] = [ch.termine.find((t) => t.art === 'lieferung').id, ch.termine.find((t) => t.art === 'abholung').id];
const [aHuhn, aNudeln] = [ch.artikel.find((a) => a.name === 'Masthuhn ganz').id, ch.artikel.find((a) => a.name.includes('Spaghetti')).id];
console.log('✓ Charge mit Terminen und Artikeln angelegt');

// Bestellung: neuer Kunde, Lieferung ohne Adresse → Fehler
r = await api('POST', 'bestellung', { chargeId, kunde: { name: 'Maria Test' }, terminId: tLief, positionen: [{ artikelId: aHuhn, menge: 2 }] });
assert.deepEqual([r.status, r.error], [400, 'Für die Lieferung bitte Adresse eintragen.']);
r = ok(await api('POST', 'bestellung', {
  chargeId, kunde: { name: 'Maria Test', telefon: '+43 660 1', strasse: 'Dorf 1', plz: '6252', ort: 'Breitenbach am Inn' },
  terminId: tLief, quelle: 'whatsapp', zahlart: 'ueberweisung', positionen: [{ artikelId: aHuhn, menge: 2 }, { artikelId: aNudeln, menge: 3 }],
}));
assert.equal(r.bestellung.status, 'vorgemerkt');
assert.match(r.bestellung.nummer, /^\d{4}-001$/);
const b1 = String(r.bestellung.id);
s = ok(await api('GET', 'stand'));
const maria = s.kunden.find((k) => k.name === 'Maria Test');
assert.equal(s.bestellungen[0].lieferadresse, 'Dorf 1, 6252 Breitenbach am Inn');

// Bekannter Kunde, Höchstmenge darf die Verwaltung überschreiten; danach Warteliste
r = ok(await api('POST', 'bestellung', { chargeId, kundeId: maria.id, kunde: { telefon: '+43 660 2' }, terminId: tAbh, positionen: [{ artikelId: aHuhn, menge: 3 }] }));
assert.equal(r.bestellung.status, 'vorgemerkt');
r = ok(await api('POST', 'bestellung', { chargeId, kunde: { name: 'Hans Test' }, terminId: tAbh, positionen: [{ artikelId: aHuhn, menge: 1 }] }));
assert.equal(r.bestellung.status, 'warteliste');
const b3 = String(r.bestellung.id);
s = ok(await api('GET', 'stand'));
assert.equal(s.kunden.filter((k) => k.name === 'Maria Test').length, 1, 'kein doppelter Kunde');
assert.equal(s.kunden.find((k) => k.name === 'Maria Test').telefon, '+43 660 2', 'Telefon aktualisiert');
console.log('✓ Bestellungen erfassen: Adresspflicht bei Lieferung, bekannter Kunde, Höchstmenge, Warteliste');

// Wiegen, übergeben, bezahlen
const posHuhn = s.bestellungen.find((b) => b.id === b1).positionen.find((p) => p.artikelId === aHuhn);
const posNudeln = s.bestellungen.find((b) => b.id === b1).positionen.find((p) => p.artikelId === aNudeln);
assert.equal(posHuhn.einzelpreisCent, 1200);
ok(await api('POST', `bestellung/${b1}`, { aktion: 'gewicht', positionId: posHuhn.id, gewichtG: 4150 }));
r = await api('POST', `bestellung/${b1}`, { aktion: 'gewicht', positionId: posNudeln.id, gewichtG: 500 });
assert.equal(r.status, 400, 'Nudeln haben kein Gewicht');
ok(await api('POST', `bestellung/${b1}`, { aktion: 'uebergeben', wert: true }));
ok(await api('POST', `bestellung/${b1}`, { aktion: 'bezahlt', art: 'ueberweisung' }));
const gespeichert = roh.prepare('SELECT uebergeben_am, bezahlt_art, bezahlt_betrag_cent FROM bestellungen WHERE id = ?').get(Number(b1));
assert.ok(gespeichert.uebergeben_am);
assert.equal(gespeichert.bezahlt_betrag_cent, 4980 + 1200, '4,15 kg × 12 € + 3 × 4 €');
ok(await api('POST', `bestellung/${b1}`, { aktion: 'bezahlt', art: null }));
assert.equal(roh.prepare('SELECT bezahlt_art FROM bestellungen WHERE id = ?').get(Number(b1)).bezahlt_art, null);
console.log('✓ Wiegen (nur Gewichtsware), übergeben, bezahlt mit Betrag, rückgängig');

// Stornieren → Warteliste rückt nach
ok(await api('POST', `bestellung/${b1}`, { aktion: 'stornieren' }));
r = ok(await api('POST', `bestellung/${b3}`, { aktion: 'nachruecken' }));
assert.equal(r.bestellung.status, 'vorgemerkt');
console.log('✓ Stornieren und Nachrücken');

// Voranmeldung → übernehmen → Termin offen → Termin setzen
r = ok(await api('POST', 'voranmeldung', { kunde: { name: 'Vera Voran' }, produktId: nudeln, menge: 2, zeitraum: 'naechste', quelle: 'telefon' }));
r = ok(await api('POST', 'voranmeldungen/uebernehmen', { chargeId, ids: [r.voranmeldungId] }));
assert.equal(r.bestellungen.length, 1);
const bVoran = r.bestellungen[0].id;
s = ok(await api('GET', 'stand'));
assert.equal(s.bestellungen.find((b) => b.id === bVoran).terminId, null);
assert.equal(s.voranmeldungen.length, 0);
r = await api('POST', `bestellung/${bVoran}`, { aktion: 'termin', terminId: 99999 });
assert.equal(r.status, 400);
ok(await api('POST', `bestellung/${bVoran}`, { aktion: 'termin', terminId: tAbh }));
ok(await api('POST', `bestellung/${bVoran}`, { aktion: 'zahlart', zahlart: 'ueberweisung' }));
ok(await api('POST', `bestellung/${bVoran}`, { aktion: 'kontakt', telefon: '+43 660 9', strasse: 'Weg 2', plz: '6233', ort: 'Kramsach' }));
s = ok(await api('GET', 'stand'));
assert.equal(s.bestellungen.find((b) => b.id === bVoran).lieferadresse, 'Weg 2, 6233 Kramsach');
assert.equal(s.kunden.find((k) => k.name === 'Vera Voran').telefon, '+43 660 9');
r = ok(await api('POST', 'voranmeldung', { kunde: { name: 'Otto Später' }, produktId: huhn, menge: 1, zeitraum: 'fruehjahr', jahr: new Date().getFullYear() + 1 }));
ok(await api('POST', `voranmeldung/${r.voranmeldungId}/absagen`, {}));
r = await api('POST', `voranmeldung/${r.voranmeldungId}/absagen`, {});
assert.equal(r.status, 400, 'zweimal absagen geht nicht');
console.log('✓ Voranmeldung erfassen, übernehmen, Termin, Zahlart und Kontakt bestätigen, absagen');

// Charge bearbeiten: Preis ändern (alte Bestellungen behalten Preis), Termin ergänzen,
// benutzten Artikel nicht entfernen
s = ok(await api('GET', 'stand'));
const c = s.chargen[0];
const neu = {
  titel: c.titel, bestellschluss: c.bestellschluss, status: 'geschlossen',
  termine: [...c.termine, { art: 'abholung', datum: '2026-10-11', von: '09:00', bis: '11:00' }],
  artikel: c.artikel.map((a) => ({ id: a.id, produktId: a.produktId, preisCent: a.art === 'gewicht' ? 1300 : a.preisCent, kontingent: a.kontingent, maxProBestellung: a.maxProBestellung })),
};
ok(await api('POST', `charge/${chargeId}`, neu));
s = ok(await api('GET', 'stand'));
assert.equal(s.chargen[0].status, 'geschlossen');
assert.equal(s.chargen[0].termine.length, 3);
assert.equal(s.chargen[0].artikel.find((a) => a.id === aHuhn).preisCent, 1300);
assert.ok(s.bestellungen.flatMap((b) => b.positionen).filter((p) => p.artikelId === aHuhn).every((p) => p.einzelpreisCent === 1200));
r = await api('POST', `charge/${chargeId}`, { ...neu, artikel: neu.artikel.filter((a) => a.id !== aHuhn) });
assert.equal(r.status, 400);
assert.match(r.error, /schon bestellt/);
r = await api('POST', `charge/${chargeId}`, { ...neu, artikel: [...neu.artikel, { produktId: huhn, preisCent: 1, kontingent: 1 }] });
assert.match(r.error, /doppelt/);
console.log('✓ Charge bearbeiten: Preisänderung nur für neue Bestellungen, Termin ergänzt, Schutz vor Löschen/Doppelten');

// Schutz und Fehler
r = await api('POST', 'bestellung', { chargeId }, { typ: 'text/plain' });
assert.equal(r.status, 415, 'nur JSON');
assert.equal((await api('GET', 'unbekannt')).status, 404);
assert.equal((await api('POST', `bestellung/${b1}`, { aktion: 'hacken' })).status, 400);
assert.equal((await api('POST', 'charge', { titel: '', bestellschluss: '2026-01-01' })).status, 400);
const ohneDb = await onRequest({ request: new Request('https://x/api/verwaltung/stand'), env: {}, params: { pfad: ['stand'] }, data: {} });
assert.equal(ohneDb.status, 503);
console.log('✓ Nur JSON, unbekannte Wege/Aktionen, leere Eingaben, fehlende Datenbank');

console.log('\nAlle Tests bestanden.');
