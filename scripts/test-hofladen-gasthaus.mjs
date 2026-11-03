/* ============================================================
 * TEST – Gänse-Runde mit Gasthäusern (große Mengen je Bestellung)
 * ============================================================
 * Spielt gegen functions/api/verwaltung/[[pfad]].js durch, was bei einer
 * Runde Weidegänse mit zwei Gasthäusern (10–15 Stück) und Privatkunden
 * vorkommt:
 *   – Höchstmenge 2 gilt für die Website, nicht für die Verwaltung
 *   – Wünsche aus Vormerkungen landen in der Bestellung
 *   – Warteliste: Menge senken, dann nachrücken
 *   – eigener Preis je Bestellung (Gasthaus-Preis)
 *   – Einzelgewichte je Stück zwischenspeichern, übergeben, Lieferschein
 *   – Stückzahl ändern / Gesamtgewicht wiegen setzt Einzelgewichte zurück
 *   – Verkauf am Hof mit Einzelgewichten
 *   – ohne Spalte stueckgewichte (Migration fehlt) läuft alles weiter
 *
 * Aufruf (Node 22 oder neuer):  node scripts/test-hofladen-gasthaus.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { d1Nachbau } from './_d1-nachbau.mjs';
import { onRequest } from '../functions/api/verwaltung/[[pfad]].js';

function datenbank({ ohneStueckSpalte = false } = {}) {
  const { roh, db } = d1Nachbau();
  roh.exec(readFileSync(new URL('../schema-hofladen.sql', import.meta.url), 'utf8'));
  roh.exec(readFileSync(new URL('../hofladen-produkte.sql', import.meta.url), 'utf8'));
  // Stand vor migration-2026-11-stueckgewichte.sql nachbauen
  if (ohneStueckSpalte) roh.exec('ALTER TABLE bestell_positionen DROP COLUMN stueckgewichte');
  const env = { DB: db };
  const api = async (methode, pfad, eingabe) => {
    const request = new Request(`https://www.kruckenhaus.at/api/verwaltung/${pfad}`, {
      method: methode,
      headers: eingabe ? { 'Content-Type': 'application/json' } : {},
      body: eingabe ? JSON.stringify(eingabe) : undefined,
    });
    const antwort = await onRequest({ request, env, params: { pfad: pfad.split('/') }, data: { nutzer: 'test@example.at' } });
    return { status: antwort.status, ...(await antwort.json()) };
  };
  return { roh, api };
}
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };

const { roh, api } = datenbank();
const gans = String(roh.prepare("SELECT id FROM produkte WHERE name = 'Gans'").get().id);
const jahr = new Date().getUTCFullYear();

// Vormerkungen mit Wünschen, eine Runde mit 20 Gänsen (Website: höchstens 2)
for (const [name, menge, notiz] of [['Gasthaus Zur Post', 15, 'bitte eher große'], ['Maria Privat', 1, ''], ['Gasthof Sonne', 12, '']]) {
  ok(await api('POST', 'voranmeldung', { kunde: { name }, produktId: gans, menge, zeitraum: 'martini', jahr, quelle: 'telefon', notiz }));
}
const { chargeId } = ok(await api('POST', 'charge', {
  titel: 'Weidegänse Martini', bestellschluss: `${jahr}-11-08`, status: 'entwurf',
  termine: [{ art: 'lieferung', datum: `${jahr}-11-10` }, { art: 'abholung', datum: `${jahr}-11-11`, von: '09:00', bis: '12:00' }],
  artikel: [{ produktId: gans, preisCent: 1900, kontingent: 20, maxProBestellung: 2 }],
}));
let s = ok(await api('GET', 'stand'));
const artikel = s.chargen[0].artikel[0].id;
const [tLief] = s.chargen[0].termine.filter((t) => t.art === 'lieferung').map((t) => t.id);
const vIds = s.voranmeldungen.map((v) => v.id);
const u = ok(await api('POST', 'voranmeldungen/uebernehmen', { chargeId, ids: vIds }));
s = ok(await api('GET', 'stand'));
const kunde = (name) => s.kunden.find((k) => k.name === name).id;
const bestellungVon = (name) => s.bestellungen.find((b) => b.kundeId === kunde(name));
assert.deepEqual(u.bestellungen.map((b) => b.status), ['vorgemerkt', 'vorgemerkt', 'warteliste']);
assert.equal(bestellungVon('Gasthaus Zur Post').positionen[0].menge, 15, 'Höchstmenge gilt nicht für die Verwaltung');
assert.equal(bestellungVon('Gasthaus Zur Post').anmerkung, 'bitte eher große');
assert.equal(bestellungVon('Maria Privat').anmerkung, '');
console.log('✓ Vormerkungen übernommen: 15 trotz Höchstmenge, Wunsch steht in der Bestellung');

// Warteliste: Gasthof Sonne wollte 12, frei sind 4 → auf 4 senken, nachrücken
const sonne = bestellungVon('Gasthof Sonne');
let r = await api('POST', `bestellung/${sonne.id}`, { aktion: 'nachruecken' });
assert.equal(r.bestellung.status, 'warteliste', 'reicht nicht – bleibt auf der Warteliste');
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'position', artikelId: artikel, menge: 4 }));
r = ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'nachruecken', mail: false }));
assert.equal(r.bestellung.status, 'vorgemerkt');
assert.equal(roh.prepare('SELECT frei FROM v_bestand WHERE charge_artikel_id = ?').get(Number(artikel)).frei, 0);
// Vorgemerkt gilt wieder die freie Menge
r = await api('POST', `bestellung/${sonne.id}`, { aktion: 'position', artikelId: artikel, menge: 5 });
assert.equal(r.status, 400);
assert.match(r.error, /Nicht genug frei/);
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'termin', terminId: tLief }));
console.log('✓ Warteliste: Menge gesenkt, nachgerückt; vorgemerkt nicht über die Menge');

// Gasthaus-Preis: eigener Preis nur für diese Bestellung (Rundenpreis bleibt)
{
  const postId = bestellungVon('Gasthaus Zur Post').id;
  const posId = bestellungVon('Gasthaus Zur Post').positionen[0].id;
  ok(await api('POST', `bestellung/${postId}`, { aktion: 'preis', positionId: posId, preisCent: 1700 }));
  s = ok(await api('GET', 'stand'));
  assert.equal(bestellungVon('Gasthaus Zur Post').positionen[0].einzelpreisCent, 1700);
  assert.equal(bestellungVon('Maria Privat').positionen[0].einzelpreisCent, 1900, 'andere Bestellungen unverändert');
  assert.equal(s.chargen[0].artikel[0].preisCent, 1900, 'Rundenpreis unverändert');
  // Menge ändern behält den eigenen Preis
  ok(await api('POST', `bestellung/${postId}`, { aktion: 'position', artikelId: artikel, menge: 14 }));
  ok(await api('POST', `bestellung/${postId}`, { aktion: 'position', artikelId: artikel, menge: 15 }));
  assert.equal(roh.prepare('SELECT einzelpreis_cent FROM bestell_positionen WHERE id = ?').get(Number(posId)).einzelpreis_cent, 1700);
  // fremde Position oder ungültiger Preis → abgelehnt
  const mariaPos = bestellungVon('Maria Privat').positionen[0].id;
  assert.equal((await api('POST', `bestellung/${postId}`, { aktion: 'preis', positionId: mariaPos, preisCent: 100 })).status, 400);
  assert.equal((await api('POST', `bestellung/${postId}`, { aktion: 'preis', positionId: posId, preisCent: -5 })).status, 400);
  // auch auf der Warteliste möglich
  ok(await api('POST', `bestellung/${bestellungVon('Gasthof Sonne').id}`, { aktion: 'preis', positionId: bestellungVon('Gasthof Sonne').positionen[0].id, preisCent: 1750 }));
}
// Gasthaus-Preis gleich beim Erfassen
{
  const st = ok(await api('GET', 'stand'));
  const t = st.chargen[0].termine.find((x) => x.art === 'abholung').id;
  const neu = ok(await api('POST', 'bestellung', { chargeId, kunde: { name: 'Gasthaus Erfasst' }, terminId: t,
    positionen: [{ artikelId: artikel, menge: 1, preisCent: 1650 }] }));
  const z = roh.prepare('SELECT einzelpreis_cent FROM bestell_positionen WHERE bestellung_id = ?').get(neu.bestellung.id);
  assert.equal(z.einzelpreis_cent, 1650);
  ok(await api('POST', `bestellung/${neu.bestellung.id}`, { aktion: 'stornieren', mail: false }));
}
console.log('✓ Gasthaus-Preis je Bestellung: beim Erfassen und nachträglich, bleibt beim Mengenändern, nur eigene Position');

// Einzelgewichte bei der Übergabe: zwischenspeichern, dann übergeben
const post = bestellungVon('Gasthaus Zur Post');
const pos = post.positionen[0];
ok(await api('POST', `bestellung/${post.id}`, { aktion: 'termin', terminId: tLief }));
r = await api('POST', `bestellung/${post.id}`, { aktion: 'stueck', positionId: pos.id, gewichte: [3500] });
assert.equal(r.status, 400, 'Anzahl muss zur Stückzahl passen');
const teil = Array.from({ length: 15 }, (_, i) => (i < 6 ? 3400 + i * 100 : null));
r = ok(await api('POST', `bestellung/${post.id}`, { aktion: 'stueck', positionId: pos.id, gewichte: teil }));
assert.equal(r.gespeichert, true);
s = ok(await api('GET', 'stand'));
let p = bestellungVon('Gasthaus Zur Post').positionen[0];
assert.deepEqual(p.stueckG, teil, 'teilweise gewogen übersteht das Neuladen');
assert.equal(p.gewichtG, undefined, 'unvollständig – noch kein Gewicht für die Abrechnung');
const alle = Array.from({ length: 15 }, (_, i) => 3400 + i * 100);
const summe = alle.reduce((x, g) => x + g, 0);
ok(await api('POST', `bestellung/${post.id}`, { aktion: 'stueck', positionId: pos.id, gewichte: alle }));
s = ok(await api('GET', 'stand'));
p = bestellungVon('Gasthaus Zur Post').positionen[0];
assert.equal(p.gewichtG, summe, 'alle Stücke gewogen → Summe zählt');
r = await api('POST', `bestellung/${post.id}`, { aktion: 'abschliessen', zahlung: 'ueberweisung', gewichte: [{ positionId: pos.id, gewichtG: 1, stueck: alle }] });
ok(r);
const zeile = roh.prepare('SELECT gewicht_g, stueckgewichte FROM bestell_positionen WHERE id = ?').get(Number(pos.id));
assert.equal(zeile.gewicht_g, summe, 'Summe der Einzelgewichte gilt, nicht das mitgeschickte Gewicht');
assert.equal(zeile.stueckgewichte, alle.join(','));
const betrag = roh.prepare('SELECT gesamt_cent, geschaetzt FROM v_bestellsummen WHERE bestellung_id = ?').get(Number(post.id));
assert.deepEqual([betrag.gesamt_cent, betrag.geschaetzt], [Math.round(1700 * summe / 1000), 0], 'mit Gasthaus-Preis 17 €/kg');
r = await api('POST', `bestellung/${post.id}`, { aktion: 'stueck', positionId: pos.id, gewichte: alle });
assert.equal(r.status, 400, 'nach der Übergabe nicht mehr');
ok(await api('POST', `bestellung/${post.id}`, { aktion: 'bezahlt', art: 'ueberweisung' }));
r = await api('POST', `bestellung/${post.id}`, { aktion: 'preis', positionId: pos.id, preisCent: 1000 });
assert.equal(r.status, 400, 'nach dem Bezahlen kein neuer Preis');
console.log(`✓ 15 Einzelgewichte: zwischengespeichert, übergeben, ${(summe / 1000).toFixed(1)} kg × 17 €/kg = ${(betrag.gesamt_cent / 100).toFixed(2)} €`);

// Übergabe mit Einzelgewichten, aber eines fehlt → abgelehnt
const sonnePos = bestellungVon('Gasthof Sonne').positionen[0];
r = await api('POST', `bestellung/${sonne.id}`, { aktion: 'abschliessen', zahlung: 'bar', gewichte: [{ positionId: sonnePos.id, gewichtG: 9000, stueck: [3000, 3000, 3000, null] }] });
assert.equal(r.status, 400);
assert.equal(r.error, 'Bitte alle Gewichte eintragen.');
// Stückzahl ändern bzw. als Ganzes wiegen setzt Einzelgewichte zurück
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'stueck', positionId: sonnePos.id, gewichte: [3000, 3100, 3200, 3300] }));
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'position', artikelId: artikel, menge: 3 }));
let z = roh.prepare('SELECT menge, gewicht_g, stueckgewichte FROM bestell_positionen WHERE id = ?').get(Number(sonnePos.id));
assert.deepEqual([z.menge, z.gewicht_g, z.stueckgewichte], [3, null, null]);
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'stueck', positionId: sonnePos.id, gewichte: [3000, 3100, 3200] }));
ok(await api('POST', `bestellung/${sonne.id}`, { aktion: 'gewicht', positionId: sonnePos.id, gewichtG: 9500 }));
z = roh.prepare('SELECT gewicht_g, stueckgewichte FROM bestell_positionen WHERE id = ?').get(Number(sonnePos.id));
assert.deepEqual([z.gewicht_g, z.stueckgewichte], [9500, null]);
console.log('✓ Fehlendes Gewicht abgelehnt; Stückzahl ändern / Gesamtgewicht setzt Einzelgewichte zurück');

// Verkauf am Hof mit Einzelgewichten (eine Gans ist durch die Änderung frei)
r = ok(await api('POST', 'hofverkauf', { chargeId, zahlung: 'bar', positionen: [{ artikelId: artikel, menge: 1, gewichtG: 1, stueck: [4100] }] }));
z = roh.prepare(`SELECT p.gewicht_g, p.stueckgewichte FROM bestell_positionen p JOIN bestellungen b ON b.id = p.bestellung_id
                 WHERE b.nummer = ?`).get(r.bestellung.nummer);
assert.deepEqual([z.gewicht_g, z.stueckgewichte], [4100, '4100']);
console.log('✓ Verkauf am Hof: Einzelgewichte gespeichert');

// Ohne Spalte stueckgewichte (Migration noch nicht eingespielt)
{
  const alt = datenbank({ ohneStueckSpalte: true });
  const { chargeId: cid } = ok(await alt.api('POST', 'charge', {
    titel: 'Gänse', bestellschluss: `${jahr}-11-08`, status: 'offen',
    termine: [{ art: 'abholung', datum: `${jahr}-11-11` }],
    artikel: [{ produktId: gans, preisCent: 1900, kontingent: 20 }],
  }));
  let st = ok(await alt.api('GET', 'stand'));
  const a = st.chargen[0].artikel[0].id;
  const best = ok(await alt.api('POST', 'bestellung', { chargeId: cid, kunde: { name: 'Gasthaus Alt' }, terminId: st.chargen[0].termine[0].id, positionen: [{ artikelId: a, menge: 2 }] }));
  st = ok(await alt.api('GET', 'stand'));
  const ps = st.bestellungen[0].positionen[0];
  assert.equal(ps.stueckG, undefined);
  const zw = ok(await alt.api('POST', `bestellung/${best.bestellung.id}`, { aktion: 'stueck', positionId: ps.id, gewichte: [3000, 3500] }));
  assert.equal(zw.gespeichert, false, 'ohne Spalte nichts gespeichert, aber kein Fehler');
  ok(await alt.api('POST', `bestellung/${best.bestellung.id}`, { aktion: 'abschliessen', zahlung: 'bar', gewichte: [{ positionId: ps.id, gewichtG: 6500, stueck: [3000, 3500] }] }));
  ok(await alt.api('POST', `bestellung/${best.bestellung.id}`, { aktion: 'position', artikelId: a, menge: 2 }));
  assert.equal(alt.roh.prepare('SELECT gewicht_g FROM bestell_positionen').get().gewicht_g, 6500);
  ok(await alt.api('POST', 'hofverkauf', { chargeId: cid, zahlung: 'bar', positionen: [{ artikelId: a, menge: 1, gewichtG: 1, stueck: [3900] }] }));
  console.log('✓ Ohne Migration: Übergabe, Verkauf am Hof und Menge ändern laufen wie bisher');
}

console.log('\nAlle Tests der Gänse-Runde bestanden.');
