/* ============================================================
 * TEST – Datenbank und Helfer der Hofladen-Vorbestellung
 * ============================================================
 * Führt schema-hofladen.sql in einer leeren SQLite-Datenbank im
 * Arbeitsspeicher aus (D1 basiert auf SQLite) und prüft die Helfer aus
 * functions/_lib/hofladen.js: Bestellnummern, Kontingent und Warteliste,
 * Beträge, Eingabeprüfung, Transaktionen, Preisvorschläge, Voranmeldungen.
 *
 * Berührt die echte D1-Datenbank NICHT.
 *
 * Aufruf (Node 22 oder neuer, keine Installation nötig):
 *   node scripts/test-hofladen-db.mjs
 * ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { bestellungAnlegen, bestellungNachruecken, preisVorschlaege, positionBetrag, EingabeFehler, euro,
  voranmeldungAnlegen, voranmeldungenUebernehmen }
  from '../functions/_lib/hofladen.js';

// Minimaler D1-Nachbau auf node:sqlite (prepare/bind/first/all/run, batch als Transaktion)
const roh = new DatabaseSync(':memory:');
roh.exec('PRAGMA foreign_keys = ON');
const liefertZeilen = (sql) => /^\s*select/i.test(sql) || /returning/i.test(sql);
const db = {
  prepare(sql) {
    const stmt = { sql, args: [],
      bind(...a) { return { ...stmt, args: a }; },
      async first() { return roh.prepare(sql).get(...this.args) ?? null; },
      async all() { return { results: roh.prepare(sql).all(...this.args) }; },
      async run() { return { meta: roh.prepare(sql).run(...this.args) }; },
    };
    return stmt;
  },
  async batch(stmts) {
    roh.exec('BEGIN');
    try {
      const erg = stmts.map((s) => liefertZeilen(s.sql)
        ? { results: roh.prepare(s.sql).all(...s.args) }
        : { results: [], meta: roh.prepare(s.sql).run(...s.args) });
      roh.exec('COMMIT');
      return erg;
    } catch (e) { roh.exec('ROLLBACK'); throw e; }
  },
};

const schema = readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8');
roh.exec(schema);
roh.exec(schema); // zweimal ausführbar
console.log('✓ Schema zweimal ausgeführt');

// Testdaten (nur für den Test)
roh.exec(`
  INSERT INTO produkte (name, art, richtgewicht_von_g, richtgewicht_bis_g) VALUES ('Masthuhn', 'gewicht', 1800, 2200);
  INSERT INTO produkte (name, art) VALUES ('Eiernudeln', 'stueck');
  INSERT INTO chargen (titel, status, bestellschluss) VALUES ('Test', 'offen', '2026-10-01');
  INSERT INTO chargen (titel, status, bestellschluss) VALUES ('Andere', 'offen', '2026-11-01');
  INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent, max_pro_bestellung) VALUES (1, 1, 1390, 5, 4);
  INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent) VALUES (1, 2, 450, 10);
  INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent) VALUES (2, 2, 450, 10);
  INSERT INTO termine (charge_id, art, datum, von, bis) VALUES (1, 'abholung', '2026-10-10', '09:00', '12:00');
  INSERT INTO termine (charge_id, art, datum) VALUES (2, 'abholung', '2026-11-07');
  INSERT INTO kunden (name) VALUES ('A'), ('B'), ('C');
`);
try { roh.exec(`INSERT INTO produkte (name, art) VALUES ('Gans ohne Gewicht', 'gewicht')`); assert.fail(); }
catch (e) { assert.match(e.message, /CHECK/); console.log('✓ Gewichtsware ohne Richtgewicht abgelehnt'); }

const jahr = new Date().getUTCFullYear();
const b1 = await bestellungAnlegen(db, { chargeId: 1, kundeId: 1, terminId: 1, positionen: [{ chargeArtikelId: 1, menge: 3 }, { chargeArtikelId: 2, menge: 2 }] });
const b2 = await bestellungAnlegen(db, { chargeId: 1, kundeId: 2, terminId: 1, quelle: 'whatsapp', positionen: [{ chargeArtikelId: 1, menge: 2 }] });
const b3 = await bestellungAnlegen(db, { chargeId: 1, kundeId: 3, terminId: 1, positionen: [{ chargeArtikelId: 1, menge: 1 }, { chargeArtikelId: 2, menge: 1 }] });
assert.equal(b1.status, 'vorgemerkt'); assert.equal(b2.status, 'vorgemerkt'); assert.equal(b3.status, 'warteliste');
assert.deepEqual([b1.nummer, b2.nummer, b3.nummer], [`${jahr}-001`, `${jahr}-002`, `${jahr}-003`]);
console.log('✓ Kontingent: 3+2 vorgemerkt, 3. Bestellung auf Warteliste;', b1.nummer, b2.nummer, b3.nummer);

let bestand = roh.prepare('SELECT charge_artikel_id, bestellt, frei FROM v_bestand WHERE charge_id = 1 ORDER BY 1').all();
assert.deepEqual(bestand.map((r) => [r.bestellt, r.frei]), [[5, 0], [2, 8]]);
console.log('✓ v_bestand zählt Warteliste nicht mit');

// Nachrücken ohne freie Menge bleibt Warteliste
assert.equal((await bestellungNachruecken(db, b3.id)).status, 'warteliste');
roh.prepare(`UPDATE bestellungen SET status = 'storniert' WHERE id = ?`).run(b2.id);
assert.equal((await bestellungNachruecken(db, b3.id)).status, 'vorgemerkt');
// Stornierte wiederherstellen: jetzt kein Platz mehr (5 - 3 - 1 = 1 < 2)
assert.equal((await bestellungNachruecken(db, b2.id)).status, 'warteliste');
console.log('✓ Nachrücken und Wiederherstellen respektieren das Kontingent');

// Beträge: SQL-Ansicht und JS-Helfer rechnen gleich
const pos = roh.prepare('SELECT * FROM v_positionen WHERE bestellung_id = ? ORDER BY id').all(b1.id);
assert.equal(pos[0].betrag_cent, 8340); assert.equal(pos[0].geschaetzt, 1);
assert.equal(positionBetrag({ art: 'gewicht', preisCent: 1390, menge: 3, richtVonG: 1800, richtBisG: 2200 }).cent, 8340);
roh.prepare('UPDATE bestell_positionen SET gewicht_g = 6150 WHERE id = ?').run(pos[0].id);
const gew = roh.prepare('SELECT betrag_cent, geschaetzt FROM v_positionen WHERE id = ?').get(pos[0].id);
assert.equal(gew.betrag_cent, positionBetrag({ art: 'gewicht', preisCent: 1390, menge: 3, gewichtG: 6150 }).cent);
const summe = roh.prepare('SELECT * FROM v_bestellsummen WHERE bestellung_id = ?').get(b1.id);
assert.equal(summe.waren_cent, gew.betrag_cent + 900); assert.equal(summe.geschaetzt, 0);
console.log('✓ Beträge SQL = JS:', euro(gew.betrag_cent), '+ Nudeln =', euro(summe.gesamt_cent));

// Einzelpreis bleibt bei Preisänderung
roh.exec('UPDATE charge_artikel SET preis_cent = 9999 WHERE id = 2');
assert.equal(roh.prepare('SELECT einzelpreis_cent FROM bestell_positionen WHERE bestellung_id = ? AND charge_artikel_id = 2').get(b1.id).einzelpreis_cent, 450);
console.log('✓ Einzelpreis zum Bestellzeitpunkt eingefroren');

// Eingabefehler
const fehler = async (f, muster) => { try { await f(); assert.fail('kein Fehler'); } catch (e) { assert.ok(e instanceof EingabeFehler, e.message); assert.match(e.message, muster); } };
await fehler(() => bestellungAnlegen(db, { chargeId: 1, kundeId: 1, positionen: [{ chargeArtikelId: 3, menge: 1 }] }), /gehört nicht/);
await fehler(() => bestellungAnlegen(db, { chargeId: 1, kundeId: 1, positionen: [{ chargeArtikelId: 1, menge: 5 }] }), /Höchstens 4/);
await fehler(() => bestellungAnlegen(db, { chargeId: 1, kundeId: 1, terminId: 2, positionen: [{ chargeArtikelId: 2, menge: 1 }] }), /Termin/);
await fehler(() => bestellungAnlegen(db, { chargeId: 1, kundeId: 1, positionen: [] }), /Keine Artikel/);
console.log('✓ Fremde Artikel, Höchstmenge, fremder Termin, leere Bestellung abgelehnt');

// Unbekannter Kunde: Fremdschlüssel greift, nichts halb gespeichert
const vorher = roh.prepare('SELECT COUNT(*) n FROM bestellungen').get().n;
try { await bestellungAnlegen(db, { chargeId: 1, kundeId: 999, positionen: [{ chargeArtikelId: 2, menge: 1 }] }); assert.fail(); }
catch (e) { assert.match(e.message, /FOREIGN KEY/); }
assert.equal(roh.prepare('SELECT COUNT(*) n FROM bestellungen').get().n, vorher);
assert.equal(roh.prepare('SELECT COUNT(*) n FROM bestell_positionen WHERE bestellung_id NOT IN (SELECT id FROM bestellungen)').get().n, 0);
console.log('✓ Unbekannter Kunde: Transaktion vollständig zurückgerollt');

// Preisvorschläge: Werte der zuletzt angelegten Charge je Produkt
roh.exec(`INSERT INTO produkte (name, art) VALUES ('Honig', 'stueck')`);
roh.exec(`INSERT INTO chargen (titel, bestellschluss, erstellt_am) VALUES ('Neuer', '2026-12-01', datetime('now', '+1 day'))`);
roh.exec(`INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent) VALUES (3, 2, 500, 12)`);
const vorschlag = Object.fromEntries((await preisVorschlaege(db)).map((v) => [v.name, v]));
assert.equal(vorschlag.Masthuhn.preisCent, 1390);      // nur in Charge 1
assert.equal(vorschlag.Masthuhn.maxProBestellung, 4);
assert.equal(vorschlag.Eiernudeln.preisCent, 500);     // jüngste Charge gewinnt
assert.equal(vorschlag.Eiernudeln.ausCharge, 'Neuer');
assert.equal(vorschlag.Honig.preisCent, null);         // noch nie verkauft, kein Startpreis
roh.exec(`UPDATE produkte SET startpreis_cent = 1200 WHERE name = 'Honig'`);
assert.equal((await preisVorschlaege(db)).find((v) => v.name === 'Honig').preisCent, 1200); // Startpreis
roh.exec(`UPDATE produkte SET startpreis_cent = 777 WHERE name = 'Eiernudeln'`);
assert.equal((await preisVorschlaege(db)).find((v) => v.name === 'Eiernudeln').preisCent, 500); // letzte Charge schlägt Startpreis
console.log('✓ Preisvorschläge aus der letzten Charge je Produkt, sonst Startpreis');

// Voranmeldungen: anlegen, prüfen, in eine Charge übernehmen
const heuer = new Date().getUTCFullYear();
roh.exec(`INSERT INTO chargen (titel, bestellschluss, erstellt_am) VALUES ('Herbst', '2026-10-01', datetime('now', '+2 day'))`);
const cHerbst = roh.prepare('SELECT MAX(id) id FROM chargen').get().id;
roh.prepare('INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent, max_pro_bestellung) VALUES (?, 1, 1450, 4, 2)').run(cHerbst);
roh.prepare('INSERT INTO charge_artikel (charge_id, produkt_id, preis_cent, kontingent) VALUES (?, 2, 500, 10)').run(cHerbst);
const honigId = roh.prepare(`SELECT id FROM produkte WHERE name = 'Honig'`).get().id;
const va = [];
va.push(await voranmeldungAnlegen(db, { kundeId: 2, produktId: 1, menge: 3, zeitraum: 'herbst', jahr: heuer, quelle: 'whatsapp' }));
va.push(await voranmeldungAnlegen(db, { kundeId: 1, produktId: 1, menge: 1, zeitraum: 'naechste', jahr: heuer }));
va.push(await voranmeldungAnlegen(db, { kundeId: 1, produktId: 2, menge: 3, zeitraum: 'naechste' }));
va.push(await voranmeldungAnlegen(db, { kundeId: 3, produktId: 1, menge: 2, zeitraum: 'herbst', jahr: heuer }));
va.push(await voranmeldungAnlegen(db, { kundeId: 3, produktId: honigId, menge: 1, zeitraum: 'herbst', jahr: heuer }));
assert.equal(roh.prepare('SELECT jahr FROM voranmeldungen WHERE id = ?').get(va[1]).jahr, null); // „nächste" ohne Jahr
await fehler(() => voranmeldungAnlegen(db, { kundeId: 1, produktId: 1, menge: 1, zeitraum: 'ostern', jahr: heuer }), /Zeitraum/);
await fehler(() => voranmeldungAnlegen(db, { kundeId: 1, produktId: 1, menge: 1, zeitraum: 'herbst', jahr: heuer + 5 }), /Jahr/);
await fehler(() => voranmeldungAnlegen(db, { kundeId: 1, produktId: 1, menge: 0, zeitraum: 'herbst', jahr: heuer }), /Menge/);
try { roh.exec(`INSERT INTO voranmeldungen (kunde_id, produkt_id, menge, zeitraum) VALUES (1, 1, 1, 'herbst')`); assert.fail(); }
catch (e) { assert.match(e.message, /CHECK/); }
const summe1 = roh.prepare(`SELECT menge, kunden FROM v_voranmeldungen_summe WHERE produkt_id = 1 AND zeitraum = 'herbst'`).get();
assert.deepEqual([summe1.menge, summe1.kunden], [5, 2]);
console.log('✓ Voranmeldungen anlegen, Eingaben prüfen, Summe je Zeitraum (Herbst: 5 Hühner, 2 Kunden)');

const uebernahme = await voranmeldungenUebernehmen(db, cHerbst, va);
const status = uebernahme.bestellungen.map((b) => [b.kundeId, b.status]);
// Kunde 2 kam zuerst (3 Hühner, trotz Höchstmenge 2), dann Kunde 1 (1 Huhn + Nudeln) → 4 von 4;
// Kunde 3 (2 Hühner) passt nicht mehr → Warteliste
assert.deepEqual(status, [[2, 'vorgemerkt'], [1, 'vorgemerkt'], [3, 'warteliste']]);
assert.deepEqual(uebernahme.uebersprungen, [va[4]]); // Honig ist nicht in der Charge
const k1 = uebernahme.bestellungen.find((b) => b.kundeId === 1);
assert.equal(roh.prepare('SELECT COUNT(*) n FROM bestell_positionen WHERE bestellung_id = ?').get(k1.id).n, 2);
assert.equal(roh.prepare(`SELECT COUNT(*) n FROM voranmeldungen WHERE status = 'uebernommen' AND bestellung_id IS NOT NULL`).get().n, 4);
assert.equal(roh.prepare('SELECT status FROM voranmeldungen WHERE id = ?').get(va[4]).status, 'offen');
const nochmal = await voranmeldungenUebernehmen(db, cHerbst, va);
assert.equal(nochmal.bestellungen.length, 0); // nichts doppelt übernommen
console.log('✓ Übernahme: je Kunde eine Bestellung, wer zuerst kam zuerst, Rest auf Warteliste, nichts doppelt');

// Produktdatei: in leerer Datenbank einspielbar, zweimal ohne Doppelte
{
  const leer = new DatabaseSync(':memory:');
  leer.exec(schema);
  const produkte = readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8');
  leer.exec(produkte);
  leer.exec(produkte);
  const zeilen = leer.prepare('SELECT name, art, kategorie, startpreis_cent FROM produkte ORDER BY id').all();
  assert.equal(new Set(zeilen.map((z) => z.name)).size, zeilen.length);
  const plz = leer.prepare('SELECT plz FROM liefergebiet ORDER BY tour_reihenfolge').all().map((z) => z.plz);
  assert.deepEqual(plz, ['6252', '6233', '6230', '6250']);
  console.log(`✓ hofladen-produkte.sql: ${zeilen.length} Produkte und ${plz.length} Lieferorte, zweimal einspielbar`);
}

// Bestehende Tabellen bleiben unberührt (Schema legt nur eigene an)
const tabellen = roh.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => r.name);
console.log('Tabellen/Views:', tabellen.join(', '));
assert.ok(!tabellen.some((t) => ['anfragen', 'einheiten', 'buchungen', 'naechte', 'preisperioden'].includes(t)));
console.log('\nAlle Tests bestanden.');
